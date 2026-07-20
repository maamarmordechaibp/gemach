-- ============================================================
-- TEST ACCOUNT SETUP — safe, isolated, easy to identify & remove
-- All test rows use account_number = 'ZZTEST-0001' and names
-- prefixed with 'ZZTEST' so they sort to the bottom and are
-- obviously not a real customer.
-- ============================================================

-- Clean up any previous test run first (idempotent)
DELETE FROM transactions WHERE account_number = 'ZZTEST-0001';
DELETE FROM loans WHERE customer_id IN (SELECT id FROM customers WHERE account_number = 'ZZTEST-0001');
DELETE FROM customers WHERE account_number = 'ZZTEST-0001';

-- Create the test customer with a known starting balance
INSERT INTO customers (account_number, first_name, last_name, phone_number, balance)
VALUES ('ZZTEST-0001', 'ZZTEST', 'DoNotUse', '0000000000', 500.00);

-- Create a $1000 active loan for the test customer
INSERT INTO loans (customer_id, amount, due_date, status)
SELECT id, 1000.00, (now() + interval '30 days')::date, 'active'
FROM customers WHERE account_number = 'ZZTEST-0001';

-- Create a second $400 active loan to test multi-loan allocation
INSERT INTO loans (customer_id, amount, due_date, status)
SELECT id, 400.00, (now() + interval '60 days')::date, 'active'
FROM customers WHERE account_number = 'ZZTEST-0001';

-- Show what we created
SELECT 'CUSTOMER' AS kind, account_number, first_name || ' ' || last_name AS name, balance::text AS info
FROM customers WHERE account_number = 'ZZTEST-0001'
UNION ALL
SELECT 'LOAN', c.account_number, l.status, l.amount::text
FROM loans l JOIN customers c ON c.id = l.customer_id
WHERE c.account_number = 'ZZTEST-0001'
ORDER BY kind, info;
