# Transaction System Verification Guide

## Overview
This document outlines what transactions should be created for each operation type.

---

## 1. CASH DEPOSIT (Credit Cash, No Fee)

### Input:
- Customer: yokove gross (101)
- Credit Cash: $50.00
- Apply Fee: OFF

### Expected Transactions:
1. **Cash Deposit Transaction**
   - Type: `credit`
   - Amount: `$50.00`
   - Memo: `Cash Deposit - yokove gross`
   - Status: `completed`
   - Details: `credit_details` with customer name

### Balance Changes:
- Customer 101: +$50.00
- FEES account: No change

---

## 2. CASH WITHDRAWAL (Debit Cash, With Fee)

### Input:
- Customer: yokove gross (101)
- Debit Cash: $25.00
- Apply Fee: ON

### Expected Transactions:
1. **Cash Withdrawal Transaction**
   - Type: `debit`
   - Amount: `$25.00`
   - Memo: `Cash Withdrawal - yokove gross`
   - Status: `completed`
   - Details: `debit_details` with withdrawal_type: 'cash'

2. **Transaction Fee**
   - Type: `fee`
   - Amount: `$2.25` (example, depends on fee settings)
   - Memo: `Transaction Fee: yokove gross (101)`
   - Status: `completed`
   - Details: `fee_details` with fee_type, reason, customer info

### Balance Changes:
- Customer 101: -$25.00 (withdrawal) -$2.25 (fee) = -$27.25 total
- FEES account: +$2.25

---

## 3. CHECK DEPOSIT (Credit Check, With Fee - Missing Account #)

### Input:
- Customer: yokove gross (101)
- Credit Check: $100.00, Check #2233
- No account number provided
- Apply Fee: ON

### Expected Transactions:
1. **Check Deposit Transaction**
   - Type: `credit`
   - Amount: `$100.00`
   - Memo: `Check deposit #2233`
   - Status: `completed`
   - Record created in `checks_in` table

2. **Missing Account Number Fee**
   - Type: `fee`
   - Amount: `$0.25` (example)
   - Memo: `Missing Acct # Fee: 1 check(s) at $0.25`
   - Status: `completed`
   - Details: `fee_details` with fee_type: 'check_credit_missing_account'

### Balance Changes:
- Customer 101: +$100.00 (deposit) -$0.25 (fee) = +$99.75 total
- FEES account: +$0.25

---

## 4. RUSH CASH WITHDRAWAL (With Rush Fee)

### Input:
- Customer: yokove gross (101)
- Debit Cash: $30.00
- Rush: YES
- Apply Fee: ON

### Expected Transactions:
1. **Rush Cash Withdrawal Transaction**
   - Type: `debit`
   - Amount: `$30.00`
   - Memo: `Cash Withdrawal (RUSH) - yokove gross`
   - Status: `completed`
   - Details: `debit_details` with is_rush: true

2. **Transaction Fee (including rush)**
   - Type: `fee`
   - Amount: `$5.00` (example, higher for rush)
   - Memo: `Transaction Fee: yokove gross (101)`
   - Status: `completed`
   - Details: `fee_details` with rush information

### Balance Changes:
- Customer 101: -$30.00 (withdrawal) -$5.00 (fee) = -$35.00 total
- FEES account: +$5.00

---

## 5. BOUNCED CHECK (With Bounce Fee)

### Input:
- Customer: yokove gross (101)
- Check #2233 for $100.00 (previously deposited)
- Bounce Fee: $25.00

### Expected Transactions:
1. **Original Check Transaction** (Updated)
   - Type: `credit`
   - Status: Changed from `completed` to `bounced`

2. **Bounced Check Reversal**
   - Type: `debit`
   - Amount: `$100.00`
   - Memo: `Bounced Check Reversal #2233 - yokove gross`
   - Status: `completed`
   - Details: `debit_details` with reversal_type: 'bounced_check'

3. **Bounced Check Fee**
   - Type: `fee`
   - Amount: `$25.00`
   - Memo: `Bounced check fee for check #2233 from yokove gross`
   - Status: `completed`
   - Details: `fee_details` with fee_type: 'bounced_check', check_number, etc.

### Balance Changes:
- Customer 101: -$100.00 (reversal) -$25.00 (fee) = -$125.00 total
- FEES account: +$25.00

---

## 6. CHECK REPRINT (With Reprint Fee)

### Input:
- Customer: yokove gross (101)
- Check #0118 (previously printed)
- Reprint Fee: $5.00 (if enabled)

### Expected Transactions:
1. **Reprint Fee**
   - Type: `fee`
   - Amount: `$5.00`
   - Memo: `Reprint fee for check #0118 - yokove gross`
   - Status: `completed`
   - Details: `fee_details` with fee_type: 'reprint', check details

### Balance Changes:
- Customer 101: -$5.00
- FEES account: +$5.00

---

## 7. MULTIPLE CASH WITHDRAWALS (Mixed)

