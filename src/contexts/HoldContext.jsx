
    import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useData } from '@/contexts/DataContext';
    import { toast } from '@/components/ui/use-toast';

    const HoldContext = createContext();

    export const useHold = () => useContext(HoldContext);

    export const HoldProvider = ({ children }) => {
        const { checksIn, refreshData } = useData();
        const [heldChecks, setHeldChecks] = useState([]);
        const [tagOptions, setTagOptions] = useState([]);
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            if (checksIn) {
                setHeldChecks(checksIn.filter(c => c.is_on_hold && parseFloat(c.amount) > (c.hold_cleared_amount || 0)));
            }
        }, [checksIn]);

        const fetchHoldTags = useCallback(async () => {
            const { data, error } = await supabase.from('hold_tags').select('tag');
            if (data) {
                setTagOptions(data.map(t => ({ label: t.tag, value: t.tag })));
            }
        }, []);
        
        useEffect(() => {
            fetchHoldTags();
        }, [fetchHoldTags]);

        const releaseFunds = async (checkIds) => {
            setLoading(true);
            console.log('Debug - Releasing funds for check IDs:', checkIds);
            
            try {
                const { data: checksToRelease, error: fetchError } = await supabase
                    .from('checks_in')
                    .select('id, amount, account_number, hold_cleared_amount')
                    .in('id', checkIds);

                if (fetchError) throw fetchError;
                
                console.log('Debug - Checks to release:', checksToRelease);
                
                let balanceUpdates = {};
                
                checksToRelease.forEach(check => {
                    const remainingAmount = parseFloat(check.amount) - (check.hold_cleared_amount || 0);
                    if (!balanceUpdates[check.account_number]) {
                        balanceUpdates[check.account_number] = 0;
                    }
                    balanceUpdates[check.account_number] += remainingAmount;
                });
                
                console.log('Debug - Balance updates to apply:', balanceUpdates);
                
                const customerUpdates = Object.keys(balanceUpdates).map(account_number => 
                    supabase.rpc('execute_sql', { sql: `UPDATE customers SET balance = balance + ${balanceUpdates[account_number]} WHERE account_number = '${account_number}'` })
                );

                await Promise.all(customerUpdates);

                // Update checks to show they're fully cleared by setting hold_cleared_amount to the full amount
                const updatePromises = checksToRelease.map(check => 
                    supabase
                        .from('checks_in')
                        .update({ 
                            hold_cleared_amount: parseFloat(check.amount), 
                            status: 'cleared' 
                        })
                        .eq('id', check.id)
                );

                const updateResults = await Promise.all(updatePromises);
                
                // Check if any updates failed
                const updateErrors = updateResults.filter(result => result.error);
                if (updateErrors.length > 0) {
                    console.error('Debug - Update errors:', updateErrors);
                    throw updateErrors[0].error;
                }
                
                console.log('Debug - Successfully released funds for all checks');
                toast({ title: 'Success', description: `${checkIds.length} check(s) have been fully cleared.` });
                refreshData();

            } catch (error) {
                toast({ title: 'Error Releasing Funds', description: error.message, variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        
        const releasePartialFunds = async (tag, amountToRelease) => {
            setLoading(true);
            let amount = parseFloat(amountToRelease);
            if(isNaN(amount) || amount <= 0) {
                 toast({ title: 'Invalid Amount', variant: 'destructive' });
                 setLoading(false);
                 return;
            }

            try {
                const { data: checks, error: fetchError } = await supabase
                    .from('checks_in')
                    .select('id, amount, account_number, hold_cleared_amount')
                    .contains('hold_tags', [tag])
                    .order('date', { ascending: true });

                if (fetchError) throw fetchError;

                // Filter checks that still have remaining amount to release
                const availableChecks = checks.filter(check => {
                    const remainingAmount = parseFloat(check.amount) - (check.hold_cleared_amount || 0);
                    return remainingAmount > 0;
                });

                let balanceUpdates = {};
                let checkUpdates = [];
                
                for (const check of availableChecks) {
                    if (amount <= 0) break;

                    const remainingOnCheck = parseFloat(check.amount) - (check.hold_cleared_amount || 0);
                    const amountToClear = Math.min(amount, remainingOnCheck);
                    
                    if (!balanceUpdates[check.account_number]) {
                        balanceUpdates[check.account_number] = 0;
                    }
                    balanceUpdates[check.account_number] += amountToClear;

                    const newClearedAmount = (check.hold_cleared_amount || 0) + amountToClear;
                    checkUpdates.push(
                        supabase.from('checks_in')
                        .update({ 
                            hold_cleared_amount: newClearedAmount,
                            status: newClearedAmount >= parseFloat(check.amount) ? 'cleared' : 'pending'
                        })
                        .eq('id', check.id)
                    );
                    
                    amount -= amountToClear;
                }

                const customerUpdates = Object.keys(balanceUpdates).map(account_number => 
                    supabase.rpc('execute_sql', { sql: `UPDATE customers SET balance = balance + ${balanceUpdates[account_number]} WHERE account_number = '${account_number}'` })
                );

                await Promise.all([...customerUpdates, ...checkUpdates]);

                toast({ title: 'Success', description: `$${amountToRelease} released for tag "${tag}".` });
                refreshData();

            } catch (error) {
                toast({ title: 'Error During Partial Release', description: error.message, variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };

        return (
            <HoldContext.Provider value={{ heldChecks, loading, releaseFunds, releasePartialFunds, tagOptions }}>
                {children}
            </HoldContext.Provider>
        );
    };
  