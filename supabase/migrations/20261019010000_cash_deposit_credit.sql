-- ============================================================================
-- Cash-deposit credit: no cash-withdrawal fee up to the cash a customer deposited
-- Date: 2026-10-19
--
-- Every cash deposit becomes a "lot" of fee-free cash for that account, valid for
-- transaction_fees.cash_debit.cash_deposit_credit.days (default 365). Regular
-- (non-RUSH) cash withdrawals use the oldest unexpired lots first; the cash fee
-- is charged only on the part not covered. Credit is derived from the linked
-- transaction rows, so voided deposits/withdrawals drop out automatically.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cash_credit_lots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number text NOT NULL,
    transaction_id text NOT NULL,
    amount numeric(15,2) NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_credit_lots_account_idx ON public.cash_credit_lots (account_number, created_at);

CREATE TABLE IF NOT EXISTS public.cash_credit_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id uuid NOT NULL REFERENCES public.cash_credit_lots(id) ON DELETE CASCADE,
    transaction_id text NOT NULL,
    amount numeric(15,2) NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_credit_usage_lot_idx ON public.cash_credit_usage (lot_id);

ALTER TABLE public.cash_credit_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_credit_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_credit_lots_auth ON public.cash_credit_lots;
CREATE POLICY cash_credit_lots_auth ON public.cash_credit_lots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cash_credit_usage_auth ON public.cash_credit_usage;
CREATE POLICY cash_credit_usage_auth ON public.cash_credit_usage FOR SELECT TO authenticated USING (true);

-- Turn the feature on (365 days) unless it was already configured.
UPDATE public.system_settings
SET value = jsonb_set(value, '{cash_debit,cash_deposit_credit}', '{"enabled": true, "days": 365}'::jsonb, true)
WHERE key = 'transaction_fees' AND value->'cash_debit' IS NOT NULL AND value->'cash_debit'->'cash_deposit_credit' IS NULL;

-- Days a cash deposit stays usable (0 = feature off).
CREATE OR REPLACE FUNCTION public.cash_credit_days()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT CASE WHEN COALESCE((value->'cash_debit'->'cash_deposit_credit'->>'enabled')::boolean, false)
                THEN COALESCE((value->'cash_debit'->'cash_deposit_credit'->>'days')::int, 365) ELSE 0 END
    FROM public.system_settings WHERE key = 'transaction_fees';
$$;