### Input:
- Customer: yokove gross (101)
- Cash Withdrawals:
  - $10.00 (normal)
  - $15.00 (normal)
  - $20.00 (rush)
- Apply Fee: ON

### Expected Transactions:
1. **Cash Withdrawal #1**
   - Type: `debit`, Amount: `$10.00`
   - Memo: `Cash Withdrawal - yokove gross`

2. **Cash Withdrawal #2**
   - Type: `debit`, Amount: `$15.00`
   - Memo: `Cash Withdrawal - yokove gross`

3. **Cash Withdrawal #3 (Rush)**
   - Type: `debit`, Amount: `$20.00`
   - Memo: `Cash Withdrawal (RUSH) - yokove gross`

4. **Transaction Fee**
   - Type: `fee`
   - Amount: Calculated based on total + rush
   - Memo: `Transaction Fee: yokove gross (101)`

### Balance Changes:
- Customer 101: -$45.00 (withdrawals) -$X.XX (fee)
- FEES account: +$X.XX

---

## 8. CHECK WITHDRAWAL (Debit Check)

### Input:
- Customer: yokove gross (101)
- Check to: "John Doe"
- Amount: $50.00
- Apply Fee: ON

### Expected Transactions:
1. **Check Created** (in checks_out table)
   - Pending status
   - Gets next check number

2. **Debit Transaction**
   - Type: `debit`
   - Amount: `$50.00`
   - Memo: Linked to check

3. **Check Fee** (if applicable)
   - Type: `fee`
   - Amount: Based on check count
   - Memo: Check debit fee

### Balance Changes:
- Customer 101: -$50.00 (check) -$X.XX (fee)
- FEES account: +$X.XX

---

## Verification Checklist

For EVERY transaction, verify:

- [ ] Transaction appears in transactions list
- [ ] Correct transaction type (credit/debit/fee)
- [ ] Correct amount
- [ ] Descriptive memo with customer name
- [ ] Proper status (completed/pending/bounced)
- [ ] Customer balance updated correctly
- [ ] FEES account balance increased (for fee transactions)
- [ ] Transaction details include:
  - [ ] Customer name
  - [ ] Fee type (for fees)
  - [ ] Reason/explanation
  - [ ] Related check numbers (if applicable)
  - [ ] Timestamp
- [ ] Transaction is visible on:
  - [ ] Transaction list page
  - [ ] Customer detail page
  - [ ] Reports
  - [ ] Customer statements

---

## Common Issues to Check

### Issue: Transaction not appearing
- Check if stored procedure completed without error
- Verify transaction was inserted into database
- Check date/time filters on transaction list
- Refresh the data

### Issue: Balance mismatch
- Verify all transactions were created
- Check for duplicate transactions
- Verify FEES account was updated for fee transactions
- Check if original transaction was marked as bounced

### Issue: Missing details
- Check fee_details, debit_details, or credit_details fields
- Verify customer name is included
- Check for proper memo format

### Issue: Fees not appearing
- Verify fee calculation returned non-zero
- Check if applyFee was true
- Verify fee transaction was created
- Check FEES account balance increase

---

## Testing Script Usage

### Browser Console Test:
```javascript
// Open browser console and paste the contents of browser-transaction-tests.js
// Follow the manual test instructions
```

### Node.js Test:
```bash
# Update SUPABASE_URL and SUPABASE_KEY in test-transactions.js
npm install @supabase/supabase-js
node test-transactions.js
```

---

## Expected Results Summary

| Transaction Type | Transactions Created | FEES Account | Customer Balance |
|-----------------|---------------------|--------------|------------------|
| Cash Deposit (no fee) | 1 credit | No change | +amount |
| Cash Withdrawal (with fee) | 1 debit + 1 fee | +fee | -(amount + fee) |
| Check Deposit (with fee) | 1 credit + 1 fee | +fee | +(amount - fee) |
| Rush Withdrawal | 1 debit + 1 fee | +fee | -(amount + fee) |
| Bounced Check | 1 reversal + 1 fee | +fee | -(check + fee) |
| Reprint Check | 1 fee | +fee | -fee |
| Multiple Withdrawals | N debits + 1 fee | +fee | -(total + fee) |

---

## Manual Test Results Form

Date: __________
Tester: __________

| Test # | Transaction Type | ✓/✗ | Notes |
|--------|-----------------|-----|-------|
| 1 | Cash Deposit (no fee) | [ ] | |
| 2 | Cash Withdrawal (with fee) | [ ] | |
| 3 | Check Deposit (with fee) | [ ] | |
| 4 | Rush Withdrawal | [ ] | |
| 5 | Bounced Check | [ ] | |
| 6 | Reprint Check | [ ] | |
| 7 | Multiple Withdrawals | [ ] | |
| 8 | Check Withdrawal | [ ] | |

Issues Found:
_____________________________________
_____________________________________
_____________________________________
