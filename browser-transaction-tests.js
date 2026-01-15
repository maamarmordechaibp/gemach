/**
 * BROWSER-BASED TRANSACTION TESTS
 * 
 * How to run:
 * 1. Open your app in the browser
 * 2. Open Developer Tools (F12)
 * 3. Go to Console tab
 * 4. Copy and paste this entire file into the console
 * 5. The tests will run automatically
 * 
 * This will test all transaction types to ensure they're being recorded properly.
 */

(async function runTransactionTests() {
    console.log('%c🧪 TRANSACTION SYSTEM TESTS', 'font-size: 20px; font-weight: bold; color: #4CAF50;');
    console.log('═══════════════════════════════════════\n');
    
    const TEST_ACCOUNT = '101'; // Change this to a test account number
    let passedTests = 0;
    let failedTests = 0;
    const results = [];
    
    // Helper function to wait
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Get Supabase client from window (should be available in the app)
    const supabase = window.supabase || (() => {
        console.error('Supabase client not found in window. Make sure you are running this in your app.');
        throw new Error('Supabase client not available');
    })();
    
    console.log('Starting tests...\n');
    
    try {
        // Get initial balance
        const { data: customerData } = await supabase
            .from('customers')
            .select('balance')
            .eq('account_number', TEST_ACCOUNT)
            .single();
        
        const initialBalance = customerData ? parseFloat(customerData.balance) : 0;
        console.log(`📊 Initial Balance: $${initialBalance.toFixed(2)}\n`);
        
        // ═══ TEST 1: Cash Deposit (No Fee) ═══
        console.log('═══ TEST 1: Cash Deposit (No Fee) ═══');
        console.log('Expected: 1 credit transaction');
        // You would need to trigger this through your UI or API
        // For now, we'll note what should happen
        console.log('⚠️  Manual Test - Please:');
        console.log('   1. Select customer 101');
        console.log('   2. Add cash deposit of $50');
        console.log('   3. Disable fees');
        console.log('   4. Process transaction');
        console.log('   Expected: 1 cash deposit transaction\n');
        
        // ═══ TEST 2: Cash Withdrawal with Fee ═══
        console.log('═══ TEST 2: Cash Withdrawal with Fee ═══');
        console.log('Expected: 1 debit + 1 fee transaction');
        console.log('⚠️  Manual Test - Please:');
        console.log('   1. Select customer 101');
        console.log('   2. Add cash withdrawal of $25');
        console.log('   3. Enable fees');
        console.log('   4. Process transaction');
        console.log('   Expected: 1 cash withdrawal + 1 fee transaction\n');
        
        // ═══ TEST 3: Check Deposit with Fee ═══
        console.log('═══ TEST 3: Check Deposit with Fee ═══');
        console.log('Expected: 1 check credit + 1 fee transaction');
        console.log('⚠️  Manual Test - Please:');
        console.log('   1. Select customer 101');
        console.log('   2. Add check deposit of $100 (no account number)');
        console.log('   3. Enable fees');
        console.log('   4. Process transaction');
        console.log('   Expected: 1 check deposit + 1 missing account fee\n');
        
        // ═══ TEST 4: Bounced Check ═══
        console.log('═══ TEST 4: Bounced Check ═══');
        console.log('Expected: 1 reversal debit + 1 fee transaction');
        console.log('⚠️  Manual Test - Please:');
        console.log('   1. Go to Checks In');
        console.log('   2. Find a pending check for customer 101');
        console.log('   3. Click bounce with $25 fee');
        console.log('   Expected: 1 reversal transaction + 1 bounce fee\n');
        
        // ═══ TEST 5: Rush Cash Withdrawal ═══
        console.log('═══ TEST 5: Rush Cash Withdrawal ═══');
        console.log('Expected: 1 debit with RUSH label + 1 fee transaction');
        console.log('⚠️  Manual Test - Please:');
        console.log('   1. Select customer 101');
        console.log('   2. Add cash withdrawal of $30');
        console.log('   3. Check "Rush" checkbox');
        console.log('   4. Enable fees');
        console.log('   5. Process transaction');
        console.log('   Expected: 1 cash withdrawal (RUSH) + 1 fee\n');
        
        // ═══ TEST 6: Check Reprint ═══
        console.log('═══ TEST 6: Check Reprint ═══');
        console.log('Expected: 1 fee transaction');
        console.log('⚠️  Manual Test - Please:');
        console.log('   1. Go to Checks Out');
        console.log('   2. Find a printed check for customer 101');
        console.log('   3. Click reprint (with reprint fee enabled in settings)');
        console.log('   Expected: 1 reprint fee transaction\n');
        
        // Summary of what to check
        console.log('\n═══════════════════════════════════════');
        console.log('%c📋 MANUAL TEST CHECKLIST', 'font-size: 16px; font-weight: bold;');
        console.log('═══════════════════════════════════════');
        console.log('\nAfter performing each test above, check:');
        console.log('✓ Transaction appears in transaction list');
        console.log('✓ Correct amount and type');
        console.log('✓ Proper description/memo');
        console.log('✓ Customer balance updated correctly');
        console.log('✓ FEES account balance increased (for fees)');
        console.log('✓ Fee details include customer name, reason, type');
        console.log('\n═══════════════════════════════════════\n');
        
        // Auto-check: Query recent transactions
        console.log('%cAuto-checking recent transactions for account 101...', 'color: blue; font-weight: bold;');
        
        const { data: recentTransactions } = await supabase
            .from('transactions')
            .select('*')
            .eq('account_number', TEST_ACCOUNT)
            .order('date', { ascending: false })
            .limit(20);
        
        console.log(`\n📊 Last 20 transactions for account ${TEST_ACCOUNT}:`);
        console.table(recentTransactions.map(tx => ({
            Date: new Date(tx.date).toLocaleString(),
            Type: tx.type,
            Amount: `$${tx.amount}`,
            Description: tx.memo,
            Status: tx.status
        })));
        
        // Check transaction types coverage
        const types = new Set(recentTransactions.map(tx => tx.type));
        console.log('\n📊 Transaction types found:');
        types.forEach(type => {
            const count = recentTransactions.filter(tx => tx.type === type).length;
            console.log(`  • ${type}: ${count} transaction(s)`);
        });
        
        // Check for detailed metadata
        console.log('\n🔍 Checking transaction metadata...');
        const withFeeDetails = recentTransactions.filter(tx => tx.fee_details).length;
        const withDebitDetails = recentTransactions.filter(tx => tx.debit_details).length;
        const withCreditDetails = recentTransactions.filter(tx => tx.credit_details).length;
        
        console.log(`  • Transactions with fee_details: ${withFeeDetails}`);
        console.log(`  • Transactions with debit_details: ${withDebitDetails}`);
        console.log(`  • Transactions with credit_details: ${withCreditDetails}`);
        
        if (withFeeDetails > 0 || withDebitDetails > 0 || withCreditDetails > 0) {
            console.log('  %c✅ Transactions include detailed metadata', 'color: green;');
        } else {
            console.log('  %c⚠️  No detailed metadata found', 'color: orange;');
        }
        
        // Check FEES account
        const { data: feesAccount } = await supabase
            .from('customers')
            .select('balance')
            .eq('account_number', 'FEES')
            .single();
        
        if (feesAccount) {
            console.log(`\n💰 FEES Account Balance: $${parseFloat(feesAccount.balance).toFixed(2)}`);
        }
        
        // Final summary
        console.log('\n═══════════════════════════════════════');
        console.log('%c✅ TEST SCRIPT COMPLETE', 'font-size: 16px; font-weight: bold; color: green;');
        console.log('═══════════════════════════════════════');
        console.log('\nPlease perform the manual tests listed above');
        console.log('and verify that all transactions are recorded correctly.\n');
        
    } catch (error) {
        console.error('%c❌ Test script error:', 'color: red; font-weight: bold;', error);
    }
})();