-- Remaining usable amount of each unexpired lot (oldest first).
CREATE OR REPLACE FUNCTION public.cash_credit_lot_balances(p_account_number text)
RETURNS TABLE(lot_id uuid, remaining numeric, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT l.id,
           GREATEST(0, LEAST(l.amount, t.amount) - COALESCE((
               SELECT SUM(u.amount) FROM public.cash_credit_usage u
               JOIN public.transactions ut ON ut.id = u.transaction_id AND ut.status <> 'voided'
               WHERE u.lot_id = l.id), 0)),
           l.created_at
    FROM public.cash_credit_lots l
    JOIN public.transactions t ON t.id = l.transaction_id AND t.status <> 'voided'
    WHERE l.account_number = p_account_number
      AND COALESCE(public.cash_credit_days(), 0) > 0
      AND l.created_at > now() - make_interval(days => COALESCE(public.cash_credit_days(), 0))
    ORDER BY l.created_at, l.id;
$$;

CREATE OR REPLACE FUNCTION public.cash_credit_available(p_account_number text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT COALESCE(SUM(remaining), 0) FROM public.cash_credit_lot_balances(p_account_number);
$$;

-- Use up to p_amount of the account's credit for a cash-withdrawal row.
CREATE OR REPLACE FUNCTION public.consume_cash_credit(p_account_number text, p_transaction_id text, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_lot record;
    v_left numeric := GREATEST(COALESCE(p_amount, 0), 0);
    v_take numeric;
    v_used numeric := 0;
BEGIN
    FOR v_lot IN SELECT * FROM public.cash_credit_lot_balances(p_account_number) LOOP
        EXIT WHEN v_left <= 0;
        CONTINUE WHEN v_lot.remaining <= 0;
        v_take := LEAST(v_left, v_lot.remaining);
        INSERT INTO public.cash_credit_usage (lot_id, transaction_id, amount) VALUES (v_lot.lot_id, p_transaction_id, v_take);
        v_left := v_left - v_take;
        v_used := v_used + v_take;
    END LOOP;
    RETURN v_used;
END;
$$;

-- ----------------------------------------------------------------------------
-- calculate_fee_v2 — adds p_cash_deposit (cash being deposited in this same
-- transaction) and charges the cash fee only on cash not covered by credit.
-- cash_debit detail gains `covered` (amount covered by cash-deposit credit).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.calculate_fee_v2(text, jsonb, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.calculate_fee_v2(
    p_account_number text,
    p_debit_cash_entries jsonb,
    p_debit_checks jsonb,
    p_credit_checks jsonb,
    p_waived_fees jsonb DEFAULT NULL::jsonb,
    p_cash_deposit numeric DEFAULT 0
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
    v_cash_credit numeric := 0;
    v_covered numeric := 0;
    v_chargeable numeric := 0;

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

        -- Cash the customer deposited (earlier, unexpired + in this transaction)
        -- covers this much of the withdrawal fee-free.
        IF COALESCE(public.cash_credit_days(), 0) > 0 THEN
            v_cash_credit := public.cash_credit_available(p_account_number) + GREATEST(COALESCE(p_cash_deposit, 0), 0);
        END IF;
        v_covered := LEAST(total_non_rush_cash_debit, v_cash_credit);
        v_chargeable := total_non_rush_cash_debit - v_covered;

        IF charge_fee AND v_chargeable > 0 THEN
            IF cash_debit_config->>'fee_type' = 'flat' THEN
                v_amount := (cash_debit_config->>'fee_value')::numeric;
                v_desc := 'Cash Debit Fee: $' || v_amount;
            ELSE
                v_amount := v_chargeable * (cash_debit_config->>'fee_value')::numeric / 100.0;
                v_desc := 'Cash Debit Fee: ' || (cash_debit_config->>'fee_value')::numeric || '% of $' || v_chargeable;
            END IF;
            IF v_covered > 0 THEN
                v_desc := v_desc || ' ($' || v_covered || ' covered by cash deposits)';
            END IF;
            regular_details := regular_details || jsonb_build_array(jsonb_build_object(
                'type', 'cash_debit', 'label', 'Cash Withdrawal Fee', 'description', v_desc,
                'amount', v_amount, 'covered', v_covered, 'items', '[]'::jsonb));
        ELSIF charge_fee AND v_covered > 0 THEN
            -- Fully covered: no fee, but keep a line so the receipt can say why.
            regular_details := regular_details || jsonb_build_array(jsonb_build_object(
                'type', 'cash_debit', 'label', 'Cash Withdrawal Fee',
                'description', 'Cash withdrawal covered by cash deposits ($' || v_covered || ')',
                'amount', 0, 'covered', v_covered, 'items', '[]'::jsonb));
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
        IF (v_item->>'type') = ANY(v_waived) AND COALESCE((v_item->>'amount')::numeric, 0) > 0 THEN
            v_item := v_item || jsonb_build_object('waived', true);
            v_waived_memo := array_append(v_waived_memo, v_item->>'label');
        ELSE
            v_item := v_item || jsonb_build_object('waived', false);
            v_total := v_total + COALESCE((v_item->>'amount')::numeric, 0);
            IF COALESCE((v_item->>'amount')::numeric, 0) > 0 THEN
                v_memo := array_append(v_memo, v_item->>'description');
            END IF;
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
-- process_transaction_v2 — same signature; records cash-deposit credit lots,
-- uses credit on regular cash withdrawals, and calculates the fee up front
-- (before this transaction's deposit/withdrawals change the credit).
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

        IF p_apply_fee THEN
            SELECT f.fee, f.memo, f.details INTO v_fee_amount, v_fee_memo, v_fee_breakdown
            FROM public.calculate_fee_v2(p_account_number, p_debit_cash_entries, p_debit_checks, p_credit_checks,
                                         p_waived_fees, COALESCE(p_credit_cash, 0)) AS f;
        END IF;

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
            INSERT INTO public.cash_credit_lots (account_number, transaction_id, amount)
            VALUES (p_account_number, v_credit_tx_id, p_credit_cash);
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
            IF NOT COALESCE(v_cash_debit_entry."isRush", false) THEN
                PERFORM public.consume_cash_credit(p_account_number, v_debit_tx_id, v_cash_debit_entry.amount);
            END IF;
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

COMMIT;
