-- ============================================================================
-- History reconciliation — run once. SAFE: does NOT modify any customer balance.
-- ----------------------------------------------------------------------------
-- STEP 1: Give each mis-linked outgoing check (currently pointing at a credit
--         deposit) its own debit transaction, so the check appears in history
--         as a withdrawal, then re-point the check at that debit.
-- STEP 2: Add one "Opening Balance" line per account equal to
--         (stored balance − sum of recorded transactions), so every account's
--         history now sums exactly to its (unchanged) stored balance. This
--         represents the starting balance carried over from the previous system.
--
-- Reversible with:
--   DELETE FROM transactions WHERE id LIKE 'OPENING-BAL-%'
--                               OR id LIKE 'DEBIT-CHECK-RECON-%';
--   (and restore checks_out.transaction_id from the CSV backup)
-- ============================================================================

BEGIN;

-- STEP 1 — proper debit for each mis-linked check
INSERT INTO transactions (id, account_number, type, amount, date, status, memo)
SELECT
    'DEBIT-CHECK-RECON-' || co.check_number || '-' || co.id,
    co.account_number,
    'debit',
    co.amount,
    co.date,
    'completed',
    'Check Withdrawal #' || co.check_number
        || CASE WHEN COALESCE(co.pay_to_order_of,'') <> '' THEN ' for ' || co.pay_to_order_of ELSE '' END
        || ' (reconciled — was mis-linked during migration)'
FROM checks_out co
JOIN transactions t ON t.id = co.transaction_id
WHERE co.status <> 'voided' AND t.type = 'credit';

-- re-point the checks at their new debit
UPDATE checks_out co
SET transaction_id = 'DEBIT-CHECK-RECON-' || co.check_number || '-' || co.id
FROM transactions t
WHERE t.id = co.transaction_id AND t.type = 'credit' AND co.status <> 'voided';

-- STEP 2 — opening balance so history reconciles to the stored balance
INSERT INTO transactions (id, account_number, type, amount, date, status, memo)
SELECT
    'OPENING-BAL-' || s.account_number,
    s.account_number,
    CASE WHEN s.opening >= 0 THEN 'credit' ELSE 'debit' END,
    ROUND(ABS(s.opening), 2),
    TIMESTAMPTZ '2026-06-01 00:00:00+00',
    'completed',
    'Opening Balance (carried over from previous system)'
FROM (
    SELECT c.account_number,
           c.balance - COALESCE(SUM(CASE
               WHEN t.status = 'voided' THEN 0
               WHEN t.type = 'credit' AND t.status <> 'bounced' THEN t.amount
               WHEN t.type = 'transfer' AND lower(COALESCE(t.memo,'')) LIKE '%from%' THEN t.amount
               WHEN t.type = 'transfer' THEN -t.amount
               ELSE -t.amount
           END), 0) AS opening
    FROM customers c
    LEFT JOIN transactions t ON t.account_number = c.account_number
    GROUP BY c.account_number, c.balance
) s
WHERE ABS(s.opening) > 0.001
  AND NOT EXISTS (SELECT 1 FROM transactions o WHERE o.id = 'OPENING-BAL-' || s.account_number);

COMMIT;
