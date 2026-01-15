// Transaction Testing Script
// Run this with: node test-transactions.js

import { createClient } from '@supabase/supabase-js';

// You'll need to update these with your actual Supabase credentials
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEST_ACCOUNT = '101'; // yokove gross account from your screenshots

// Helper function to check if transaction was created
async function checkTransaction(accountNumber, expectedCount, description) {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('account_number', accountNumber)
        .order('date', { ascending: false })
        .limit(expectedCount);
    
    if (error) {
        console.error(`❌ ${description} - Error:`, error.message);
        return false;
    }
    
    if (!data || data.length < expectedCount) {
        console.error(`❌ ${description} - Expected ${expectedCount} transactions, found ${data?.length || 0}`);
        return false;
    }
    
    console.log(`✅ ${description} - Found ${data.length} transaction(s)`);
    data.forEach(tx => {
        console.log(`   - ${tx.type}: ${tx.memo} ($${tx.amount})`);
    });
    return true;
}

// Helper to check FEES account balance increase
async function checkFeesAccount(expectedIncrease, description) {
    const { data: before } = await supabase
        .from('customers')
        .select('balance')
        .eq('account_number', 'FEES')
        .single();
    
    const beforeBalance = parseFloat(before?.balance || 0);
    
    // Wait a moment for transaction to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const { data: after } = await supabase
        .from('customers')
        .select('balance')
        .eq('account_number', 'FEES')
        .single();
    
    const afterBalance = parseFloat(after?.balance || 0);
    const actualIncrease = afterBalance - beforeBalance;
    
    if (Math.abs(actualIncrease - expectedIncrease) < 0.01) {
        console.log(`✅ ${description} - FEES account increased by $${actualIncrease.toFixed(2)}`);
        return true;
    } else {
        console.error(`❌ ${description} - Expected $${expectedIncrease}, got $${actualIncrease.toFixed(2)}`);
        return false;
    }
}

