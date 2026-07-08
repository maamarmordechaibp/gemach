-- ============================================================================
-- Balance / Transaction-history reconciliation diagnostics
-- ----------------------------------------------------------------------------
-- Purpose: find WHY a customer's stored balance does not match the sum of the
--          transactions shown in their history (e.g. Elimelech Feder, and
--          Avrumi Zamner account #283), and find checks that appear under
--          "Checks Out" but have no matching row in the transactions table
--          (typical of data created during the pre-launch / preview period).
--
-- SAFETY:  Sections 1-3 are READ-ONLY (SELECT only) and change nothing.
--          Section 4 is an OPTIONAL backfill that INSERTS the missing
--          transaction rows. It is commented out. Read the notes carefully and
--          run it only after reviewing the output of sections 1-3.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Helper: the signed effect a single transaction has on a customer's balance.
-- Mirrors the app's balance rules (credit adds; debit/fee subtracts; voided = 0).
-- Transfers are reported separately in section 1 so you can eyeball them.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- SECTION 1 — Balance vs. transaction history, per customer
-- Shows the stored balance, the balance implied by the transactions, and the
-- difference. A non-zero "difference" is the amount unaccounted for in history
-- (usually pre-launch activity such as an un-migrated check).
-- ============================================================================
SELECT
    c.account_number,
    c.first_name,
    c.last_name,
    c.balance                                   AS stored_balance,
    COALESCE(SUM(
        CASE
            WHEN t.status = 'voided' THEN 0
            WHEN t.type = 'credit' AND t.status <> 'bounced' THEN  t.amount
            WHEN t.type = 'transfer' THEN 0            -- reviewed separately
            ELSE -t.amount
        END
    ), 0)                                        AS balance_from_transactions,
    c.balance - COALESCE(SUM(
        CASE
            WHEN t.status = 'voided' THEN 0
            WHEN t.type = 'credit' AND t.status <> 'bounced' THEN  t.amount
            WHEN t.type = 'transfer' THEN 0
            ELSE -t.amount
        END
    ), 0)                                        AS difference
FROM customers c
LEFT JOIN transactions t ON t.account_number = c.account_number
GROUP BY c.id, c.account_number, c.first_name, c.last_name, c.balance
HAVING ABS(
    c.balance - COALESCE(SUM(
        CASE
            WHEN t.status = 'voided' THEN 0
            WHEN t.type = 'credit' AND t.status <> 'bounced' THEN  t.amount
            WHEN t.type = 'transfer' THEN 0
            ELSE -t.amount
        END
    ), 0)
) > 0.001
ORDER BY ABS(
    c.balance - COALESCE(SUM(
        CASE
            WHEN t.status = 'voided' THEN 0
            WHEN t.type = 'credit' AND t.status <> 'bounced' THEN  t.amount
            WHEN t.type = 'transfer' THEN 0
            ELSE -t.amount
        END
    ), 0)
) DESC;


-- ============================================================================
-- SECTION 2 — Checks that are in "Checks Out" but MISSING from transactions
-- These are the checks that show under Checks Out but do not appear in the
-- customer's transaction history. This is the likely cause of the Elimelech
-- Feder $4,000 check discrepancy.
-- ============================================================================
SELECT
    co.id                AS checks_out_id,
    co.account_number,
    cust.first_name,
    cust.last_name,
    co.check_number,
    co.pay_to_order_of,
    co.amount,
    co.date,
    co.status,
    co.transaction_id    AS linked_transaction_id
FROM checks_out co
LEFT JOIN transactions t ON t.id = co.transaction_id
LEFT JOIN customers cust ON cust.account_number = co.account_number
WHERE co.status <> 'voided'
  AND (co.transaction_id IS NULL OR t.id IS NULL)
ORDER BY co.date;


-- ============================================================================
-- SECTION 3 — Focused lookups for the two reported accounts
-- ============================================================================
-- Elimelech Feder (adjust the name spelling if needed):
SELECT 'customer' AS kind, account_number, balance::text AS info, NULL AS dt
FROM customers WHERE lower(first_name) LIKE 'elimelech%' AND lower(last_name) LIKE 'feder%'
UNION ALL
SELECT 'transaction', t.account_number, t.type || ' $' || t.amount || ' (' || t.status || ') ' || COALESCE(t.memo,''), t.date::text
FROM transactions t
JOIN customers c ON c.account_number = t.account_number
WHERE lower(c.first_name) LIKE 'elimelech%' AND lower(c.last_name) LIKE 'feder%'
UNION ALL
SELECT 'check_out', co.account_number, 'check #' || co.check_number || ' $' || co.amount || ' (' || co.status || ')', co.date::text
FROM checks_out co
JOIN customers c ON c.account_number = co.account_number
WHERE lower(c.first_name) LIKE 'elimelech%' AND lower(c.last_name) LIKE 'feder%'
ORDER BY dt;

-- Avrumi Zamner, account #283:
SELECT 'customer' AS kind, account_number, balance::text AS info, NULL AS dt
FROM customers WHERE account_number = '283'
UNION ALL
SELECT 'transaction', t.account_number, t.type || ' $' || t.amount || ' (' || t.status || ') ' || COALESCE(t.memo,''), t.date::text
FROM transactions t WHERE t.account_number = '283'
UNION ALL
SELECT 'check_out', co.account_number, 'check #' || co.check_number || ' $' || co.amount || ' (' || co.status || ')', co.date::text
FROM checks_out co WHERE co.account_number = '283'
ORDER BY dt;


-- ============================================================================
-- SECTION 4 — OPTIONAL BACKFILL (DISABLED BY DEFAULT)
-- ----------------------------------------------------------------------------
-- This inserts a matching 'debit' transaction for every "Checks Out" row that
-- has no transaction (from section 2), so the check appears in the customer's
-- transaction history.
--
-- IMPORTANT — decide first whether the balance already reflects these checks:
--   * If the stored balance ALREADY subtracted the check (section 1 shows the
--     difference equal to these checks), run the INSERT AS-IS below. It only
--     adds the history row and does NOT touch the balance, so things reconcile.
--   * If the balance does NOT yet reflect the check, additionally subtract the
--     amounts from customers.balance (see the second, also-commented statement).
--
-- Review section 2 output, then uncomment to run.
-- ============================================================================

-- INSERT INTO transactions (id, account_number, type, amount, date, status, memo)
-- SELECT
--     COALESCE(co.transaction_id,
--              'DEBIT-CHECK-BACKFILL-' || co.check_number || '-' || co.id),
--     co.account_number,
--     'debit',
--     co.amount,
--     co.date,
--     'completed',
--     'Check Withdrawal for ' || co.pay_to_order_of || ' #' || co.check_number
--         || ' (backfilled from Checks Out)'
-- FROM checks_out co
-- LEFT JOIN transactions t ON t.id = co.transaction_id
-- WHERE co.status <> 'voided'
--   AND (co.transaction_id IS NULL OR t.id IS NULL);

-- Only if the balance does NOT already reflect these checks, also run:
-- UPDATE customers c
-- SET balance = balance - agg.total
-- FROM (
--     SELECT co.account_number, SUM(co.amount) AS total
--     FROM checks_out co
--     LEFT JOIN transactions t ON t.id = co.transaction_id
--     WHERE co.status <> 'voided'
--       AND (co.transaction_id IS NULL OR t.id IS NULL)
--     GROUP BY co.account_number
-- ) agg
-- WHERE c.account_number = agg.account_number;


-- ============================================================================
-- SECTION 5 — TARGETED FIX for account #283 (Avrumi Zamner), check #9499
-- ----------------------------------------------------------------------------
-- Confirmed from the data: check #9499 for $3,042.09 exists in checks_out but
-- has NO transaction row, and the stored balance ($3,106.61) does NOT reflect
-- it. This posts the check to the account: it adds the debit history row AND
-- subtracts the amount from the balance, bringing it to ~$64.91.
--
-- Wrapped in a transaction so it all succeeds or all rolls back.
-- Uncomment and run only after confirming the check is a real withdrawal.
-- ============================================================================

-- BEGIN;
--
-- INSERT INTO transactions (id, account_number, type, amount, date, status, memo)
-- SELECT
--     COALESCE(co.transaction_id,
--              'DEBIT-CHECK-BACKFILL-' || co.check_number || '-' || co.id),
--     co.account_number,
--     'debit',
--     co.amount,
--     co.date,
--     'completed',
--     'Check Withdrawal for ' || co.pay_to_order_of || ' #' || co.check_number
--         || ' (backfilled from Checks Out)'
-- FROM checks_out co
-- WHERE co.account_number = '283'
--   AND co.check_number = 9499
--   AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = co.transaction_id);
--
-- UPDATE customers
-- SET balance = balance - 3042.09
-- WHERE account_number = '283';
--
-- COMMIT;

