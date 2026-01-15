import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

export const useTransactionFees = (feeSettings, transactionState) => {
    const { debitCashEntries, debitChecks, creditChecks, selectedCustomer, applyFee } = transactionState || {};
    const [transactionFee, setTransactionFee] = useState(0);
    const [feeMemo, setFeeMemo] = useState('');

    const calculateTransactionFee = useCallback(async () => {
        if (!applyFee || !feeSettings?.enabled || !selectedCustomer || !transactionState) {
            setTransactionFee(0);
            setFeeMemo('');
            return;
        };
        
        const filterEmpty = (items) => (items || []).filter(item => (item.amount || '') !== '');

        try {
            const { data, error } = await supabase.rpc('calculate_fee_v2', {
                p_account_number: selectedCustomer.account_number,
                p_debit_cash_entries: filterEmpty(debitCashEntries),
                p_debit_checks: filterEmpty(debitChecks),
                p_credit_checks: filterEmpty(creditChecks)
            });

            if (error) throw error;
            
            if(data && data.length > 0) {
                setTransactionFee(data[0].fee);
                setFeeMemo(data[0].memo);
            } else {
                setTransactionFee(0);
                setFeeMemo('');
            }
        } catch(error) {
            console.error("Error calculating fee:", error);
            toast({
                title: "Fee Calculation Failed",
                description: error.message,
                variant: "destructive"
            });
            setTransactionFee(0);
            setFeeMemo('');
        }
    }, [applyFee, feeSettings, debitCashEntries, debitChecks, creditChecks, selectedCustomer, transactionState]);

    useEffect(() => {
        calculateTransactionFee();
    }, [calculateTransactionFee]);

    return { transactionFee, feeMemo };
};