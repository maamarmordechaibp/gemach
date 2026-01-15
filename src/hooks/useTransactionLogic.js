
    import React, { useState, useMemo, useCallback, useEffect } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { toast } from '@/components/ui/use-toast';
    import { useData } from '@/contexts/DataContext';
    import { useTransactionFees } from '@/hooks/useTransactionFees';

    export const useTransactionLogic = (
      selectedCustomer,
      onSuccess,
    ) => {
      const { customers, refreshData, settings } = useData();
      const [transactionState, setTransactionState] = useState(null);
      const [isProcessing, setIsProcessing] = useState(false);
      
      useEffect(() => {
        if (selectedCustomer) {
            setTransactionState({
                debitCashEntries: [{ amount: '', isRush: false }],
                debitChecks: [],
                creditCash: '',
                creditChecks: [],
                applyFee: true,
                transferDetails: {
                    toAccount: '',
                    fromAccount: selectedCustomer.account_number,
                    amount: '',
                    isLoanPayment: false,
                    loanId: null
                },
                feeSettings: settings?.transaction_fees || {},
                selectedCustomer: selectedCustomer,
            });
        } else {
            setTransactionState(null);
        }
      }, [selectedCustomer, settings]);

      const { transactionFee, feeMemo } = useTransactionFees(
        transactionState?.feeSettings, 
        transactionState
      );

      const totalDebit = useMemo(() => {
        if (!transactionState) return 0;
        const cash = transactionState.debitCashEntries.reduce(
          (sum, entry) => sum + (parseFloat(entry.amount) || 0),
          0,
        );
        const checks = transactionState.debitChecks.reduce(
          (sum, check) => sum + (parseFloat(check.amount) || 0),
          0,
        );
        return cash + checks;
      }, [transactionState]);

      const totalCredit = useMemo(() => {
        if (!transactionState) return 0;
        const cash = parseFloat(transactionState.creditCash) || 0;
        const checks = transactionState.creditChecks.reduce(
          (sum, check) => sum + (parseFloat(check.amount) || 0),
          0,
        );
        return cash + checks;
      }, [transactionState]);

      const resetState = useCallback(() => {
        if (selectedCustomer) {
            setTransactionState({
                debitCashEntries: [{ amount: '', isRush: false }],
                debitChecks: [],
                creditCash: '',
                creditChecks: [],
                applyFee: true,
                transferDetails: {
                    toAccount: '',
                    fromAccount: selectedCustomer.account_number,
                    amount: '',
                    isLoanPayment: false,
                    loanId: null
                },
                feeSettings: settings?.transaction_fees || {},
                selectedCustomer: selectedCustomer,
            });
        }
      }, [selectedCustomer, settings]);

      const handleSubmit = useCallback(async (options = {}) => {
        setIsProcessing(true);
        const { loanToCreate = null, loanToRepay = null } = options;

        if (!selectedCustomer || !transactionState) {
          toast({ title: 'Error', description: 'No customer or transaction data.', variant: 'destructive' });
          setIsProcessing(false);
          return;
        }

        const filterEmptyAndValidate = (items) => {
            return (items || []).filter(item => (item.amount || '') !== '' && parseFloat(item.amount) > 0);
        };

        const validatedCreditChecks = filterEmptyAndValidate(transactionState.creditChecks);
        const validatedDebitChecks = filterEmptyAndValidate(transactionState.debitChecks).map(check => ({
            ...check,
            pay_to_order_of: check.payToOrderOf  // Map camelCase to snake_case for database
        }));
        const validatedDebitCashEntries = filterEmptyAndValidate(transactionState.debitCashEntries);
        
        // Debug: Log the original and mapped check data for both credit and debit
        console.log('Debug - Original creditChecks:', transactionState.creditChecks);
        console.log('Debug - Original debitChecks:', transactionState.debitChecks);
        console.log('Debug - Filtered creditChecks:', filterEmptyAndValidate(transactionState.creditChecks));
        console.log('Debug - Filtered debitChecks:', filterEmptyAndValidate(transactionState.debitChecks));
        console.log('Debug - Final validatedCreditChecks being passed to process_transaction_v2:', validatedCreditChecks);
        console.log('Debug - Final validatedDebitChecks being passed to process_transaction_v2:', validatedDebitChecks);
        console.log('Debug - Credit checks with mapped field names:', validatedCreditChecks.map(c => ({
            original: c,
            mapped: {
                ...c, 
                isOnHold: c.isOnHold || false, 
                holdTags: c.holdTags || [],
                check_number: c.checkNumber || 'N/A'
            }
        })));
        
        // Debug: Expanded detailed logging to see exact field values
        validatedCreditChecks.forEach((check, index) => {
            console.log(`Debug - Credit Check ${index}:`, {
                checkNumber: check.checkNumber,
                amount: check.amount,
                isOnHold: check.isOnHold,
                holdTags: check.holdTags,
                has_account_number: check.has_account_number
            });
        });
        
        try {
            // First, call the stored procedure with basic data
            console.log('Debug - Transaction fee details:', {
                transactionFee,
                applyFee: transactionState.applyFee,
                selectedCustomer: selectedCustomer.account_number
            });
            
            const { data, error } = await supabase.rpc('process_transaction_v2', {
                p_customer_id: selectedCustomer.id,
                p_account_number: selectedCustomer.account_number,
                p_credit_cash: parseFloat(transactionState.creditCash) || 0,
                p_credit_checks: validatedCreditChecks.map(c => ({
                    amount: c.amount,
                    // Only pass basic fields to stored procedure since it's not handling check_number/isOnHold properly
                })),
                p_debit_cash_entries: validatedDebitCashEntries,
                p_debit_checks: [], // Pass empty array to stored procedure
                p_transfer_amount: parseFloat(transactionState.transferDetails.amount) || 0,
                p_transfer_to_account: transactionState.transferDetails.toAccount,
                p_apply_fee: transactionState.applyFee,
                p_loan_to_create: loanToCreate,
                p_loan_to_repay: loanToRepay
            });

            if (error) throw error;
            
            console.log('Debug - process_transaction_v2 completed successfully');
            
            // Create transaction record for credit cash if there is any
            const creditCashAmount = parseFloat(transactionState.creditCash) || 0;
            if (creditCashAmount > 0) {
                console.log('Debug - Creating transaction record for cash credit:', creditCashAmount);
                
                const cashCreditTxId = `CASH-CREDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const customer = customers.find(c => c.account_number === selectedCustomer.account_number);
                const customerName = customer ? `${customer.first_name} ${customer.last_name}` : selectedCustomer.account_number;
                
                const { error: cashCreditTxError } = await supabase.from('transactions').insert({
                    id: cashCreditTxId,
                    account_number: selectedCustomer.account_number,
                    type: 'credit',
                    amount: creditCashAmount,
                    date: new Date().toISOString(),
                    status: 'completed',
                    memo: `Cash Deposit - ${customerName}`,
                    credit_details: {
                        deposit_type: 'cash',
                        customer_name: customerName,
                        timestamp: new Date().toISOString()
                    }
                });
                
                if (cashCreditTxError) {
                    console.error('Error creating cash credit transaction record:', cashCreditTxError);
                } else {
                    console.log(`Debug - Created cash deposit transaction ${cashCreditTxId} for $${creditCashAmount}`);
                }
            }
            
            // Create transaction records for cash debit entries since stored procedure doesn't create visible ones
            if (validatedDebitCashEntries.length > 0) {
                console.log('Debug - Creating transaction records for cash withdrawals:', validatedDebitCashEntries);
                
                for (const cashEntry of validatedDebitCashEntries) {
                    const cashTxId = `CASH-DEBIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const cashAmount = parseFloat(cashEntry.amount);
                    const rushLabel = cashEntry.isRush ? ' (RUSH)' : '';
                    const customer = customers.find(c => c.account_number === selectedCustomer.account_number);
                    const customerName = customer ? `${customer.first_name} ${customer.last_name}` : selectedCustomer.account_number;
                    
                    const { error: cashTxError } = await supabase.from('transactions').insert({
                        id: cashTxId,
                        account_number: selectedCustomer.account_number,
                        type: 'debit',
                        amount: cashAmount,
                        date: new Date().toISOString(),
                        status: 'completed',
                        memo: `Cash Withdrawal${rushLabel} - ${customerName}`,
                        debit_details: {
                            withdrawal_type: 'cash',
                            is_rush: cashEntry.isRush || false,
                            customer_name: customerName,
                            timestamp: new Date().toISOString()
                        }
                    });
                    
                    if (cashTxError) {
                        console.error('Error creating cash debit transaction record:', cashTxError);
                        // Don't throw - continue with other operations
                    } else {
                        console.log(`Debug - Created cash withdrawal transaction ${cashTxId} for $${cashAmount}`);
                    }
                }
            }
            
            if (transactionState.applyFee && transactionFee > 0) {
                console.log(`Debug - Transaction fee of $${transactionFee} should have been applied by stored procedure`);
                
                // Create a proper fee transaction record with full details
                try {
                    const feeTxId = `FEE-TRANSACTION-${Date.now()}`;
                    const customer = customers.find(c => c.account_number === selectedCustomer.account_number);
                    const customerName = customer ? `${customer.first_name} ${customer.last_name}` : selectedCustomer.account_number;
                    
                    // Determine fee type and detailed reason
                    let feeType = 'transaction';
                    let detailedMemo = feeMemo || 'Transaction fee';
                    
                    // Create the fee transaction record
                    console.log(`Debug - Creating fee transaction record: ${feeTxId} for $${transactionFee}`);
                    const { error: feeTransactionError } = await supabase.from('transactions').insert({
                        id: feeTxId,
                        account_number: selectedCustomer.account_number,
                        type: 'fee',
                        amount: transactionFee,
                        date: new Date().toISOString(),
                        status: 'completed',
                        memo: detailedMemo,
                        fee_details: {
                            fee_type: feeType,
                            reason: detailedMemo,
                            from_account: selectedCustomer.account_number,
                            from_customer: customerName,
                            related_transaction_id: data?.transaction_id || null,
                            cash_withdrawal_amount: parseFloat(transactionState.debitCashEntries.reduce((sum, entry) => sum + (parseFloat(entry.amount) || 0), 0)) || null,
                            check_count: validatedDebitChecks.length + validatedCreditChecks.length || null,
                            timestamp: new Date().toISOString()
                        }
                    });
                    
                    if (feeTransactionError) {
                        console.error('Error creating fee transaction record:', feeTransactionError);
                        throw feeTransactionError;
                    }
                    
                    console.log(`Debug - Fee transaction record created successfully`);
                    
                    // Now update the FEES account balance
                    console.log(`Debug - Adding transaction fee of $${transactionFee} to FEES account`);
                    const { error: feeAccountError } = await supabase.rpc('execute_sql', {
                        sql: `UPDATE customers SET balance = balance + ${transactionFee} WHERE account_number = 'FEES';`
                    });
                    
                    if (feeAccountError) {
                        console.error('Error updating FEES account with transaction fee:', feeAccountError);
                    } else {
                        console.log(`Debug - Successfully added transaction fee of $${transactionFee} to FEES account`);
                    }
                } catch (feeError) {
                    console.error('Error processing transaction fee:', feeError);
                    // Don't fail the entire transaction if fee recording fails
                    toast({
                        title: "Fee Recording Warning",
                        description: "Transaction completed but fee may not have been recorded properly.",
                        variant: "warning"
                    });
                }
            }

            // Now manually update the checks_in records with the missing fields if we have credit checks
            if (validatedCreditChecks.length > 0) {
                // Get the most recent checks_in records for this customer to update them
                const { data: recentChecksIn, error: checksInError } = await supabase
                    .from('checks_in')
                    .select('id, amount')
                    .eq('account_number', selectedCustomer.account_number)
                    .order('date', { ascending: false })
                    .limit(validatedCreditChecks.length);

                if (checksInError) {
                    console.error('Error getting recent checks_in records:', checksInError);
                } else if (recentChecksIn && recentChecksIn.length > 0) {
                    // Match and update each check with the correct check_number and hold status
                    for (let i = 0; i < validatedCreditChecks.length; i++) {
                        const creditCheck = validatedCreditChecks[i];
                        const dbCheck = recentChecksIn.find(dbC => 
                            Math.abs(parseFloat(dbC.amount) - parseFloat(creditCheck.amount)) < 0.01
                        );

                        if (dbCheck) {
                            const updateData = {
                                check_number: creditCheck.checkNumber || 'N/A',
                                is_on_hold: creditCheck.isOnHold || false,
                                hold_tags: creditCheck.holdTags || []
                            };

                            console.log(`Debug - Updating checks_in record ${dbCheck.id} with:`, updateData);
                            console.log(`Debug - Original check data: checkNumber=${creditCheck.checkNumber}, amount=${creditCheck.amount}`);

                            const { error: updateError } = await supabase
                                .from('checks_in')
                                .update(updateData)
                                .eq('id', dbCheck.id);

                            if (updateError) {
                                console.error(`Error updating checks_in record ${dbCheck.id}:`, updateError);
                            } else {
                                console.log(`Debug - Successfully updated checks_in record ${dbCheck.id} with check number ${updateData.check_number}`);
                            }
                        } else {
                            console.warn(`Debug - Could not find matching database record for credit check amount ${creditCheck.amount}`);
                        }
                    }
                }
            }

            // Now handle the debit checks separately if there are any
            if (validatedDebitChecks.length > 0) {
                // We need to get the actual transaction ID that was created
                // Let's query for the most recent transaction for this customer using timestamp order
                const { data: recentTx, error: txError } = await supabase
                    .from('transactions')
                    .select('id')
                    .eq('account_number', selectedCustomer.account_number)
                    .order('date', { ascending: false })
                    .limit(1)
                    .single();

                if (txError) {
                    console.error('Error getting transaction ID with date order:', txError);
                    
                    // Fallback: try to get any transaction for this customer
                    const { data: fallbackTx, error: fallbackError } = await supabase
                        .from('transactions')
                        .select('id')
                        .eq('account_number', selectedCustomer.account_number)
                        .limit(1)
                        .single();
                    
                    if (fallbackError || !fallbackTx) {
                        console.error('Fallback transaction query also failed:', fallbackError);
                        // Last resort: create a simple transaction ID
                        const simpleTransactionId = `DEBIT-${Date.now()}`;
                        
                        // Create a basic transaction record first
                        const { error: createTxError } = await supabase.from('transactions').insert({
                            id: simpleTransactionId,
                            account_number: selectedCustomer.account_number,
                            type: 'debit',
                            amount: validatedDebitChecks.reduce((sum, check) => sum + parseFloat(check.amount), 0),
                            date: new Date().toISOString(),
                            status: 'completed',
                            memo: 'Check transaction'
                        });

                        if (createTxError) {
                            console.error('Error creating transaction:', createTxError);
                            throw new Error('Could not create transaction for checks');
                        }

                        const transactionId = simpleTransactionId;
                        console.log('Debug - Using manually created transaction ID:', transactionId);
                        
                        // Create checks manually using direct database insertion
                        const checksToInsert = await Promise.all(
                            validatedDebitChecks.map(async (check) => {
                                // Get next check number
                                const { data: nextCheckData, error: nextCheckError } = await supabase.rpc('get_next_check_number');
                                if (nextCheckError) throw nextCheckError;

                                return {
                                    transaction_id: transactionId,
                                    account_number: selectedCustomer.account_number,
                                    check_number: nextCheckData,
                                    pay_to_order_of: check.payToOrderOf, // Use the original camelCase field
                                    amount: parseFloat(check.amount),
                                    memo: check.memo || '',
                                    date: new Date().toISOString(),
                                    status: 'pending',
                                    is_printed: false,
                                    is_rush: check.isRush || false
                                };
                            })
                        );

                        console.log('Debug - About to insert checks with manual transaction:', checksToInsert);

                        // Insert the checks directly into the database
                        const { error: checksError } = await supabase
                            .from('checks_out')
                            .insert(checksToInsert);

                        if (checksError) {
                            console.error('Error inserting checks:', checksError);
                            throw checksError;
                        }

                        console.log('Debug - Checks inserted successfully with manual transaction');
                        return; // Exit early since we handled everything
                    } else {
                        const transactionId = fallbackTx.id;
                        console.log('Debug - Using fallback transaction ID:', transactionId);
                        
                        // Create checks manually using direct database insertion
                        const checksToInsert = await Promise.all(
                            validatedDebitChecks.map(async (check) => {
                                // Get next check number
                                const { data: nextCheckData, error: nextCheckError } = await supabase.rpc('get_next_check_number');
                                if (nextCheckError) throw nextCheckError;

                                return {
                                    transaction_id: transactionId,
                                    account_number: selectedCustomer.account_number,
                                    check_number: nextCheckData,
                                    pay_to_order_of: check.payToOrderOf, // Use the original camelCase field
                                    amount: parseFloat(check.amount),
                                    memo: check.memo || '',
                                    date: new Date().toISOString(),
                                    status: 'pending',
                                    is_printed: false,
                                    is_rush: check.isRush || false
                                };
                            })
                        );

                        console.log('Debug - About to insert checks with fallback transaction:', checksToInsert);

                        // Insert the checks directly into the database
                        const { error: checksError } = await supabase
                            .from('checks_out')
                            .insert(checksToInsert);

                        if (checksError) {
                            console.error('Error inserting checks:', checksError);
                            throw checksError;
                        }

                        console.log('Debug - Checks inserted successfully with fallback transaction');
                        return; // Exit early since we handled everything
                    }
                }

                const transactionId = recentTx.id;
                console.log('Debug - Using transaction ID:', transactionId);
                
                // Create checks manually using direct database insertion
                const checksToInsert = await Promise.all(
                    validatedDebitChecks.map(async (check) => {
                        // Get next check number
                        const { data: nextCheckData, error: nextCheckError } = await supabase.rpc('get_next_check_number');
                        if (nextCheckError) throw nextCheckError;

                        return {
                            transaction_id: transactionId,
                            account_number: selectedCustomer.account_number,
                            check_number: nextCheckData,
                            pay_to_order_of: check.payToOrderOf, // Use the original camelCase field
                            amount: parseFloat(check.amount),
                            memo: check.memo || '',
                            date: new Date().toISOString(),
                            status: 'pending',
                            is_printed: false,
                            is_rush: check.isRush || false
                        };
                    })
                );

                console.log('Debug - About to insert checks:', checksToInsert);

                // Insert the checks directly into the database
                const { error: checksError } = await supabase
                    .from('checks_out')
                    .insert(checksToInsert);

                if (checksError) {
                    console.error('Error inserting checks:', checksError);
                    throw checksError;
                }

                console.log('Debug - Checks inserted successfully');
            }

            toast({ title: "Success", description: "Transaction completed successfully." });
            
            // Force a complete data refresh to ensure we get the latest check data
            setTimeout(() => {
                refreshData();
            }, 1000); // Small delay to ensure database commit is complete
            
            if (onSuccess) onSuccess();

        } catch (error) {
            toast({ title: "Transaction Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
      }, [
        selectedCustomer, 
        customers,
        transactionState,
        transactionFee,
        feeMemo,
        onSuccess, 
        refreshData
      ]);

      return {
        transactionState,
        setTransactionState,
        transactionFee,
        feeMemo,
        totalDebit,
        totalCredit,
        handleSubmit,
        resetState,
        isProcessing,
      };
    };
  