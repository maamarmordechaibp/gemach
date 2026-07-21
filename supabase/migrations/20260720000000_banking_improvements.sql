-- ============================================================================
-- Banking system improvements migration
-- Date: 2026-07-20
--
-- Adds:
--   1. Overdraft as an account product (customers.account_type, overdraft_limit)
--   4. Loan remaining balance / original amount / linked account number
--   5. Donation now correctly debits the donor's balance
--   9. process_transfer() stored procedure (validated account-to-account transfer)
--  10. pay_loan_from_account() stored procedure (pay a loan from account balance)
--  11. Optional notes on deposits & withdrawals (process_transaction_v2 memos)
--  12. Multiple transfers per transaction (process_transaction_v2 p_transfers)
--
-- Safe to run multiple times (idempotent guards where practical).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. OVERDRAFT PRODUCT — attributes on the customer account
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS overdraft_limit numeric(15,2) NOT NULL DEFAULT 0.00;

-- ----------------------------------------------------------------------------
-- 4. LOAN SCHEMA — original amount, remaining balance, linked account number
-- ----------------------------------------------------------------------------
ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS original_amount numeric(15,2);

ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS remaining_balance numeric(15,2);

ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS account_number text;

-- Backfill existing loans.
--   * remaining_balance: 0 for paid loans, else the current `amount`
--     (older code reduced `amount` on each repayment, so it holds the balance).
--   * original_amount: current `amount` + everything already repaid against it.
--   * account_number: the owning customer's account number.
UPDATE public.loans l SET
    remaining_balance = CASE WHEN l.status = 'paid' THEN 0 ELSE COALESCE(l.amount, 0) END,
    original_amount = COALESCE(l.amount, 0) + COALESCE((
        SELECT SUM(t.amount)
        FROM public.transactions t
        WHERE t.loan_id = l.id
          AND t.type = 'credit'
          AND t.status <> 'voided'
    ), 0),
    account_number = COALESCE(l.account_number, (
        SELECT c.account_number FROM public.customers c WHERE c.id = l.customer_id
    ))
WHERE l.remaining_balance IS NULL OR l.original_amount IS NULL OR l.account_number IS NULL;

-- From now on `amount` consistently means the ORIGINAL disbursed amount.
UPDATE public.loans SET amount = original_amount
WHERE original_amount IS NOT NULL AND amount <> original_amount;