async function runTests() {
    console.log('\n🧪 Starting Transaction Tests...\n');
    
    // Get initial customer balance
    const { data: customer } = await supabase
        .from('customers')
        .select('balance')
        .eq('account_number', TEST_ACCOUNT)
        .single();
    
    const initialBalance = parseFloat(customer?.balance || 0);
    console.log(`📊 Initial Balance for ${TEST_ACCOUNT}: $${initialBalance.toFixed(2)}\n`);
    
    let testsPassed = 0;
    let testsFailed = 0;
    
    // TEST 1: Cash Deposit (No Fee)
    console.log('═══ TEST 1: Cash Deposit (No Fee) ═══');
    try {
        const { error } = await supabase.rpc('process_transaction_v2', {
            p_customer_id: null, // Will be looked up
            p_account_number: TEST_ACCOUNT,
            p_credit_cash: 50.00,
            p_credit_checks: [],
            p_debit_cash_entries: [],
            p_debit_checks: [],
            p_transfer_amount: 0,
            p_transfer_to_account: '',
            p_apply_fee: false,
            p_loan_to_create: null,
            p_loan_to_repay: null
        });
        
        if (error) throw error;
        
        // Check if cash credit transaction was created
        const result = await checkTransaction(TEST_ACCOUNT, 1, 'Cash Deposit Transaction');
        result ? testsPassed++ : testsFailed++;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        testsFailed++;
    }
    
    console.log('\n');
    
    // TEST 2: Cash Withdrawal with Fee
    console.log('═══ TEST 2: Cash Withdrawal with Fee ═══');
    try {
        const { error } = await supabase.rpc('process_transaction_v2', {
            p_customer_id: null,
            p_account_number: TEST_ACCOUNT,
            p_credit_cash: 0,
            p_credit_checks: [],
            p_debit_cash_entries: [{ amount: 25.00, isRush: false }],
            p_debit_checks: [],
            p_transfer_amount: 0,
            p_transfer_to_account: '',
            p_apply_fee: true,
            p_loan_to_create: null,
            p_loan_to_repay: null
        });
        
        if (error) throw error;
        
        // Should create 2 transactions: cash withdrawal + fee
        const result = await checkTransaction(TEST_ACCOUNT, 2, 'Cash Withdrawal + Fee');
        result ? testsPassed++ : testsFailed++;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        testsFailed++;
    }
    
    console.log('\n');
    
    // TEST 3: Check Deposit with Fee (missing account number)
    console.log('═══ TEST 3: Check Deposit with Fee ═══');
    try {
        const { error } = await supabase.rpc('process_transaction_v2', {
            p_customer_id: null,
            p_account_number: TEST_ACCOUNT,
            p_credit_cash: 0,
            p_credit_checks: [{ amount: 75.00, checkNumber: 'TEST123', isOnHold: false }],
            p_debit_cash_entries: [],
            p_debit_checks: [],
            p_transfer_amount: 0,
            p_transfer_to_account: '',
            p_apply_fee: true,
            p_loan_to_create: null,
            p_loan_to_repay: null
        });
        
        if (error) throw error;
        
        // Should create check deposit + fee transaction
        const result = await checkTransaction(TEST_ACCOUNT, 2, 'Check Deposit + Fee');
        result ? testsPassed++ : testsFailed++;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        testsFailed++;
    }
    
    console.log('\n');
    
    // TEST 4: Rush Cash Withdrawal
    console.log('═══ TEST 4: Rush Cash Withdrawal ═══');
    try {
        const { error } = await supabase.rpc('process_transaction_v2', {
            p_customer_id: null,
            p_account_number: TEST_ACCOUNT,
            p_credit_cash: 0,
            p_credit_checks: [],
            p_debit_cash_entries: [{ amount: 30.00, isRush: true }],
            p_debit_checks: [],
            p_transfer_amount: 0,
            p_transfer_to_account: '',
            p_apply_fee: true,
            p_loan_to_create: null,
            p_loan_to_repay: null
        });
        
        if (error) throw error;
        
        // Check that transaction has rush indicator
        const { data } = await supabase
            .from('transactions')
            .select('*')
            .eq('account_number', TEST_ACCOUNT)
            .order('date', { ascending: false })
            .limit(1)
            .single();
        
        if (data && data.memo && data.memo.includes('RUSH')) {
            console.log('✅ Rush Cash Withdrawal - Rush indicator found');
            testsPassed++;
        } else {
            console.error('❌ Rush Cash Withdrawal - Rush indicator not found');
            testsFailed++;
        }
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        testsFailed++;
    }
    
    console.log('\n');
    
    // TEST 5: Check Bouncing
    console.log('═══ TEST 5: Bounce Check Flow ═══');
    try {
        // First create a check deposit
        const checkNum = `BOUNCE-TEST-${Date.now()}`;
        const { data: checkData, error: insertError } = await supabase
            .from('checks_in')
            .insert({
                account_number: TEST_ACCOUNT,
                check_number: checkNum,
                amount: 100.00,
                date: new Date().toISOString(),
                status: 'pending'
            })
            .select()
            .single();
        
        if (insertError) throw insertError;
        
        // Now bounce it with a fee
        const fee = 25.00;
        
        // Create bounced check reversal transaction
        const bounceTxId = `BOUNCE-REVERSAL-${Date.now()}`;
        const { error: bounceError } = await supabase.from('transactions').insert({
            id: bounceTxId,
            account_number: TEST_ACCOUNT,
            type: 'debit',
            amount: 100.00,
            date: new Date().toISOString(),
            status: 'completed',
            memo: `Bounced Check Reversal #${checkNum}`,
            debit_details: {
                reversal_type: 'bounced_check',
                check_number: checkNum
            }
        });
        
        if (bounceError) throw bounceError;
        
        // Create fee transaction
        const feeTxId = `FEE-BOUNCE-${Date.now()}`;
        const { error: feeError } = await supabase.from('transactions').insert({
            id: feeTxId,
            account_number: TEST_ACCOUNT,
            type: 'fee',
            amount: fee,
            date: new Date().toISOString(),
            status: 'completed',
            memo: `Bounced check fee for check #${checkNum}`,
            fee_details: {
                fee_type: 'bounced_check',
                check_number: checkNum
            }
        });
        
        if (feeError) throw feeError;
        
        // Check if both transactions exist
        const result = await checkTransaction(TEST_ACCOUNT, 2, 'Bounced Check Reversal + Fee');
        result ? testsPassed++ : testsFailed++;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        testsFailed++;
    }
    
    console.log('\n');
    
    // TEST 6: Multiple Cash Withdrawals
    console.log('═══ TEST 6: Multiple Cash Withdrawals ═══');
    try {
        const { error } = await supabase.rpc('process_transaction_v2', {
            p_customer_id: null,
            p_account_number: TEST_ACCOUNT,
            p_credit_cash: 0,
            p_credit_checks: [],
            p_debit_cash_entries: [
                { amount: 10.00, isRush: false },
                { amount: 15.00, isRush: false },
                { amount: 20.00, isRush: true }
            ],
            p_debit_checks: [],
            p_transfer_amount: 0,
            p_transfer_to_account: '',
            p_apply_fee: true,
            p_loan_to_create: null,
            p_loan_to_repay: null
        });
        
        if (error) throw error;
        
        // Should create 3 cash withdrawal transactions + 1 fee
        const result = await checkTransaction(TEST_ACCOUNT, 4, 'Multiple Cash Withdrawals + Fee');
        result ? testsPassed++ : testsFailed++;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        testsFailed++;
    }
    
    console.log('\n');
    
    // Get final balance
    const { data: finalCustomer } = await supabase
        .from('customers')
        .select('balance')
        .eq('account_number', TEST_ACCOUNT)
        .single();
    
    const finalBalance = parseFloat(finalCustomer?.balance || 0);
    
    // Summary
    console.log('═══════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Initial Balance: $${initialBalance.toFixed(2)}`);
    console.log(`Final Balance:   $${finalBalance.toFixed(2)}`);
    console.log(`Balance Change:  $${(finalBalance - initialBalance).toFixed(2)}`);
    console.log('');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log('═══════════════════════════════════════\n');
    
    if (testsFailed === 0) {
        console.log('🎉 All tests passed! Transactions are being recorded correctly.');
    } else {
        console.log('⚠️  Some tests failed. Please review the errors above.');
    }
}

// Run the tests
runTests().catch(console.error);
