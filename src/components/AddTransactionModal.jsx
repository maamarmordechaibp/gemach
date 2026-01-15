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

const AddTransactionModal = ({ isOpen, onClose, setActiveSection }) => {
  const { customers, loans, refreshData } = useData();
  const { isAdmin } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const {
    transactionState,
    setTransactionState,
    transactionFee,
    totalDebit,
    totalCredit,
    handleSubmit,
    resetState,
    isProcessing,
  } = useTransactionLogic(selectedCustomer, () => {
    setShowConfirmation(true);
  });
  
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [customerInitialData, setCustomerInitialData] = useState({});
  
  const [loanPrompt, setLoanPrompt] = useState({ show: false, shortfall: 0, dueDate: '', loanOption: 'shortfall' });
  const [repaymentPrompt, setRepaymentPrompt] = useState({ show: false, loan: null });
  const [passwordDialog, setPasswordDialog] = useState({ show: false, onConfirm: null });

  const customerLoans = useMemo(() => {
    if (!selectedCustomer || !loans) return [];
    const allAccounts = [selectedCustomer, ...(customers || []).filter(c => c.parent_account_id === selectedCustomer.account_number)];
    const allAccountIds = allAccounts.map(c => c.id);
    return loans.filter(l => allAccountIds.includes(l.customer_id) && l.status !== 'paid');
  }, [selectedCustomer, customers, loans]);
  
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
    if (totalCredit <= 0 && totalDebit <= 0 && (parseFloat(transactionState.transferDetails?.amount) || 0) <= 0) { toast({ title: "Empty Transaction", variant: "destructive" }); return; }
    
    const maxTransactionAmount = 25000;
    if (totalCredit > maxTransactionAmount || totalDebit > maxTransactionAmount) {
      toast({ title: "Transaction Limit Exceeded", description: `Transactions cannot exceed $${maxTransactionAmount.toLocaleString()}.`, variant: "destructive" });
      return;
    }

    if ((parseFloat(transactionState.transferDetails?.amount) || 0) > 0 && !transactionState.transferDetails.toAccount) {
      toast({ title: "Recipient required", description: "Please select a recipient for the transfer.", variant: "destructive" });
      return;
    }
    if (transactionState.transferDetails?.toAccount === selectedCustomer.account_number) {
        toast({ title: "Invalid Transfer", description: "Cannot transfer to the same account.", variant: "destructive" });
        return;
    }

    const netDebit = totalDebit + (transactionState?.applyFee ? transactionFee : 0) + (parseFloat(transactionState.transferDetails?.amount) || 0);
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

    if (totalCredit > 0 && customerLoans.length > 0) {
      setRepaymentPrompt({ show: true, loan: customerLoans[0] });
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
    if (!loanPrompt.dueDate) { toast({ title: "Due Date Required", variant: "destructive" }); return; }
    
    const loanAmount = loanPrompt.loanOption === 'full' ? totalDebit : loanPrompt.shortfall;
    await handleSubmit({ loanToCreate: { amount: loanAmount, due_date: loanPrompt.dueDate } });
    
    setLoanPrompt({ show: false, shortfall: 0, dueDate: '', loanOption: 'shortfall' });
  };

  const handleRepaymentConfirm = async (applyToLoan) => {
    setRepaymentPrompt({ show: false, loan: null });
    await handleSubmit({ loanToRepay: applyToLoan ? repaymentPrompt.loan : null });
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
                  <TransactionSummary totalCredit={totalCredit} totalDebit={totalDebit} transactionFee={transactionFee} onProcess={handleProcessTransaction} isProcessing={isProcessing} />
                </div>
              )}
            </motion.div>
          </div>
          <CustomerModal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} onSave={handleSaveCustomer} initialData={customerInitialData} />
          <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Transaction Complete</AlertDialogTitle><AlertDialogDescription>Do you want to add another transaction for this customer?</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => { setShowConfirmation(false); resetState(); }}>Yes, continue</AlertDialogAction>
                <AlertDialogCancel onClick={() => { setShowConfirmation(false); handleClose(); }}>No, close</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <LoanChoiceDialog isOpen={loanPrompt.show} onClose={() => setLoanPrompt({ ...loanPrompt, show: false })} onConfirm={handleLoanPromptConfirm} totalDebit={totalDebit} shortfall={loanPrompt.shortfall} dueDate={loanPrompt.dueDate} setDueDate={(d) => setLoanPrompt({...loanPrompt, dueDate: d})} loanOption={loanPrompt.loanOption} setLoanOption={(o) => setLoanPrompt({...loanPrompt, loanOption: o})} isProcessing={isProcessing} />
          <RepaymentDialog isOpen={repaymentPrompt.show} onClose={() => setRepaymentPrompt({ show: false, loan: null })} onConfirm={handleRepaymentConfirm} loan={repaymentPrompt.loan} totalCredit={totalCredit} />
          <AdminPasswordDialog isOpen={passwordDialog.show} onClose={() => setPasswordDialog({ show: false, onConfirm: null })} onConfirm={passwordDialog.onConfirm} />
        </>
      )}
    </AnimatePresence>
  );
};

export default AddTransactionModal;