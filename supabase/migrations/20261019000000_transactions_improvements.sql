-- ============================================================================
-- Transactions improvements
-- Date: 2026-10-19
--
--  1. Deposit payment types: QuickPay / Direct Deposit / Other
--     (process_transaction_v2 p_credit_other)
--  2. Waive individual fee types instead of all-or-nothing
--     (calculate_fee_v2 / process_transaction_v2 p_waived_fees). calculate_fee_v2
--     also returns a per-type / per-check fee breakdown used by the receipt.
--  3. Per-transfer notes, written on BOTH the sender's and recipient's rows.
--  4. bounce_check(): atomic bounced-check handling. The previous client-side
--     flow deducted the balance before inserting a reversal row into a column
--     that does not exist (debit_details), leaving half-finished bounces.
--
-- Overloads whose argument lists change are dropped first; otherwise PostgREST
-- calls with named args would be ambiguous between the old and new versions.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 2. calculate_fee_v2 — per-type breakdown + selective waivers
--
-- Fee types (used in p_waived_fees and details[].type):
--   cash_debit       Cash withdrawal fee
--   check_debit      Outgoing (printed) check fee
--   missing_account  Deposited check without an account number
--   rush_cash        Rush cash withdrawal fee
--   rush_check       Rush outgoing check fee
--
-- details: [{ type, label, description, amount, waived, items: [{ index, fee }] }]
--   items[].index is the position in p_debit_checks / p_credit_checks.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.calculate_fee_v2(text, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.calculate_fee_v2(
    p_account_number text,
    p_debit_cash_entries jsonb,
    p_debit_checks jsonb,
    p_credit_checks jsonb,
    p_waived_fees jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(fee numeric, memo text, details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    fee_settings jsonb;
    v_waived text[] := ARRAY[]::text[];
    regular_details jsonb := '[]'::jsonb;
    rush_details jsonb := '[]'::jsonb;
    v_all jsonb;
    v_out jsonb := '[]'::jsonb;
    v_item jsonb;
    v_total numeric := 0;
    v_memo text[] := ARRAY[]::text[];
    v_waived_memo text[] := ARRAY[]::text[];

    cash_debit_config jsonb;
    waiver_config jsonb;
    charge_fee boolean;
    start_date date;
    total_past_debit numeric;
    cash_entry record;
    total_non_rush_cash_debit numeric := 0;
    total_rush_cash_debit numeric := 0;
    v_amount numeric;
    v_desc text;

    check_debit_config jsonb;
    credit_check_config jsonb;
    rush_config jsonb;
    v_elem record;
    v_pos integer;
    v_tier_fee numeric;
    v_items jsonb;
    v_sum numeric;
    rush_checks_count integer;
    v_rush_tier record;
    is_cash_rush boolean := false;
    is_check_rush boolean := false;
BEGIN
    SELECT value INTO fee_settings FROM system_settings WHERE key = 'transaction_fees';
    IF fee_settings IS NULL OR NOT COALESCE((fee_settings->>'enabled')::boolean, false) THEN
        RETURN QUERY SELECT 0::numeric, ''::text, '[]'::jsonb;
        RETURN;
    END IF;

    IF p_waived_fees IS NOT NULL AND jsonb_typeof(p_waived_fees) = 'array' THEN
        SELECT COALESCE(array_agg(w), ARRAY[]::text[]) INTO v_waived FROM jsonb_array_elements_text(p_waived_fees) AS w;
    END IF;

    FOR cash_entry IN SELECT * FROM jsonb_to_recordset(COALESCE(p_debit_cash_entries, '[]'::jsonb)) AS x(amount numeric, "isRush" boolean) LOOP
        IF COALESCE(cash_entry.amount, 0) <= 0 THEN CONTINUE; END IF;
        IF COALESCE(cash_entry."isRush", false) THEN
            total_rush_cash_debit := total_rush_cash_debit + cash_entry.amount;
        ELSE
            total_non_rush_cash_debit := total_non_rush_cash_debit + cash_entry.amount;
        END IF;
    END LOOP;
    is_cash_rush := total_rush_cash_debit > 0;

    -- Cash withdrawal fee
    cash_debit_config := fee_settings->'cash_debit';
    IF COALESCE((cash_debit_config->>'enabled')::boolean, false) AND total_non_rush_cash_debit > 0 THEN
        charge_fee := true;
        waiver_config := cash_debit_config->'waiver';
        IF waiver_config->>'mode' = 'never' THEN
            charge_fee := false;
        ELSIF waiver_config->>'mode' = 'conditional' THEN
            start_date := now() - (waiver_config->>'period_days' || ' days')::interval;
            SELECT COALESCE(SUM(t.amount), 0) INTO total_past_debit
            FROM transactions t
            JOIN jsonb_to_recordset(t.fee_details->'debit_cash_entries') AS y(amount numeric, "isRush" boolean) ON true
            WHERE t.account_number = p_account_number AND t.type = 'debit' AND t.date >= start_date AND y."isRush" = false;
            IF total_past_debit < (waiver_config->>'threshold_amount')::numeric THEN
                charge_fee := false;
            END IF;
        END IF;

        IF charge_fee THEN
            IF cash_debit_config->>'fee_type' = 'flat' THEN
                v_amount := (cash_debit_config->>'fee_value')::numeric;
                v_desc := 'Cash Debit Fee: $' || v_amount;
            ELSE
                v_amount := total_non_rush_cash_debit * (cash_debit_config->>'fee_value')::numeric / 100.0;
                v_desc := 'Cash Debit Fee: ' || (cash_debit_config->>'fee_value')::numeric || '% of $' || total_non_rush_cash_debit;
            END IF;
            regular_details := regular_details || jsonb_build_array(jsonb_build_object(
                'type', 'cash_debit', 'label', 'Cash Withdrawal Fee', 'description', v_desc,
                'amount', v_amount, 'items', '[]'::jsonb));
        END IF;
    END IF;

    -- Outgoing check fee (tiered by the check's position in this transaction)
    check_debit_config := fee_settings->'check_debit';
    IF COALESCE((check_debit_config->>'enabled')::boolean, false) THEN
        v_items := '[]'::jsonb; v_sum := 0; v_pos := 0;
        FOR v_elem IN
            SELECT e.value AS val, (e.ord - 1)::int AS idx
            FROM jsonb_array_elements(COALESCE(p_debit_checks, '[]'::jsonb)) WITH ORDINALITY AS e(value, ord)
        LOOP
            IF COALESCE(NULLIF(v_elem.val->>'amount', '')::numeric, 0) <= 0
               OR COALESCE((v_elem.val->>'isRush')::boolean, false) THEN
                CONTINUE;
            END IF;
            v_pos := v_pos + 1;
            SELECT t.fee INTO v_tier_fee
            FROM jsonb_to_recordset(check_debit_config->'tiers') AS t("from" int, "to" int, fee numeric)
            WHERE v_pos >= t."from" AND (t."to" IS NULL OR v_pos <= t."to")
            ORDER BY t."from" LIMIT 1;
            v_tier_fee := COALESCE(v_tier_fee, 0);
            v_sum := v_sum + v_tier_fee;
            v_items := v_items || jsonb_build_array(jsonb_build_object('index', v_elem.idx, 'fee', v_tier_fee));
        END LOOP;
        IF v_sum > 0 THEN
            regular_details := regular_details || jsonb_build_array(jsonb_build_object(
                'type', 'check_debit', 'label', 'Outgoing Check Fee',
                'description', 'Outgoing Check Fee: ' || v_pos || ' check(s), $' || v_sum,
                'amount', v_sum, 'items', v_items));
        END IF;
    END IF;

    -- Deposited checks without an account number
    credit_check_config := fee_settings->'check_credit_missing_account_number';
    IF COALESCE((credit_check_config->>'enabled')::boolean, false) THEN
        v_items := '[]'::jsonb; v_sum := 0; v_pos := 0;
        FOR v_elem IN
            SELECT e.value AS val, (e.ord - 1)::int AS idx
            FROM jsonb_array_elements(COALESCE(p_credit_checks, '[]'::jsonb)) WITH ORDINALITY AS e(value, ord)
        LOOP
            IF COALESCE(NULLIF(v_elem.val->>'amount', '')::numeric, 0) <= 0
               OR COALESCE((v_elem.val->>'has_account_number')::boolean, true) THEN
                CONTINUE;
            END IF;
            v_pos := v_pos + 1;
            SELECT t.fee INTO v_tier_fee
            FROM jsonb_to_recordset(credit_check_config->'tiers') AS t("from" int, "to" int, fee numeric)
            WHERE v_pos >= t."from" AND (t."to" IS NULL OR v_pos <= t."to")
            ORDER BY t."from" LIMIT 1;
            v_tier_fee := COALESCE(v_tier_fee, 0);
            v_sum := v_sum + v_tier_fee;
            v_items := v_items || jsonb_build_array(jsonb_build_object('index', v_elem.idx, 'fee', v_tier_fee));
        END LOOP;
        IF v_sum > 0 THEN
            regular_details := regular_details || jsonb_build_array(jsonb_build_object(
                'type', 'missing_account', 'label', 'Missing Account # Fee',
                'description', 'Missing Acct # Fee: ' || v_pos || ' check(s), $' || v_sum,
                'amount', v_sum, 'items', v_items));
        END IF;
    END IF;

    -- Rush fees
    rush_config := fee_settings->'rush_fee';
    SELECT COUNT(*) INTO rush_checks_count
    FROM jsonb_array_elements(COALESCE(p_debit_checks, '[]'::jsonb)) AS e(value)
    WHERE COALESCE((e.value->>'isRush')::boolean, false) AND COALESCE(NULLIF(e.value->>'amount', '')::numeric, 0) > 0;
    is_check_rush := rush_checks_count > 0;

    IF COALESCE((rush_config->>'enabled')::boolean, false) THEN
        IF is_cash_rush THEN
            FOR v_rush_tier IN SELECT * FROM jsonb_to_recordset(rush_config->'cash'->'tiers') AS x("from" numeric, "to" numeric, fee numeric, fee_type text) LOOP
                IF total_rush_cash_debit >= v_rush_tier."from" AND (v_rush_tier."to" IS NULL OR total_rush_cash_debit <= v_rush_tier."to") THEN
                    v_amount := CASE WHEN v_rush_tier.fee_type = 'flat' THEN v_rush_tier.fee
                                     ELSE total_rush_cash_debit * v_rush_tier.fee / 100.0 END;
                    rush_details := rush_details || jsonb_build_array(jsonb_build_object(
                        'type', 'rush_cash', 'label', 'Rush Cash Fee', 'description', 'Rush Cash Fee',
                        'amount', v_amount, 'items', '[]'::jsonb));
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF is_check_rush THEN
            FOR v_rush_tier IN SELECT * FROM jsonb_to_recordset(rush_config->'check'->'tiers') AS x("from" int, "to" int, fee numeric, fee_type text) LOOP
                IF rush_checks_count >= v_rush_tier."from" AND (v_rush_tier."to" IS NULL OR rush_checks_count <= v_rush_tier."to") THEN
                    v_items := '[]'::jsonb; v_sum := 0;
                    FOR v_elem IN
                        SELECT e.value AS val, (e.ord - 1)::int AS idx
                        FROM jsonb_array_elements(p_debit_checks) WITH ORDINALITY AS e(value, ord)
                    LOOP
                        IF NOT COALESCE((v_elem.val->>'isRush')::boolean, false)
                           OR COALESCE(NULLIF(v_elem.val->>'amount', '')::numeric, 0) <= 0 THEN
                            CONTINUE;
                        END IF;
                        v_tier_fee := CASE WHEN v_rush_tier.fee_type = 'flat' THEN v_rush_tier.fee
                                           ELSE NULLIF(v_elem.val->>'amount', '')::numeric * v_rush_tier.fee / 100.0 END;
                        v_sum := v_sum + v_tier_fee;
                        v_items := v_items || jsonb_build_array(jsonb_build_object('index', v_elem.idx, 'fee', v_tier_fee));
                    END LOOP;
                    rush_details := rush_details || jsonb_build_array(jsonb_build_object(
                        'type', 'rush_check', 'label', 'Rush Check Fee', 'description', 'Rush Check Fee',
                        'amount', v_sum, 'items', v_items));
                    EXIT;
                END IF;
            END LOOP;
        END IF;
    END IF;

    IF (is_cash_rush OR is_check_rush) AND COALESCE((rush_config->'overwrite')::boolean, false) THEN
        v_all := rush_details;
    ELSE
        v_all := regular_details || rush_details;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_all) LOOP
        IF (v_item->>'type') = ANY(v_waived) THEN
            v_item := v_item || jsonb_build_object('waived', true);
            v_waived_memo := array_append(v_waived_memo, v_item->>'label');
        ELSE
            v_item := v_item || jsonb_build_object('waived', false);
            v_total := v_total + COALESCE((v_item->>'amount')::numeric, 0);
            v_memo := array_append(v_memo, v_item->>'description');
        END IF;
        v_out := v_out || jsonb_build_array(v_item);
    END LOOP;

    RETURN QUERY SELECT
        v_total,
        array_to_string(v_memo, ', ')
            || CASE WHEN COALESCE(array_length(v_waived_memo, 1), 0) > 0
                    THEN ' (waived: ' || array_to_string(v_waived_memo, ', ') || ')' ELSE '' END,
        v_out;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 1 + 2 + 3. process_transaction_v2
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_transaction_v2(uuid, text, numeric, jsonb, jsonb, jsonb, numeric, text, boolean, jsonb, jsonb, text, text, jsonb);

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
    p_transfers jsonb DEFAULT NULL::jsonb,
    p_credit_other jsonb DEFAULT NULL::jsonb,
    p_waived_fees jsonb DEFAULT NULL::jsonb
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
        v_fee_breakdown jsonb;
        v_credit_check record;
        v_credit_other record;
        v_debit_check record;
        v_cash_debit_entry record;
        v_transfer record;
        v_transfer_note text;
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
        v_other_label text;
        v_other_prefix text;
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
            -- Multiple transfers: an array of { toaccount, amount, note } objects.
            -- The note is written on both the sender's and the recipient's row.
            FOR v_transfer IN SELECT * FROM jsonb_to_recordset(p_transfers) AS x(toaccount text, amount numeric, note text) LOOP
                IF v_transfer.amount IS NULL OR v_transfer.amount <= 0 OR NULLIF(trim(COALESCE(v_transfer.toaccount, '')), '') IS NULL THEN
                    CONTINUE;
                END IF;

                SELECT id INTO v_target_customer_id FROM customers WHERE account_number = v_transfer.toaccount;
                IF v_target_customer_id IS NULL THEN RAISE EXCEPTION 'Recipient account % not found', v_transfer.toaccount; END IF;

                v_transfer_note := NULLIF(trim(COALESCE(v_transfer.note, '')), '');

                v_transfer_tx_id_from := 'XFER-OUT-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*1000000)::int::text;
                v_transfer_tx_id_to := 'XFER-IN-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*1000000)::int::text;

                INSERT INTO transactions (id, account_number, type, amount, date, status, memo, related_transfer_id)
                VALUES (v_transfer_tx_id_from, p_account_number, 'debit', v_transfer.amount, now(), 'completed',
                        'Transfer to ' || v_transfer.toaccount || COALESCE(' — ' || v_transfer_note, ''), v_transfer_tx_id_to);
                v_transaction_ids := array_append(v_transaction_ids, v_transfer_tx_id_from);
                v_balance_change := v_balance_change - v_transfer.amount;

                INSERT INTO transactions (id, account_number, type, amount, date, status, memo, related_transfer_id)
                VALUES (v_transfer_tx_id_to, v_transfer.toaccount, 'credit', v_transfer.amount, now(), 'completed',
                        'Transfer from ' || p_account_number || COALESCE(' — ' || v_transfer_note, ''), v_transfer_tx_id_from);
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

        -- Non-cash, non-check deposits (QuickPay / Direct Deposit / Other).
        IF p_credit_other IS NOT NULL AND jsonb_typeof(p_credit_other) = 'array' THEN
            FOR v_credit_other IN SELECT * FROM jsonb_to_recordset(p_credit_other) AS x(method text, amount numeric, note text) LOOP
                IF v_credit_other.amount IS NULL OR v_credit_other.amount <= 0 THEN
                    CONTINUE;
                END IF;

                CASE lower(COALESCE(v_credit_other.method, 'other'))
                    WHEN 'quickpay' THEN v_other_label := 'QuickPay Deposit'; v_other_prefix := 'CREDIT-QUICKPAY-';
                    WHEN 'direct_deposit' THEN v_other_label := 'Direct Deposit'; v_other_prefix := 'CREDIT-DIRECT-';
                    ELSE v_other_label := 'Other Deposit'; v_other_prefix := 'CREDIT-OTHER-';
                END CASE;

                v_credit_tx_id := v_other_prefix || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*1000000)::int::text;
                INSERT INTO transactions (id, account_number, type, amount, date, status, memo)
                VALUES (v_credit_tx_id, p_account_number, 'credit', v_credit_other.amount, now(), 'completed',
                        v_other_label
                        || COALESCE(' — ' || NULLIF(trim(COALESCE(v_credit_other.note, '')), ''), '')
                        || COALESCE(' — ' || v_credit_note, ''));
                v_transaction_ids := array_append(v_transaction_ids, v_credit_tx_id);
                v_balance_change := v_balance_change + v_credit_other.amount;
            END LOOP;
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
            SELECT f.fee, f.memo, f.details INTO v_fee_amount, v_fee_memo, v_fee_breakdown
            FROM public.calculate_fee_v2(p_account_number, p_debit_cash_entries, p_debit_checks, p_credit_checks, p_waived_fees) AS f;
            IF v_fee_amount > 0 THEN
                v_fee_tx_id := 'FEE-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
                INSERT INTO transactions(id, account_number, type, amount, date, status, memo, fee_details)
                VALUES (v_fee_tx_id, p_account_number, 'fee', v_fee_amount, now(), 'completed', v_fee_memo,
                        jsonb_build_object('reason', v_fee_memo, 'from_customer', v_customer_name,
                                           'breakdown', v_fee_breakdown, 'waived', COALESCE(p_waived_fees, '[]'::jsonb)));
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

-- ----------------------------------------------------------------------------
-- 4. bounce_check — atomic bounced-check handling
--    * marks the check and its original deposit row as bounced
--    * inserts a "Bounced Check Reversal" debit for the amount that had been
--      credited (full amount, or only the released portion of a held check)
--    * optional bounced-check fee, credited to the FEES account
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bounce_check(p_check_id uuid, p_fee numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_check checks_in%ROWTYPE;
    v_customer customers%ROWTYPE;
    v_fee numeric := GREATEST(COALESCE(p_fee, 0), 0);
    v_reversal numeric;
    v_rev_id text;
    v_fee_id text;
    v_name text;
    v_num text;
BEGIN
    SELECT * INTO v_check FROM checks_in WHERE id = p_check_id FOR UPDATE;
    IF v_check.id IS NULL THEN RAISE EXCEPTION 'Check not found'; END IF;
    IF v_check.status IN ('bounced', 'voided') THEN
        RAISE EXCEPTION 'Check is already %', v_check.status;
    END IF;

    SELECT * INTO v_customer FROM customers WHERE account_number = v_check.account_number FOR UPDATE;
    IF v_customer.id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;

    v_name := v_customer.first_name || ' ' || v_customer.last_name;
    v_num := COALESCE(NULLIF(v_check.check_number, ''), 'N/A');

    -- Held checks were only credited for the portion already released.
    v_reversal := CASE WHEN COALESCE(v_check.is_on_hold, false)
                       THEN COALESCE(v_check.hold_cleared_amount, 0)
                       ELSE v_check.amount END;

    UPDATE checks_in SET status = 'bounced' WHERE id = v_check.id;
    IF v_check.transaction_id IS NOT NULL THEN
        UPDATE transactions SET status = 'bounced' WHERE id = v_check.transaction_id;
    END IF;

    IF v_reversal > 0 THEN
        v_rev_id := 'BOUNCE-REVERSAL-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*100000)::int::text;
        INSERT INTO transactions (id, account_number, type, amount, date, status, memo)
        VALUES (v_rev_id, v_customer.account_number, 'debit', v_reversal, now(), 'completed',
                'Bounced Check Reversal #' || v_num || ' - ' || v_name);
    END IF;

    IF v_fee > 0 THEN
        v_fee_id := 'FEE-BOUNCE-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || (random()*100000)::int::text;
        INSERT INTO transactions (id, account_number, type, amount, date, status, memo, fee_details)
        VALUES (v_fee_id, v_customer.account_number, 'fee', v_fee, now(), 'completed',
                'Bounced check fee for check #' || v_num || ' from ' || v_name,
                jsonb_build_object('fee_type', 'bounced_check', 'check_number', v_num, 'check_amount', v_check.amount,
                                   'from_account', v_customer.account_number, 'from_customer', v_name,
                                   'original_transaction_id', v_check.transaction_id));
        UPDATE customers SET balance = balance + v_fee WHERE account_number = 'FEES';
    END IF;

    UPDATE customers SET balance = balance - v_reversal - v_fee WHERE id = v_customer.id;

    RETURN jsonb_build_object('reversal_id', v_rev_id, 'fee_id', v_fee_id, 'reversal_amount', v_reversal, 'fee', v_fee);
END;
$$;

COMMIT;
