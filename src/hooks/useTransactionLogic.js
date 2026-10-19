
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
                creditOther: [],
                creditNote: '',
                debitNote: '',
                applyFee: true,
                waivedFees: [],
                transferDetails: {
                    fromAccount: selectedCustomer.account_number,
                    transfers: [{ toAccount: '', amount: '', note: '' }],
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

      const { transactionFee, feeMemo, feeBreakdown } = useTransactionFees(
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
        const other = (transactionState.creditOther || []).reduce(
          (sum, entry) => sum + (parseFloat(entry.amount) || 0),
          0,
        );
        return cash + checks + other;
      }, [transactionState]);

      const totalTransfer = useMemo(() => {
        if (!transactionState) return 0;
        return (transactionState.transferDetails?.transfers || []).reduce(
          (sum, t) => sum + (parseFloat(t.amount) || 0),
          0,
        );
      }, [transactionState]);

      const resetState = useCallback(() => {
        if (selectedCustomer) {
            setTransactionState({
                debitCashEntries: [{ amount: '', isRush: false }],
                debitChecks: [],
                creditCash: '',
                creditChecks: [],
                creditOther: [],
                creditNote: '',
                debitNote: '',
                applyFee: true,
                waivedFees: [],
                transferDetails: {
                    fromAccount: selectedCustomer.account_number,
                    transfers: [{ toAccount: '', amount: '', note: '' }],
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
        const validatedDebitChecks = filterEmptyAndValidate(transactionState.debitChecks);
        const validatedDebitCashEntries = filterEmptyAndValidate(transactionState.debitCashEntries).map(entry => ({
            amount: parseFloat(entry.amount),
            isRush: entry.isRush || false
        }));

        // The stored procedure `process_transaction_v2` is the single source of truth.
        // It atomically creates every transaction/check record AND updates the customer
        // balance (credits, debits, checks-in, checks-out, transfers, fees, loans).
        // We must pass the FULL check objects with the exact keys the procedure reads,
        // otherwise balances are not updated correctly.
        const creditChecksPayload = validatedCreditChecks.map(c => ({
            checknumber: (c.checkNumber || '').toString().trim() || null,
            amount: parseFloat(c.amount),
            has_account_number: c.has_account_number !== false,
            isonhold: c.isOnHold === true,
            holdtags: Array.isArray(c.holdTags) ? c.holdTags : []
        }));

        // QuickPay / Direct Deposit / Other deposits, each recorded with its own type.
        const creditOtherPayload = filterEmptyAndValidate(transactionState.creditOther).map(e => ({
            method: e.method || 'other',
            amount: parseFloat(e.amount),
            note: (e.note || '').toString().trim()
        }));

        const debitChecksPayload = validatedDebitChecks.map(c => ({
            paytoorderof: (c.payToOrderOf || '').toString().trim(),
            amount: parseFloat(c.amount),
            memo: c.memo || '',
            isRush: c.isRush || false
        }));

        // Each transaction can include multiple transfers to different accounts.
        // The stored procedure reads keys `toaccount`, `amount` and `note` per entry;
        // the note is recorded on both the sender's and the recipient's rows.
        const validatedTransfers = (transactionState.transferDetails?.transfers || [])
            .filter(t => t.toAccount && (parseFloat(t.amount) || 0) > 0);
        const transfersPayload = validatedTransfers
            .map(t => ({ toaccount: t.toAccount, amount: parseFloat(t.amount), note: (t.note || '').toString().trim() }));

        try {
            const { data, error } = await supabase.rpc('process_transaction_v2', {
                p_customer_id: selectedCustomer.id,
                p_account_number: selectedCustomer.account_number,
                p_credit_cash: parseFloat(transactionState.creditCash) || 0,
                p_credit_checks: creditChecksPayload,
                p_debit_cash_entries: validatedDebitCashEntries,
                p_debit_checks: debitChecksPayload,
                p_transfer_amount: 0,
                p_transfer_to_account: null,
                p_apply_fee: transactionState.applyFee,
                p_loan_to_create: loanToCreate,
                p_loan_to_repay: loanToRepay,
                p_credit_memo: (transactionState.creditNote || '').trim() || null,
                p_debit_memo: (transactionState.debitNote || '').trim() || null,
                p_transfers: transfersPayload,
                p_credit_other: creditOtherPayload,
                p_waived_fees: transactionState.applyFee ? (transactionState.waivedFees || []) : []
            });

            if (error) throw error;

            const transactionIds = (data && data.transaction_ids) || [];

            // Outgoing check numbers are assigned by the DB; the IDs come back in
            // submission order as DEBIT-CHECK-<timestamp>-<checkNumber>.
            const assignedCheckNumbers = transactionIds
                .filter(id => id.startsWith('DEBIT-CHECK-'))
                .map(id => id.split('-').pop());

            const appliedFee = transactionState.applyFee ? (parseFloat(transactionFee) || 0) : 0;
            const receipt = {
                customer: selectedCustomer,
                creditCash: parseFloat(transactionState.creditCash) || 0,
                creditChecks: creditChecksPayload,
                creditOther: creditOtherPayload,
                debitCash: validatedDebitCashEntries,
                debitChecks: debitChecksPayload.map((c, i) => ({ ...c, checkNumber: assignedCheckNumbers[i] || null })),
                transfers: validatedTransfers.map(t => ({
                    toAccount: t.toAccount,
                    amount: parseFloat(t.amount),
                    note: (t.note || '').toString().trim(),
                    recipient: (customers || []).find(c => c.account_number === t.toAccount) || null,
                })),
                feeBreakdown: transactionState.applyFee ? (feeBreakdown || []) : [],
                fee: appliedFee,
                loanAmount: loanToCreate ? (parseFloat(loanToCreate.amount) || 0) : 0,
                creditNote: (transactionState.creditNote || '').trim(),
                debitNote: (transactionState.debitNote || '').trim(),
            };

            toast({ title: "Success", description: "Transaction completed successfully." });

            // Small delay to ensure the database commit is visible before refetching.
            setTimeout(() => {
                refreshData();
            }, 800);

            if (onSuccess) onSuccess({ transactionIds, receipt });

            return { success: true, transactionIds };

        } catch (error) {
            toast({ title: "Transaction Failed", description: error.message, variant: "destructive" });
            return { success: false, transactionIds: [] };
        } finally {
            setIsProcessing(false);
        }
      }, [
        selectedCustomer, 
        transactionState,
        transactionFee,
        feeBreakdown,
        customers,
        onSuccess, 
        refreshData
      ]);

      return {
        transactionState,
        setTransactionState,
        transactionFee,
        feeMemo,
        feeBreakdown,
        totalDebit,
        totalCredit,
        totalTransfer,
        handleSubmit,
        resetState,
        isProcessing,
      };
    };
