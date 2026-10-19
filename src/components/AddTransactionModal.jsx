import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Banknote, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import CustomerModal from '@/components/CustomerModal';
import { supabase } from '@/lib/customSupabaseClient';
import CustomerSearch from './add-transaction/CustomerSearch';
import SelectedCustomerHeader from './add-transaction/SelectedCustomerHeader';
import TransactionForm from './add-transaction/TransactionForm';
import TransactionSummary from './add-transaction/TransactionSummary';
import LoanChoiceDialog from './add-transaction/LoanChoiceDialog';
import RepaymentDialog from './add-transaction/RepaymentDialog';
import AdminPasswordDialog from './AdminPasswordDialog';
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
import { useTransactionLogic } from '@/hooks/useTransactionLogic';
import { printTransactionReceipt } from '@/lib/transactionReceipt';
import { formatCurrency } from '@/lib/utils';

// Outstanding balance for a loan. Prefers the explicit remaining_balance column,
// falling back to `amount` for records created before the column existed.
const loanRemaining = (l) => (l && l.remaining_balance != null ? parseFloat(l.remaining_balance) : parseFloat(l?.amount || 0));

const AddTransactionModal = ({ isOpen, onClose, setActiveSection }) => {
  const { customers, loans, refreshData, settings } = useData();
  const { isAdmin } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const {
    transactionState,
    setTransactionState,
    transactionFee,
    totalDebit,
    totalCredit,
    totalTransfer,
    handleSubmit,
    resetState,
    isProcessing,
  } = useTransactionLogic(selectedCustomer, ({ receipt } = {}) => {
    printTransactionReceipt(receipt, settings);
    setShowConfirmation(true);
  });
  
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [customerInitialData, setCustomerInitialData] = useState({});
  
  const [loanPrompt, setLoanPrompt] = useState({ show: false, shortfall: 0, dueDate: '', loanOption: 'shortfall' });
  const [repaymentPrompt, setRepaymentPrompt] = useState({ show: false, loans: [], recipient: null, isTransfer: false, amount: 0 });
  const [passwordDialog, setPasswordDialog] = useState({ show: false, onConfirm: null });

  const customerLoans = useMemo(() => {
    if (!selectedCustomer || !loans) return [];
    const allAccounts = [selectedCustomer, ...(customers || []).filter(c => c.parent_account_id === selectedCustomer.account_number)];
    const allAccountIds = allAccounts.map(c => c.id);
    return loans.filter(l => allAccountIds.includes(l.customer_id) && l.status !== 'paid');
  }, [selectedCustomer, customers, loans]);

  const singleTransfer = useMemo(() => {
    const transfers = (transactionState?.transferDetails?.transfers || []).filter(t => (parseFloat(t.amount) || 0) > 0 && t.toAccount);
    return transfers.length === 1 ? transfers[0] : null;
  }, [transactionState?.transferDetails?.transfers]);

  const recipientCustomer = useMemo(() => {
    const toAccount = singleTransfer?.toAccount;
    if (!toAccount) return null;
    return (customers || []).find(c => c.account_number === toAccount) || null;
  }, [singleTransfer, customers]);

  const recipientLoans = useMemo(() => {
    if (!recipientCustomer || !loans) return [];
    return loans.filter(l => l.customer_id === recipientCustomer.id && l.status !== 'paid');
  }, [recipientCustomer, loans]);
  
  const handleSaveCustomer = async (customerData) => {
    try {
        const { id, ...dataToSave } = customerData;
        const { data, error } = await supabase.from('customers').insert(dataToSave).select().single();
        
        if (error) {
            toast({ title: "Error saving customer", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Success", description: `Customer added successfully.` });
            refreshData();
            setSelectedCustomer(data);
        }
    } catch (error) {
        toast({ title: "Error saving customer", description: error.message, variant: "destructive" });
    } finally {
        setIsCustomerModalOpen(false);
    }
  };
  
  const handleAddNewCustomerClick = () => {
    if (/^\d{7,15}$/.test(searchTerm)) setCustomerInitialData({ phone_number: searchTerm });
    else setCustomerInitialData({});
    setIsCustomerModalOpen(true);
  };

  const processLoan = async (loanAmount, dueDate) => {
    const { data: loanData, error: loanError } = await supabase.from('loans').insert({ customer_id: selectedCustomer.id, amount: loanAmount, due_date: dueDate, status: 'active' }).select().single();
    if (loanError) throw loanError;
    return loanData;
  };

  const handleProcessTransaction = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !transactionState) { toast({ title: "No Customer Selected", variant: "destructive" }); return; }
    if (totalCredit <= 0 && totalDebit <= 0 && totalTransfer <= 0) { toast({ title: "Empty Transaction", variant: "destructive" }); return; }

    const transfers = (transactionState.transferDetails?.transfers || []).filter(t => (parseFloat(t.amount) || 0) > 0 || t.toAccount);
    for (const t of transfers) {
      const amt = parseFloat(t.amount) || 0;
      if (amt > 0 && !t.toAccount) {
        toast({ title: "Recipient required", description: "Please select a recipient for each transfer.", variant: "destructive" });
        return;
      }
      if (t.toAccount && amt <= 0) {
        toast({ title: "Amount required", description: "Please enter an amount for each transfer.", variant: "destructive" });
        return;
      }
      if (t.toAccount === selectedCustomer.account_number) {
        toast({ title: "Invalid Transfer", description: "Cannot transfer to the same account.", variant: "destructive" });
        return;
      }
    }

    const netDebit = totalDebit + (transactionState?.applyFee ? transactionFee : 0) + totalTransfer;
    const prospectiveBalance = (parseFloat(selectedCustomer.balance) || 0) + totalCredit - netDebit;

    if (prospectiveBalance < 0) {
      const shortfall = Math.abs(prospectiveBalance);
      const action = () => setLoanPrompt({ show: true, shortfall, dueDate: '', loanOption: 'shortfall' });
      if (isAdmin) {
        action();
      } else {
        setPasswordDialog({ show: true, onConfirm: action });
      }
      return;
    }

    // Only what's left after this transaction's own withdrawals, fees and
    // transfers can go toward a loan (e.g. deposit $1,000, withdraw $500 -> offer $500).
    // Checks on hold aren't in the balance yet, so they don't count either.
    const heldCredit = (transactionState.creditChecks || [])
      .filter(c => c.isOnHold)
      .reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const availableForLoans = Math.round(Math.max(0, totalCredit - heldCredit - netDebit) * 100) / 100;
    if (availableForLoans > 0 && customerLoans.length > 0) {
      setRepaymentPrompt({ show: true, loans: customerLoans, recipient: null, isTransfer: false, amount: availableForLoans });
      return;
    }

    const transferAmount = parseFloat(singleTransfer?.amount) || 0;
    if (transferAmount > 0 && recipientCustomer && recipientLoans.length > 0) {
      setRepaymentPrompt({ show: true, loans: recipientLoans, recipient: recipientCustomer, isTransfer: true, amount: transferAmount });
      return;
    }

    await handleSubmit();
  };

  const handleCustomerSelect = (customer) => { 
    setSelectedCustomer(customer); 
    setSearchTerm(''); 
  };

  const handleFullReset = () => {
    resetState();
    setSelectedCustomer(null);
    setSearchTerm('');
  };

  const handleClose = () => { 
    handleFullReset();
    onClose(); 
  };

  const handleLoanPromptConfirm = async () => {
    // Overdraft: process the debit as-is and let the balance go negative,
    // without creating a loan.
    if (loanPrompt.loanOption === 'overdraft') {
      await handleSubmit();
      setLoanPrompt({ show: false, shortfall: 0, dueDate: '', loanOption: 'shortfall' });
      return;
    }

    if (!loanPrompt.dueDate) { toast({ title: "Due Date Required", variant: "destructive" }); return; }
    
    const loanAmount = loanPrompt.loanOption === 'full' ? totalDebit : loanPrompt.shortfall;
    await handleSubmit({ loanToCreate: { amount: loanAmount, due_date: loanPrompt.dueDate } });
    
    setLoanPrompt({ show: false, shortfall: 0, dueDate: '', loanOption: 'shortfall' });
  };

  const applyPaymentToLoans = async (payer, allocations, depositTxIds = []) => {
    try {
      const active = (allocations || []).filter(a => a.alloc > 0.001);
      if (active.length === 0) return;
      const totalPayment = active.reduce((s, a) => s + Math.min(a.alloc, loanRemaining(a.loan)), 0);

      // 1. Reduce each loan record by its allocated amount.
      for (const { loan, alloc } of active) {
        const payment = Math.min(alloc, loanRemaining(loan));
        const remaining = loanRemaining(loan) - payment;
        const newStatus = remaining <= 0.001 ? 'paid' : 'active';
        const { error } = await supabase
          .from('loans')
          .update({ remaining_balance: Math.max(0, remaining), status: newStatus })
          .eq('id', loan.id);
        if (error) throw error;
      }

      // 2. The credit was already added to the balance by process_transaction_v2.
      // Deduct the applied portion back out so it nets to zero.
      if (payer && totalPayment > 0) {
        const { data: fresh, error: fetchError } = await supabase
          .from('customers')
          .select('balance')
          .eq('id', payer.id)
          .single();
        if (fetchError) throw fetchError;
        const newBalance = (parseFloat(fresh?.balance) || 0) - totalPayment;
        const { error: balError } = await supabase
          .from('customers')
          .update({ balance: newBalance })
          .eq('id', payer.id);
        if (balError) throw balError;
      }

      // 3. Split the original cash deposit into a repayment row per loan plus any
      // leftover that stayed in the account, so the log shows the full breakdown.
      const cashTxId = (depositTxIds || []).find(id => id.startsWith('CREDIT-CASH-'))
        || (depositTxIds || []).find(id => /^CREDIT-(QUICKPAY|DIRECT|OTHER)-/.test(id));
      if (cashTxId && totalPayment > 0) {
        const { data: dep, error: depErr } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', cashTxId)
          .single();
        if (depErr) throw depErr;

        const depositTotal = parseFloat(dep.amount);
        const accountPortion = Math.max(0, depositTotal - totalPayment);
        const splitNote = accountPortion > 0.001 ? ` (part of $${formatCurrency(depositTotal)} deposit)` : '';

        const repayRows = active.map((a, i) => ({
          id: `REPAY-${Date.now()}-${i}-${a.loan.id.slice(0, 8)}`,
          account_number: payer.account_number,
          type: 'credit',
          amount: Math.min(a.alloc, loanRemaining(a.loan)),
          date: dep.date,
          status: 'completed',
          loan_id: a.loan.id,
          memo: `Loan Repayment${splitNote}`,
        }));
        const { error: repayErr } = await supabase.from('transactions').insert(repayRows);
        if (repayErr) throw repayErr;

        if (accountPortion > 0.001) {
          const { error: updErr } = await supabase
            .from('transactions')
            .update({ amount: accountPortion, memo: `Deposit to balance (part of $${formatCurrency(depositTotal)} deposit)` })
            .eq('id', cashTxId);
          if (updErr) throw updErr;
        } else {
          const { error: delErr } = await supabase.from('transactions').delete().eq('id', cashTxId);
          if (delErr) throw delErr;
        }
      }

      // Non-cash source (e.g. a transfer into an account that has loans): there
      // is no cash deposit row to split, so record the loan repayment explicitly
      // so it shows in the payer's history and the loan's "Total Paid", exactly
      // like a regular transaction's loan payment.
      if (!cashTxId && totalPayment > 0 && payer) {
        const transferRepayRows = active.map((a, i) => ({
          id: `REPAY-${Date.now()}-${i}-${a.loan.id.slice(0, 8)}`,
          account_number: payer.account_number,
          type: 'credit',
          amount: Math.min(a.alloc, loanRemaining(a.loan)),
          date: new Date().toISOString(),
          status: 'completed',
          loan_id: a.loan.id,
          memo: 'Loan Repayment (applied from transfer)',
        }));
        const { error: transferRepayErr } = await supabase.from('transactions').insert(transferRepayRows);
        if (transferRepayErr) throw transferRepayErr;
      }

      const payerName = payer ? `${payer.first_name} ${payer.last_name}'s` : 'the';
      toast({ title: "Loan Updated", description: `Applied $${formatCurrency(totalPayment)} toward ${payerName} loan${active.length > 1 ? 's' : ''}.` });
      refreshData();
    } catch (error) {
      toast({ title: "Loan Repayment Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleRepaymentConfirm = async (applyToLoan, applyAmount = 0, selectedLoanIds = null) => {
    const prompt = repaymentPrompt;
    // The credit/transfer is added to the balance by process_transaction_v2.
    // When applying to loans we additionally reduce the loan records by the
    // amount the user chose (allocated oldest-first) to support partial payments.
    const target = prompt.recipient || selectedCustomer;
    const promptLoans = prompt.loans || [];
    setRepaymentPrompt({ show: false, loans: [], recipient: null, isTransfer: false, amount: 0 });
    const result = await handleSubmit();
    // Only touch loans if the money really arrived: a transfer row (XFER-OUT) for a
    // transfer, or a deposit row (CREDIT-*) for a deposit. Otherwise a loan could be
    // marked paid without any money moving.
    const createdIds = result?.transactionIds || [];
    const moneyArrived = prompt.isTransfer
      ? createdIds.some(id => id.startsWith('XFER-OUT-'))
      : createdIds.some(id => id.startsWith('CREDIT-'));
    if (result?.success && applyToLoan && !moneyArrived) {
      toast({ title: "Loan not updated", description: "No transfer or deposit was recorded, so nothing was applied to the loan.", variant: "destructive" });
      return;
    }
    if (result?.success && applyToLoan && promptLoans.length && applyAmount > 0) {
      const sorted = promptLoans
        .filter(l => loanRemaining(l) > 0 && l.status !== 'paid')
        .filter(l => !selectedLoanIds || selectedLoanIds.includes(l.id))
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
      let remaining = applyAmount;
      const allocations = sorted.map(l => {
        const amt = loanRemaining(l);
        const alloc = Math.min(remaining, amt);
        remaining = Math.max(0, remaining - alloc);
        return { loan: l, alloc };
      }).filter(a => a.alloc > 0.001);
      await applyPaymentToLoans(target, allocations, result.transactionIds);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-xl w-full max-w-2xl mx-4 flex flex-col" style={{ height: 'auto', maxHeight: '90vh' }}
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg"><Banknote className="h-5 w-5 text-white" /></div>
                  <h2 className="text-xl font-bold text-foreground">Add Transaction</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClose}><X className="h-5 w-5" /></Button>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                {!selectedCustomer ? (
                  <CustomerSearch customers={customers} onSelect={handleCustomerSelect} onAddNew={handleAddNewCustomerClick} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
                ) : (
                  <>
                    <SelectedCustomerHeader customer={selectedCustomer} onClear={handleFullReset} />
                    <TransactionForm 
                        transactionState={transactionState}
                        setTransactionState={setTransactionState}
                    />
                  </>
                )}
              </div>
              {selectedCustomer && (
                <div className="p-6 border-t border-border sticky bottom-0 bg-card">
                  <TransactionSummary totalCredit={totalCredit} totalDebit={totalDebit} transactionFee={transactionFee} onProcess={handleProcessTransaction} isProcessing={isProcessing} customer={selectedCustomer} applyFee={transactionState?.applyFee} />
                </div>
              )}
            </motion.div>
          </div>
          <CustomerModal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} onSave={handleSaveCustomer} initialData={customerInitialData} />
          <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Transaction Complete</AlertDialogTitle>
                <AlertDialogDescription>Receipt has been sent to the printer. Add another transaction for this customer?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => { setShowConfirmation(false); resetState(); }}>Yes, continue</AlertDialogAction>
                <AlertDialogCancel onClick={() => { setShowConfirmation(false); handleClose(); }}>No, close</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <LoanChoiceDialog isOpen={loanPrompt.show} onClose={() => setLoanPrompt({ ...loanPrompt, show: false })} onConfirm={handleLoanPromptConfirm} totalDebit={totalDebit} shortfall={loanPrompt.shortfall} dueDate={loanPrompt.dueDate} setDueDate={(d) => setLoanPrompt({...loanPrompt, dueDate: d})} loanOption={loanPrompt.loanOption} setLoanOption={(o) => setLoanPrompt({...loanPrompt, loanOption: o})} isProcessing={isProcessing} />
          <RepaymentDialog isOpen={repaymentPrompt.show} onClose={() => setRepaymentPrompt({ show: false, loans: [], recipient: null, isTransfer: false, amount: 0 })} onConfirm={handleRepaymentConfirm} loans={repaymentPrompt.loans} totalCredit={repaymentPrompt.amount || totalCredit} />
          <AdminPasswordDialog isOpen={passwordDialog.show} onClose={() => setPasswordDialog({ show: false, onConfirm: null })} onConfirm={passwordDialog.onConfirm} />
        </>
      )}
    </AnimatePresence>
  );
};

export default AddTransactionModal;