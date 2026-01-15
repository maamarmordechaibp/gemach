import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';
import TransactionForm from './add-transaction/TransactionForm';
import TransactionSummary from './add-transaction/TransactionSummary';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PayLoanModal = ({ isOpen, onClose, loan }) => {
  const { customers, loans, refreshData } = useData();
  const [transactionState, setTransactionState] = useState({
      creditCash: '',
      creditChecks: [],
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [overpaymentPrompt, setOverpaymentPrompt] = useState({ show: false, excessAmount: 0, nextLoan: null });

  const customer = useMemo(() => customers.find(c => c.id === loan?.customer_id), [customers, loan]);

  const totalCredit = useMemo(() => {
    const cash = parseFloat(transactionState.creditCash) || 0;
    const checks = transactionState.creditChecks.reduce((sum, check) => sum + (parseFloat(check.amount) || 0), 0);
    return cash + checks;
  }, [transactionState.creditCash, transactionState.creditChecks]);

  const resetForm = () => {
    setTransactionState({ creditCash: '', creditChecks: [] });
    setIsProcessing(false);
    setOverpaymentPrompt({ show: false, excessAmount: 0, nextLoan: null });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleProcessPayment = async () => {
    if (!customer || !loan) return;
    if (totalCredit <= 0) {
      toast({ title: "No payment amount", description: "Please enter a payment amount.", variant: "destructive" });
      return;
    }

    const loanAmount = parseFloat(loan.amount);
    if (totalCredit > loanAmount) {
      const excessAmount = totalCredit - loanAmount;
      const nextLoan = loans.find(l => l.customer_id === customer.id && l.status !== 'paid' && l.id !== loan.id);
      setOverpaymentPrompt({ show: true, excessAmount, nextLoan });
      return;
    }

    await executePayment(totalCredit);
  };

  const executePayment = async (paymentAmount, excessAmount = 0, applyToNextLoan = false) => {
    setIsProcessing(true);
    try {
      const creditTxId = `REPAY-${Date.now()}-${customer.id.slice(0, 8)}`;
      const transactionsToInsert = [];
      const checksInToInsert = [];
      let balanceChange = 0;
      const txDate = new Date().toISOString();

      const currentLoanPayment = Math.min(paymentAmount, parseFloat(loan.amount));
      transactionsToInsert.push({ id: creditTxId, account_number: customer.account_number, type: 'credit', amount: currentLoanPayment, date: txDate, status: 'completed', loan_id: loan.id });
      
      const remainingLoanAmount = parseFloat(loan.amount) - currentLoanPayment;
      const newLoanStatus = remainingLoanAmount <= 0.001 ? 'paid' : 'active';
      await supabase.from('loans').update({ amount: Math.max(0, remainingLoanAmount), status: newLoanStatus }).eq('id', loan.id);

      if (excessAmount > 0) {
        if (applyToNextLoan && overpaymentPrompt.nextLoan) {
          const nextLoan = overpaymentPrompt.nextLoan;
          const nextLoanPayment = Math.min(excessAmount, parseFloat(nextLoan.amount));
          
          const nextRepayTxId = `REPAY-NEXT-${Date.now()}-${customer.id.slice(0, 8)}`;
          transactionsToInsert.push({ id: nextRepayTxId, account_number: customer.account_number, type: 'credit', amount: nextLoanPayment, date: txDate, status: 'completed', loan_id: nextLoan.id });

          const remainingNextLoan = parseFloat(nextLoan.amount) - nextLoanPayment;
          const nextLoanStatus = remainingNextLoan <= 0.001 ? 'paid' : 'active';
          await supabase.from('loans').update({ amount: Math.max(0, remainingNextLoan), status: nextLoanStatus }).eq('id', nextLoan.id);

          const finalExcess = excessAmount - nextLoanPayment;
          if (finalExcess > 0) {
            balanceChange += finalExcess;
          }
        } else {
          balanceChange += excessAmount;
        }
      }

      if (transactionsToInsert.length > 0) {
        await supabase.from('transactions').insert(transactionsToInsert);
      }

      transactionState.creditChecks.forEach(check => {
        if (check.amount > 0 && check.checkNumber) {
          checksInToInsert.push({ transaction_id: creditTxId, account_number: customer.account_number, check_number: check.checkNumber, amount: check.amount, date: txDate, status: 'pending' });
        }
      });
      if (checksInToInsert.length > 0) {
        await supabase.from('checks_in').insert(checksInToInsert);
      }

      if (balanceChange > 0) {
        const newBalance = parseFloat(customer.balance) + balanceChange;
        await supabase.from('customers').update({ balance: newBalance }).eq('id', customer.id);
      }

      toast({ title: "Success", description: "Loan payment processed successfully." });
      refreshData();
      handleClose();

    } catch (error) {
      toast({ title: "Payment Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setOverpaymentPrompt({ show: false, excessAmount: 0, nextLoan: null });
    }
  };

  const handleOverpaymentChoice = (applyToNext) => {
    executePayment(totalCredit, overpaymentPrompt.excessAmount, applyToNext);
  };

  if (!customer) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-card border border-border rounded-xl w-full max-w-2xl mx-4 flex flex-col"
            style={{ height: '90vh', maxHeight: '800px' }}
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg"><Coins className="h-5 w-5 text-white" /></div>
                <h2 className="text-xl font-bold text-foreground">Pay Loan</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClose}><X className="h-5 w-5" /></Button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="bg-secondary/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Paying loan for</p>
                <h2 className="text-2xl font-bold text-foreground">{customer.first_name} {customer.last_name}</h2>
                <p className="text-muted-foreground">Remaining Balance: <span className="font-bold text-red-400">${parseFloat(loan.amount).toLocaleString()}</span></p>
              </div>
              <TransactionForm
                transactionState={transactionState}
                setTransactionState={setTransactionState}
                isPaymentForm={true}
              />
            </div>
            <div className="p-6 border-t border-border sticky bottom-0 bg-card">
              <TransactionSummary totalCredit={totalCredit} totalDebit={0} onProcess={handleProcessPayment} isProcessing={isProcessing} />
            </div>
          </motion.div>
          <AlertDialog open={overpaymentPrompt.show}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-yellow-400" /> Overpayment Detected</AlertDialogTitle>
                <AlertDialogDescription>
                  The payment of ${totalCredit.toLocaleString()} exceeds the loan balance by ${overpaymentPrompt.excessAmount.toLocaleString()}.
                  {overpaymentPrompt.nextLoan ? " This customer has another loan." : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {overpaymentPrompt.nextLoan && (
                  <AlertDialogAction onClick={() => handleOverpaymentChoice(true)}>Apply to Next Loan</AlertDialogAction>
                )}
                <AlertDialogAction onClick={() => handleOverpaymentChoice(false)}>Add to Customer Balance</AlertDialogAction>
                <AlertDialogCancel onClick={() => setOverpaymentPrompt({ show: false, excessAmount: 0, nextLoan: null })}>Cancel</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PayLoanModal;