-- ----------------------------------------------------------------------------
-- 5. DONATION — debit the donor as part of the same procedure
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_donation(p_customer_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_fee_tx_id text;
    v_customer_name text;
    v_customer_account text;
BEGIN
    SELECT first_name || ' ' || last_name, account_number
    INTO v_customer_name, v_customer_account
    FROM customers WHERE id = p_customer_id;

    IF v_customer_name IS NULL THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Donation amount must be positive';
    END IF;

    v_fee_tx_id := 'DONATION-' || to_char(now(), 'YYYYMMDDHH24MISSMS');

    INSERT INTO transactions(id, account_number, type, amount, date, status, memo)
    VALUES (v_fee_tx_id, v_customer_account, 'fee', p_amount, now(), 'completed', 'Donation from ' || v_customer_name);

    -- Debit the donor (this proc is now the single source of truth for the balance).
    UPDATE customers SET balance = balance - p_amount WHERE id = p_customer_id;

    -- Credit the FEES account.
    UPDATE customers SET balance = balance + p_amount WHERE account_number = 'FEES';
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. TRANSFER — validated, atomic account-to-account transfer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_transfer(
    p_from_account text,
    p_to_account text,
    p_amount numeric,
    p_date timestamptz DEFAULT now(),
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_from customers%ROWTYPE;
    v_to customers%ROWTYPE;
    v_available numeric;
    v_out_id text;
    v_in_id text;
    v_note text;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be positive';
    END IF;
    IF p_from_account = p_to_account THEN
        RAISE EXCEPTION 'Cannot transfer to the same account';
    END IF;

    SELECT * INTO v_from FROM customers WHERE account_number = p_from_account;
    IF v_from.id IS NULL THEN RAISE EXCEPTION 'Source account not found'; END IF;

    SELECT * INTO v_to FROM customers WHERE account_number = p_to_account;
    IF v_to.id IS NULL THEN RAISE EXCEPTION 'Destination account not found'; END IF;

    -- Available funds include the account's overdraft limit.
    v_available := v_from.balance + COALESCE(v_from.overdraft_limit, 0);
    IF p_amount > v_available THEN
        RAISE EXCEPTION 'Insufficient funds in source account (available: %)', v_available;
    END IF;

    v_note := NULLIF(trim(COALESCE(p_note, '')), '');

    v_out_id := 'XFER-OUT-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*100000)::int::text;
    INSERT INTO transactions (id, account_number, type, amount, date, status, memo, related_transfer_id)
    VALUES (v_out_id, p_from_account, 'debit', p_amount, p_date, 'completed',
            'Transfer to ' || p_to_account || COALESCE(' — ' || v_note, ''), NULL);

    v_in_id := 'XFER-IN-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*100000)::int::text;
    INSERT INTO transactions (id, account_number, type, amount, date, status, memo, related_transfer_id)
    VALUES (v_in_id, p_to_account, 'credit', p_amount, p_date, 'completed',
            'Transfer from ' || p_from_account || COALESCE(' — ' || v_note, ''), v_out_id);

    UPDATE transactions SET related_transfer_id = v_in_id WHERE id = v_out_id;

    UPDATE customers SET balance = balance - p_amount WHERE id = v_from.id;
    UPDATE customers SET balance = balance + p_amount WHERE id = v_to.id;

    RETURN jsonb_build_object('out_id', v_out_id, 'in_id', v_in_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. PAY MY LOAN — pay a loan directly from the customer's account balance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_loan_from_account(
    p_customer_id uuid,
    p_loan_id uuid,
    p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_customer customers%ROWTYPE;
    v_loan loans%ROWTYPE;
    v_remaining numeric;
    v_payment numeric;
    v_new_remaining numeric;
    v_new_status text;
    v_tx_id text;
    v_available numeric;
BEGIN
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;

    SELECT * INTO v_loan FROM loans WHERE id = p_loan_id;
    IF v_loan.id IS NULL THEN RAISE EXCEPTION 'Loan not found'; END IF;
    IF v_loan.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Loan does not belong to this customer';
    END IF;

    v_remaining := COALESCE(v_loan.remaining_balance, v_loan.amount, 0);
    IF v_remaining <= 0 OR v_loan.status = 'paid' THEN
        RAISE EXCEPTION 'Loan is already paid off';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    -- Never pay more than what is owed.
    v_payment := LEAST(p_amount, v_remaining);

    -- Enforce available funds (balance + overdraft).
    v_available := v_customer.balance + COALESCE(v_customer.overdraft_limit, 0);
    IF v_payment > v_available THEN
        RAISE EXCEPTION 'Insufficient account balance for this payment';
    END IF;

    v_new_remaining := v_remaining - v_payment;
    v_new_status := CASE WHEN v_new_remaining <= 0.001 THEN 'paid' ELSE v_loan.status END;

    UPDATE loans
    SET remaining_balance = GREATEST(0, v_new_remaining),
        status = v_new_status
    WHERE id = p_loan_id;

    v_tx_id := 'REPAY-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || left(p_loan_id::text, 8);
    INSERT INTO transactions (id, account_number, type, amount, date, status, memo, loan_id)
    VALUES (v_tx_id, v_customer.account_number, 'debit', v_payment, now(), 'completed',
            'Loan Payment from account', p_loan_id);

    -- Paying a loan from the account reduces the account balance.
    UPDATE customers SET balance = balance - v_payment WHERE id = p_customer_id;

    RETURN jsonb_build_object(
        'transaction_id', v_tx_id,
        'payment', v_payment,
        'remaining_balance', GREATEST(0, v_new_remaining),
        'status', v_new_status
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4 + 11. process_transaction_v2 — loan remaining balance, linked account,
--          overdraft-aware, and optional deposit/withdrawal notes.
--          New trailing params keep the old call signature working.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_transaction_v2(
    p_customer_id uuid,
    p_account_number text,
    p_credit_cash numeric,
    p_credit_checks jsonb,
    p_debit_cash_entries jsonb,
    p_debit_checks jsonb,
    p_transfer_amount numeric,
    p_transfer_to_account text,
    p_apply_fee boolean,
    p_loan_to_create jsonb DEFAULT NULL::jsonb,
    p_loan_to_repay jsonb DEFAULT NULL::jsonb,
    p_credit_memo text DEFAULT NULL::text,
    p_debit_memo text DEFAULT NULL::text,
    p_transfers jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
    DECLARE
        v_balance_change numeric := 0;
        v_credit_tx_id text;
        v_debit_tx_id text;
        v_transfer_tx_id_from text;
        v_transfer_tx_id_to text;
        v_fee_tx_id text;
        v_fee_amount numeric := 0;
        v_credit_check record;
        v_debit_check record;
        v_cash_debit_entry record;
        v_transfer record;
        v_new_loan_id uuid;
        v_target_customer_id uuid;
        v_fee_memo text;
        v_next_check_num integer;
        v_customer_name text;
        v_transaction_ids text[] := ARRAY[]::text[];
        v_credit_note text;
        v_debit_note text;
        v_repay_amount numeric;
        v_repay_remaining numeric;
    BEGIN
        SELECT first_name || ' ' || last_name INTO v_customer_name FROM customers WHERE id = p_customer_id;

        v_credit_note := NULLIF(trim(COALESCE(p_credit_memo, '')), '');
        v_debit_note := NULLIF(trim(COALESCE(p_debit_memo, '')), '');

        -- Loan repayment: reduce the outstanding balance, mark paid when cleared.
        IF p_loan_to_repay IS NOT NULL THEN
            SELECT COALESCE(remaining_balance, amount, 0) INTO v_repay_remaining
            FROM loans WHERE id = (p_loan_to_repay->>'id')::uuid;

            v_repay_amount := COALESCE((p_loan_to_repay->>'amount')::numeric, v_repay_remaining);
            v_repay_amount := LEAST(v_repay_amount, v_repay_remaining);

            UPDATE loans
            SET remaining_balance = GREATEST(0, COALESCE(remaining_balance, amount, 0) - v_repay_amount),
                status = CASE WHEN COALESCE(remaining_balance, amount, 0) - v_repay_amount <= 0.001 THEN 'paid' ELSE status END
            WHERE id = (p_loan_to_repay->>'id')::uuid;
        END IF;

        IF p_transfers IS NOT NULL AND jsonb_array_length(p_transfers) > 0 THEN
            -- Multiple transfers: an array of { toaccount, amount } objects.
            FOR v_transfer IN SELECT * FROM jsonb_to_recordset(p_transfers) AS x(toaccount text, amount numeric) LOOP
                IF v_transfer.amount IS NULL OR v_transfer.amount <= 0 OR NULLIF(trim(COALESCE(v_transfer.toaccount, '')), '') IS NULL THEN
                    CONTINUE;
                END IF;

                SELECT id INTO v_target_customer_id FROM customers WHERE account_number = v_transfer.toaccount;
                IF v_target_customer_id IS NULL THEN RAISE EXCEPTION 'Recipient account % not found', v_transfer.toaccount; END IF;

                v_transfer_tx_id_from := 'XFER-OUT-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*1000000)::int::text;
                INSERT INTO transactions (id, account_number, type, amount, date, status, memo) VALUES (v_transfer_tx_id_from, p_account_number, 'debit', v_transfer.amount, now(), 'completed', 'Transfer to ' || v_transfer.toaccount);
                v_transaction_ids := array_append(v_transaction_ids, v_transfer_tx_id_from);
                v_balance_change := v_balance_change - v_transfer.amount;

                v_transfer_tx_id_to := 'XFER-IN-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*1000000)::int::text;
                INSERT INTO transactions (id, account_number, type, amount, date, status, memo) VALUES (v_transfer_tx_id_to, v_transfer.toaccount, 'credit', v_transfer.amount, now(), 'completed', 'Transfer from ' || p_account_number);
                UPDATE customers SET balance = balance + v_transfer.amount WHERE id = v_target_customer_id;
            END LOOP;
        ELSIF p_transfer_amount > 0 AND p_transfer_to_account IS NOT NULL THEN
            SELECT id INTO v_target_customer_id FROM customers WHERE account_number = p_transfer_to_account;
            IF v_target_customer_id IS NULL THEN RAISE EXCEPTION 'Recipient account not found'; END IF;

            v_transfer_tx_id_from := 'XFER-OUT-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
            INSERT INTO transactions (id, account_number, type, amount, date, status, memo) VALUES (v_transfer_tx_id_from, p_account_number, 'debit', p_transfer_amount, now(), 'completed', 'Transfer to ' || p_transfer_to_account);
            v_transaction_ids := array_append(v_transaction_ids, v_transfer_tx_id_from);
            v_balance_change := v_balance_change - p_transfer_amount;

            v_transfer_tx_id_to := 'XFER-IN-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
            INSERT INTO transactions (id, account_number, type, amount, date, status, memo) VALUES (v_transfer_tx_id_to, p_transfer_to_account, 'credit', p_transfer_amount, now(), 'completed', 'Transfer from ' || p_account_number);
            UPDATE customers SET balance = balance + p_transfer_amount WHERE id = v_target_customer_id;
        END IF;

        IF p_credit_cash > 0 THEN
            v_credit_tx_id := 'CREDIT-CASH-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
            INSERT INTO transactions (id, account_number, type, amount, date, status, memo) VALUES (v_credit_tx_id, p_account_number, 'credit', p_credit_cash, now(), 'completed', 'Cash Deposit' || COALESCE(' — ' || v_credit_note, ''));
            v_transaction_ids := array_append(v_transaction_ids, v_credit_tx_id);
            v_balance_change := v_balance_change + p_credit_cash;
        END IF;

        FOR v_credit_check IN SELECT * FROM jsonb_to_recordset(p_credit_checks) AS x(checkNumber text, amount numeric, has_account_number boolean, isOnHold boolean, holdTags text[]) LOOP
            v_credit_tx_id := 'CREDIT-CHECK-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || COALESCE(v_credit_check.checkNumber, 'N' || (random()*1000000)::int::text);
            INSERT INTO transactions (id, account_number, type, amount, date, status, memo)
            VALUES (v_credit_tx_id, p_account_number, 'credit', v_credit_check.amount, now(), 'completed', 'Check Deposit #' || COALESCE(v_credit_check.checkNumber, 'N/A') || (CASE WHEN v_credit_check.isOnHold THEN ' (ON HOLD)' ELSE '' END) || COALESCE(' — ' || v_credit_note, ''));
            v_transaction_ids := array_append(v_transaction_ids, v_credit_tx_id);

            IF v_credit_check.isOnHold = FALSE THEN
              v_balance_change := v_balance_change + v_credit_check.amount;
            END IF;

            INSERT INTO checks_in (transaction_id, account_number, check_number, amount, date, status, has_account_number, is_on_hold, hold_tags)
            VALUES (v_credit_tx_id, p_account_number, COALESCE(v_credit_check.checkNumber, 'N/A'), v_credit_check.amount, now(), CASE WHEN v_credit_check.isOnHold THEN 'hold' ELSE 'pending' END, v_credit_check.has_account_number, v_credit_check.isOnHold, v_credit_check.holdTags);
        END LOOP;

        FOR v_cash_debit_entry IN SELECT * FROM jsonb_to_recordset(p_debit_cash_entries) AS x(amount numeric, "isRush" boolean) LOOP
            v_debit_tx_id := 'DEBIT-CASH-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*1000000)::int::text;
            INSERT INTO transactions (id, account_number, type, amount, date, status, is_rush, memo) VALUES (v_debit_tx_id, p_account_number, 'debit', v_cash_debit_entry.amount, now(), 'completed', v_cash_debit_entry."isRush", 'Cash Withdrawal' || COALESCE(' — ' || v_debit_note, ''));
            v_transaction_ids := array_append(v_transaction_ids, v_debit_tx_id);
            v_balance_change := v_balance_change - v_cash_debit_entry.amount;
        END LOOP;

        FOR v_debit_check IN SELECT * FROM jsonb_to_recordset(p_debit_checks) AS x(payToOrderOf text, amount numeric, memo text, "isRush" boolean) LOOP
            v_next_check_num := public.get_next_check_number();
            v_debit_tx_id := 'DEBIT-CHECK-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || v_next_check_num::text;
            INSERT INTO transactions (id, account_number, type, amount, date, status, is_rush, memo) VALUES (v_debit_tx_id, p_account_number, 'debit', v_debit_check.amount, now(), 'completed', v_debit_check."isRush", 'Check Withdrawal for ' || COALESCE(v_debit_check.payToOrderOf, 'N/A') || ' #' || v_next_check_num::text);
            v_transaction_ids := array_append(v_transaction_ids, v_debit_tx_id);
            v_balance_change := v_balance_change - v_debit_check.amount;
            INSERT INTO checks_out (transaction_id, account_number, check_number, pay_to_order_of, amount, memo, date, status, is_printed, is_rush) VALUES (v_debit_tx_id, p_account_number, v_next_check_num, COALESCE(v_debit_check.payToOrderOf, ''), v_debit_check.amount, v_debit_check.memo, now(), 'pending', false, v_debit_check."isRush");
        END LOOP;

        IF p_apply_fee THEN
            SELECT fee, memo INTO v_fee_amount, v_fee_memo FROM public.calculate_fee_v2(p_account_number, p_debit_cash_entries, p_debit_checks, p_credit_checks);
            IF v_fee_amount > 0 THEN
                v_fee_tx_id := 'FEE-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
                INSERT INTO transactions(id, account_number, type, amount, date, status, memo, fee_details) VALUES (v_fee_tx_id, p_account_number, 'fee', v_fee_amount, now(), 'completed', v_fee_memo, jsonb_build_object('reason', v_fee_memo, 'from_customer', v_customer_name));
                v_transaction_ids := array_append(v_transaction_ids, v_fee_tx_id);
                v_balance_change := v_balance_change - v_fee_amount;
                UPDATE customers SET balance = balance + v_fee_amount WHERE account_number = 'FEES';
            END IF;
        END IF;

        -- Loan disbursement: record original amount, remaining balance and linked account.
        IF p_loan_to_create IS NOT NULL THEN
            INSERT INTO loans (customer_id, amount, original_amount, remaining_balance, account_number, due_date, status)
            VALUES (
                p_customer_id,
                (p_loan_to_create->>'amount')::numeric,
                (p_loan_to_create->>'amount')::numeric,
                (p_loan_to_create->>'amount')::numeric,
                p_account_number,
                (p_loan_to_create->>'due_date')::date,
                'active'
            ) RETURNING id INTO v_new_loan_id;
            v_balance_change := v_balance_change + (p_loan_to_create->>'amount')::numeric;
            UPDATE transactions SET loan_id = v_new_loan_id WHERE id = v_debit_tx_id;
        END IF;

        UPDATE customers SET balance = balance + v_balance_change WHERE id = p_customer_id;

        RETURN jsonb_build_object('transaction_ids', v_transaction_ids);
    END;
    $$;

COMMIT;
