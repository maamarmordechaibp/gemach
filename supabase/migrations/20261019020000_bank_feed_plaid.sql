-- ============================================================================
-- Bank feed (Plaid) — daily import of bank activity + check matching
-- Date: 2026-10-19
--
-- Everything runs inside Postgres (no edge functions):
--   * pg_net makes the HTTPS calls to Plaid (async; responses are processed by
--     plaid_process(), which a pg_cron job runs every 5 minutes and the UI calls
--     while waiting).
--   * pg_cron starts a sync every morning.
--   * Plaid keys and the bank access token live in Supabase Vault (encrypted),
--     never in a table the browser can read.
--
-- Matching (bank_match):
--   * Returned / bounced deposit items  -> "needs_review" with candidate checks
--     (same amount, recent, not already bounced). A person confirms; confirming
--     calls bounce_check().
--   * Bank deposits -> matched to a bulk-deposit batch with the same total (or a
--     single deposited check of that amount). Matched checks are marked
--     bank-confirmed and become "cleared" after 10 days with no return.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- ---------------------------------------------------------------------------
-- Checks: record when / in which batch a check was taken to the bank
-- ---------------------------------------------------------------------------
ALTER TABLE public.checks_in ADD COLUMN IF NOT EXISTS deposit_batch_id uuid;
ALTER TABLE public.checks_in ADD COLUMN IF NOT EXISTS deposited_at timestamptz;
ALTER TABLE public.checks_in ADD COLUMN IF NOT EXISTS bank_txn_id text;
ALTER TABLE public.checks_in ADD COLUMN IF NOT EXISTS bank_confirmed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id text,
    institution_name text,
    accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
    sync_cursor text,
    status text NOT NULL DEFAULT 'active',          -- active | error | disconnected
    last_sync_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id text PRIMARY KEY,                             -- Plaid transaction_id
    connection_id uuid REFERENCES public.bank_connections(id) ON DELETE CASCADE,
    account_id text,
    date date NOT NULL,
    amount numeric(15,2) NOT NULL,                   -- Plaid sign: + money out, - money in
    name text,
    pending boolean NOT NULL DEFAULT false,
    removed boolean NOT NULL DEFAULT false,
    kind text,                                       -- deposit | return | bank_fee | other
    match_status text NOT NULL DEFAULT 'new',        -- new | matched | needs_review | unmatched | confirmed | dismissed
    candidate_check_ids uuid[] NOT NULL DEFAULT '{}',
    matched_check_ids uuid[] NOT NULL DEFAULT '{}',
    matched_batch_id uuid,
    raw jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_transactions_date_idx ON public.bank_transactions (date DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON public.bank_transactions (match_status);

CREATE TABLE IF NOT EXISTS public.bank_plaid_requests (
    id bigint PRIMARY KEY,                           -- pg_net request id
    purpose text NOT NULL,                           -- link_token | exchange | sync | remove
    connection_id uuid,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    processed boolean NOT NULL DEFAULT false,
    result jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_plaid_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_connections_read ON public.bank_connections;
CREATE POLICY bank_connections_read ON public.bank_connections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bank_transactions_read ON public.bank_transactions;
CREATE POLICY bank_transactions_read ON public.bank_transactions FOR SELECT TO authenticated USING (true);
-- bank_plaid_requests: no client policy (contains raw API responses).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Requests from the website always carry JWT claims (even anonymous ones), so
-- they are judged by the token. Only direct database sessions with no claims at
-- all (pg_cron jobs, migrations) are trusted.
CREATE OR REPLACE FUNCTION public._bank_is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
    SELECT CASE
        WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN true
        ELSE COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
          OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    END;
$$;

CREATE OR REPLACE FUNCTION public._bank_secret(p_name text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._bank_secret(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._bank_set_secret(p_name text, p_value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_id uuid;
BEGIN
    SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
    IF v_id IS NULL THEN
        PERFORM vault.create_secret(p_value, p_name);
    ELSE
        PERFORM vault.update_secret(v_id, p_value, p_name);
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._bank_set_secret(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._plaid_base_url()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT CASE COALESCE(public._bank_secret('plaid_env'), 'sandbox')
        WHEN 'production' THEN 'https://production.plaid.com'
        ELSE 'https://sandbox.plaid.com' END;
$$;
REVOKE ALL ON FUNCTION public._plaid_base_url() FROM PUBLIC, anon, authenticated;

-- Fire a Plaid API call; returns the pg_net request id.
CREATE OR REPLACE FUNCTION public._plaid_post(p_endpoint text, p_body jsonb, p_purpose text, p_connection_id uuid DEFAULT NULL, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_client_id text := public._bank_secret('plaid_client_id');
    v_secret text := public._bank_secret('plaid_secret');
    v_req bigint;
BEGIN
    IF v_client_id IS NULL OR v_secret IS NULL THEN
        RAISE EXCEPTION 'Plaid keys are not set up yet (Settings > Bank Connection)';
    END IF;
    v_req := net.http_post(
        url := public._plaid_base_url() || p_endpoint,
        body := p_body || jsonb_build_object('client_id', v_client_id, 'secret', v_secret),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 30000
    );
    INSERT INTO public.bank_plaid_requests (id, purpose, connection_id, meta) VALUES (v_req, p_purpose, p_connection_id, COALESCE(p_meta, '{}'::jsonb));
    RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION public._plaid_post(text, jsonb, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plaid_save_keys(p_client_id text, p_secret text, p_env text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF NOT public._bank_is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
    IF COALESCE(trim(p_client_id), '') = '' OR COALESCE(trim(p_secret), '') = '' THEN
        RAISE EXCEPTION 'Client ID and Secret are required';
    END IF;
    IF p_env NOT IN ('sandbox', 'production') THEN RAISE EXCEPTION 'Environment must be sandbox or production'; END IF;
    PERFORM public._bank_set_secret('plaid_client_id', trim(p_client_id));
    PERFORM public._bank_set_secret('plaid_secret', trim(p_secret));
    PERFORM public._bank_set_secret('plaid_env', p_env);
END;
$$;

CREATE OR REPLACE FUNCTION public.plaid_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'keys_configured', public._bank_secret('plaid_client_id') IS NOT NULL AND public._bank_secret('plaid_secret') IS NOT NULL,
        'env', COALESCE(public._bank_secret('plaid_env'), 'sandbox'),
        'connections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', c.id, 'institution_name', c.institution_name, 'status', c.status,
            'last_sync_at', c.last_sync_at, 'last_error', c.last_error, 'accounts', c.accounts) ORDER BY c.created_at)
            FROM public.bank_connections c WHERE c.status <> 'disconnected'), '[]'::jsonb),
        'needs_review', (SELECT count(*) FROM public.bank_transactions WHERE match_status = 'needs_review' AND NOT removed)
    );
$$;

CREATE OR REPLACE FUNCTION public.plaid_create_link_token()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF NOT public._bank_is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
    RETURN public._plaid_post('/link/token/create', jsonb_build_object(
        'client_name', 'Kern Gemach',
        'language', 'en',
        'country_codes', jsonb_build_array('US'),
        'user', jsonb_build_object('client_user_id', COALESCE(auth.uid()::text, 'admin')),
        'products', jsonb_build_array('transactions'),
        'transactions', jsonb_build_object('days_requested', 90)
    ), 'link_token');
END;
$$;

CREATE OR REPLACE FUNCTION public.plaid_exchange_public_token(p_public_token text, p_institution_name text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF NOT public._bank_is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
    RETURN public._plaid_post('/item/public_token/exchange', jsonb_build_object('public_token', p_public_token),
                              'exchange', NULL, jsonb_build_object('institution_name', p_institution_name));
END;
$$;

-- Start a sync for one or all active connections; returns request ids.
CREATE OR REPLACE FUNCTION public.plaid_sync_start(p_connection_id uuid DEFAULT NULL)
RETURNS bigint[]
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_conn record;
    v_token text;
    v_ids bigint[] := '{}';
BEGIN
    IF NOT (public._bank_is_admin() OR auth.role() = 'authenticated') THEN RAISE EXCEPTION 'Not allowed'; END IF;
    FOR v_conn IN SELECT * FROM public.bank_connections WHERE status <> 'disconnected' AND (p_connection_id IS NULL OR id = p_connection_id) LOOP
        v_token := public._bank_secret('plaid_access_token_' || v_conn.id::text);
        CONTINUE WHEN v_token IS NULL;
        v_ids := v_ids || public._plaid_post('/transactions/sync',
            jsonb_build_object('access_token', v_token, 'count', 500)
              || CASE WHEN v_conn.sync_cursor IS NOT NULL THEN jsonb_build_object('cursor', v_conn.sync_cursor) ELSE '{}'::jsonb END,
            'sync', v_conn.id);
    END LOOP;
    RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.plaid_disconnect(p_connection_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_token text;
BEGIN
    IF NOT public._bank_is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
    v_token := public._bank_secret('plaid_access_token_' || p_connection_id::text);
    IF v_token IS NOT NULL THEN
        PERFORM public._plaid_post('/item/remove', jsonb_build_object('access_token', v_token), 'remove', p_connection_id);
        DELETE FROM vault.secrets WHERE name = 'plaid_access_token_' || p_connection_id::text;
    END IF;
    UPDATE public.bank_connections SET status = 'disconnected' WHERE id = p_connection_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bank_match()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    t record;
    v_candidates uuid[];
    v_batch uuid;
    v_batch_count int;
    v_ids uuid[];
    n_returns int := 0;
    n_deposits int := 0;
    n_cleared int := 0;
BEGIN
    -- Classify new posted rows.
    UPDATE public.bank_transactions SET kind = CASE
        WHEN amount > 0 AND name ~* '(fee|charge)' AND name ~* '(return|rtn|nsf|unpaid|chargeback)' THEN 'bank_fee'
        WHEN amount > 0 AND name ~* '(return|rtn|chargeback|charge back|deposited item|dep item|unpaid|nsf|reject)' THEN 'return'
        WHEN amount < 0 AND name ~* '(deposit|dep |mobile dep|remote dep|rdc)' THEN 'deposit'
        ELSE 'other' END,
        updated_at = now()
    WHERE kind IS NULL AND NOT pending AND NOT removed;

    UPDATE public.bank_transactions SET match_status = 'unmatched'
    WHERE match_status = 'new' AND kind IN ('bank_fee', 'other') AND NOT pending;

    -- Returned items: suggest checks with the same amount deposited recently.
    FOR t IN SELECT * FROM public.bank_transactions WHERE match_status = 'new' AND kind = 'return' AND NOT pending AND NOT removed LOOP
        SELECT COALESCE(array_agg(ci.id ORDER BY ci.date DESC), '{}') INTO v_candidates
        FROM public.checks_in ci
        WHERE ci.amount = t.amount
          AND ci.status NOT IN ('bounced', 'voided')
          AND ci.date::date BETWEEN t.date - 60 AND t.date + 1;
        UPDATE public.bank_transactions
        SET candidate_check_ids = v_candidates,
            match_status = CASE WHEN array_length(v_candidates, 1) > 0 THEN 'needs_review' ELSE 'unmatched' END,
            updated_at = now()
        WHERE id = t.id;
        n_returns := n_returns + 1;
    END LOOP;

    -- Deposits: match a bulk-deposit batch with the same total, else a single deposited check.
    FOR t IN SELECT * FROM public.bank_transactions WHERE match_status = 'new' AND kind = 'deposit' AND NOT pending AND NOT removed LOOP
        SELECT min(b.deposit_batch_id::text)::uuid, count(*) INTO v_batch, v_batch_count FROM (
            SELECT ci.deposit_batch_id
            FROM public.checks_in ci
            WHERE ci.deposit_batch_id IS NOT NULL AND ci.bank_txn_id IS NULL AND ci.status = 'deposited'
            GROUP BY ci.deposit_batch_id
            HAVING sum(ci.amount) = -t.amount
               AND min(ci.deposited_at)::date BETWEEN t.date - 7 AND t.date
        ) b;

        IF v_batch_count = 1 THEN
            SELECT array_agg(id) INTO v_ids FROM public.checks_in WHERE deposit_batch_id = v_batch AND status = 'deposited';
        ELSE
            v_batch := NULL;
            SELECT array_agg(ci.id) INTO v_ids FROM (
                SELECT id FROM public.checks_in ci
                WHERE ci.bank_txn_id IS NULL AND ci.status = 'deposited' AND ci.amount = -t.amount
                  AND COALESCE(ci.deposited_at, ci.date)::date BETWEEN t.date - 7 AND t.date
            ) ci HAVING count(*) = 1;
        END IF;

        IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
            UPDATE public.checks_in SET bank_txn_id = t.id, bank_confirmed_at = now() WHERE id = ANY(v_ids);
            UPDATE public.bank_transactions SET match_status = 'matched', matched_check_ids = v_ids, matched_batch_id = v_batch, updated_at = now() WHERE id = t.id;
            n_deposits := n_deposits + 1;
        ELSE
            UPDATE public.bank_transactions SET match_status = 'unmatched', updated_at = now() WHERE id = t.id;
        END IF;
        v_ids := NULL;
    END LOOP;

    -- Checks confirmed in the bank with no return after 10 days are cleared.
    WITH c AS (
        UPDATE public.checks_in ci SET status = 'cleared'
        FROM public.bank_transactions bt
        WHERE ci.bank_txn_id = bt.id AND ci.status = 'deposited' AND bt.date <= current_date - 10
        RETURNING ci.id
    ) SELECT count(*) INTO n_cleared FROM c;

    RETURN jsonb_build_object('returns', n_returns, 'deposits_matched', n_deposits, 'cleared', n_cleared);
END;
$$;

-- Confirm a returned item as a specific check -> bounce it (atomic).
CREATE OR REPLACE FUNCTION public.bank_confirm_return(p_bank_txn_id text, p_check_id uuid, p_fee numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_res jsonb;
BEGIN
    IF auth.role() <> 'authenticated' AND NOT public._bank_is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bank_transactions WHERE id = p_bank_txn_id AND match_status IN ('needs_review', 'unmatched')) THEN
        RAISE EXCEPTION 'This bank item was already handled';
    END IF;
    v_res := public.bounce_check(p_check_id, p_fee);
    UPDATE public.bank_transactions SET match_status = 'confirmed', matched_check_ids = ARRAY[p_check_id], updated_at = now() WHERE id = p_bank_txn_id;
    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.bank_dismiss(p_bank_txn_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF auth.role() <> 'authenticated' AND NOT public._bank_is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
    UPDATE public.bank_transactions SET match_status = 'dismissed', updated_at = now() WHERE id = p_bank_txn_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Process Plaid responses (cron every 5 min + polled by the UI)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plaid_process()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    r record;
    v_resp record;
    v_body jsonb;
    v_conn_id uuid;
    v_tx jsonb;
    v_done int := 0;
    v_synced boolean := false;
    v_err text;
BEGIN
    FOR r IN SELECT * FROM public.bank_plaid_requests WHERE NOT processed ORDER BY id LOOP
        SELECT * INTO v_resp FROM net._http_response WHERE id = r.id;
        IF NOT FOUND THEN
            -- Give up on requests that never got a response.
            IF r.created_at < now() - interval '30 minutes' THEN
                UPDATE public.bank_plaid_requests SET processed = true, error = 'No response from Plaid' WHERE id = r.id;
            END IF;
            CONTINUE;
        END IF;

        v_body := NULL;
        BEGIN v_body := v_resp.content::jsonb; EXCEPTION WHEN others THEN v_body := NULL; END;

        IF v_resp.timed_out OR v_resp.status_code IS DISTINCT FROM 200 OR v_body IS NULL THEN
            v_err := COALESCE(v_body->>'error_message', v_resp.error_msg, 'HTTP ' || COALESCE(v_resp.status_code::text, '?'));
            UPDATE public.bank_plaid_requests SET processed = true, error = v_err, result = v_body WHERE id = r.id;
            IF r.connection_id IS NOT NULL THEN
                UPDATE public.bank_connections
                SET last_error = v_err,
                    status = CASE WHEN v_body->>'error_code' = 'ITEM_LOGIN_REQUIRED' THEN 'error' ELSE status END
                WHERE id = r.connection_id;
            END IF;
            v_done := v_done + 1;
            CONTINUE;
        END IF;

        IF r.purpose = 'link_token' THEN
            UPDATE public.bank_plaid_requests SET processed = true, result = jsonb_build_object('link_token', v_body->>'link_token') WHERE id = r.id;

        ELSIF r.purpose = 'exchange' THEN
            INSERT INTO public.bank_connections (item_id, institution_name)
            VALUES (v_body->>'item_id', r.meta->>'institution_name') RETURNING id INTO v_conn_id;
            PERFORM public._bank_set_secret('plaid_access_token_' || v_conn_id::text, v_body->>'access_token');
            UPDATE public.bank_plaid_requests SET processed = true, connection_id = v_conn_id,
                result = jsonb_build_object('connection_id', v_conn_id) WHERE id = r.id;
            PERFORM public.plaid_sync_start(v_conn_id);

        ELSIF r.purpose = 'sync' THEN
            FOR v_tx IN SELECT value FROM jsonb_array_elements(COALESCE(v_body->'added', '[]'::jsonb) || COALESCE(v_body->'modified', '[]'::jsonb)) LOOP
                INSERT INTO public.bank_transactions (id, connection_id, account_id, date, amount, name, pending, raw)
                VALUES (v_tx->>'transaction_id', r.connection_id, v_tx->>'account_id', (v_tx->>'date')::date,
                        (v_tx->>'amount')::numeric, COALESCE(v_tx->>'original_description', v_tx->>'name'),
                        COALESCE((v_tx->>'pending')::boolean, false), v_tx)
                ON CONFLICT (id) DO UPDATE SET
                    date = EXCLUDED.date, amount = EXCLUDED.amount, name = EXCLUDED.name,
                    pending = EXCLUDED.pending, raw = EXCLUDED.raw, removed = false, updated_at = now(),
                    kind = CASE WHEN bank_transactions.pending AND NOT EXCLUDED.pending THEN NULL ELSE bank_transactions.kind END;
            END LOOP;
            UPDATE public.bank_transactions SET removed = true, updated_at = now()
            WHERE id IN (SELECT value->>'transaction_id' FROM jsonb_array_elements(COALESCE(v_body->'removed', '[]'::jsonb)));

            UPDATE public.bank_connections SET
                sync_cursor = v_body->>'next_cursor',
                accounts = COALESCE((SELECT jsonb_agg(jsonb_build_object('account_id', a->>'account_id', 'name', a->>'name',
                    'mask', a->>'mask', 'balance', a->'balances'->'current', 'available', a->'balances'->'available'))
                    FROM jsonb_array_elements(v_body->'accounts') a), accounts),
                last_error = NULL,
                status = 'active',
                last_sync_at = CASE WHEN COALESCE((v_body->>'has_more')::boolean, false) THEN last_sync_at ELSE now() END
            WHERE id = r.connection_id;

            UPDATE public.bank_plaid_requests SET processed = true,
                result = jsonb_build_object('added', jsonb_array_length(COALESCE(v_body->'added', '[]'::jsonb)), 'has_more', v_body->'has_more')
            WHERE id = r.id;

            IF COALESCE((v_body->>'has_more')::boolean, false) THEN
                PERFORM public.plaid_sync_start(r.connection_id);
            ELSE
                v_synced := true;
            END IF;

        ELSE
            UPDATE public.bank_plaid_requests SET processed = true, result = v_body WHERE id = r.id;
        END IF;
        v_done := v_done + 1;
    END LOOP;

    IF v_synced THEN PERFORM public.bank_match(); END IF;

    RETURN jsonb_build_object('processed', v_done,
        'pending', (SELECT count(*) FROM public.bank_plaid_requests WHERE NOT processed));
END;
$$;

-- UI polling: process what's ready, then report this request.
CREATE OR REPLACE FUNCTION public.plaid_poll(p_request_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_row public.bank_plaid_requests%ROWTYPE;
BEGIN
    IF auth.role() <> 'authenticated' AND NOT public._bank_is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
    PERFORM public.plaid_process();
    SELECT * INTO v_row FROM public.bank_plaid_requests WHERE id = p_request_id;
    RETURN jsonb_build_object('processed', COALESCE(v_row.processed, false), 'result', v_row.result, 'error', v_row.error,
        'sync_pending', (SELECT count(*) FROM public.bank_plaid_requests WHERE NOT processed AND purpose = 'sync'));
END;
$$;

REVOKE ALL ON FUNCTION public.plaid_process() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bank_match() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plaid_save_keys(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plaid_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plaid_create_link_token() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plaid_exchange_public_token(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plaid_sync_start(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plaid_disconnect(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plaid_poll(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bank_confirm_return(text, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bank_dismiss(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plaid_process(), public.plaid_save_keys(text, text, text), public.plaid_status(),
    public.plaid_create_link_token(), public.plaid_exchange_public_token(text, text), public.plaid_sync_start(uuid),
    public.plaid_disconnect(uuid), public.plaid_poll(bigint), public.bank_confirm_return(text, uuid, numeric),
    public.bank_dismiss(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Schedules: sync every morning at 7:00 New York time (11:00 UTC), and process
-- responses every 5 minutes.
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('bank-daily-sync', 'bank-process');
SELECT cron.schedule('bank-daily-sync', '0 11 * * *', $$SELECT public.plaid_sync_start()$$);
SELECT cron.schedule('bank-process', '*/5 * * * *', $$SELECT public.plaid_process()$$);

COMMIT;
