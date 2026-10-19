import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

// Only rows with a positive amount — matches what process_transaction_v2 receives,
// so per-check fee indexes in the breakdown line up with the submitted lists.
export const positiveAmountRows = (items) => (items || []).filter(item => (parseFloat(item.amount) || 0) > 0);

export const useTransactionFees = (feeSettings, transactionState) => {
    const { debitCashEntries, debitChecks, creditChecks, selectedCustomer, applyFee, waivedFees, creditCash } = transactionState || {};
    const [transactionFee, setTransactionFee] = useState(0);
    const [feeMemo, setFeeMemo] = useState('');
    // [{ type, label, description, amount, waived, items: [{ index, fee }] }]
    const [feeBreakdown, setFeeBreakdown] = useState([]);

    const calculateTransactionFee = useCallback(async () => {
        if (!applyFee || !feeSettings?.enabled || !selectedCustomer || !transactionState) {
            setTransactionFee(0);
            setFeeMemo('');
            setFeeBreakdown([]);
            return;
        };

        try {
            const { data, error } = await supabase.rpc('calculate_fee_v2', {
                p_account_number: selectedCustomer.account_number,
                p_debit_cash_entries: positiveAmountRows(debitCashEntries),
                p_debit_checks: positiveAmountRows(debitChecks),
                p_credit_checks: positiveAmountRows(creditChecks),
                p_waived_fees: waivedFees || [],
                p_cash_deposit: parseFloat(creditCash) || 0
            });

            if (error) throw error;
            
            if(data && data.length > 0) {
                setTransactionFee(parseFloat(data[0].fee) || 0);
                setFeeMemo(data[0].memo);
                setFeeBreakdown(Array.isArray(data[0].details) ? data[0].details : []);
            } else {
                setTransactionFee(0);
                setFeeMemo('');
                setFeeBreakdown([]);
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
            setFeeBreakdown([]);
        }
    }, [applyFee, feeSettings, debitCashEntries, debitChecks, creditChecks, selectedCustomer, transactionState, waivedFees, creditCash]);

    useEffect(() => {
        calculateTransactionFee();
    }, [calculateTransactionFee]);

    return { transactionFee, feeMemo, feeBreakdown };
};