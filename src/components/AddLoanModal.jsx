import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import CustomerSearch from './add-transaction/CustomerSearch';
import SelectedCustomerHeader from './add-transaction/SelectedCustomerHeader';
import AdminPasswordDialog from './AdminPasswordDialog';
import TransactionForm from './add-transaction/TransactionForm';

const AddLoanModal = ({ isOpen, onClose }) => {
  const { customers, refreshData } = useData();
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  
  const [transactionState, setTransactionState] = useState({
      debitCash: '',
      debitChecks: [],
  });

  const totalLoanAmount = useMemo(() => {
    const cash = parseFloat(transactionState.debitCash) || 0;
    const checks = transactionState.debitChecks.reduce((sum, check) => sum + (parseFloat(check.amount) || 0), 0);
    return cash + checks;
  }, [transactionState.debitCash, transactionState.debitChecks]);

  const resetForm = () => {
    setSearchTerm('');
    setSelectedCustomer(null);
    setDueDate('');
    setTransactionState({ debitCash: '', debitChecks: [] });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleInitiateProcess = () => {
    if (!selectedCustomer || totalLoanAmount <= 0 || !dueDate) {
      toast({ title: "Missing Information", description: "Please select a customer, enter a loan amount, and set a due date.", variant: "destructive" });
      return;
    }
    if (isAdmin) {
      handleProcessLoan();
    } else {
      setIsPasswordDialogOpen(true);
    }
  };

  const handleProcessLoan = async () => {
    setIsProcessing(true);
    try {
      const { data: loanData, error: loanError } = await supabase
        .from('loans').insert({ customer_id: selectedCustomer.id, amount: totalLoanAmount, due_date: dueDate, status: 'active' }).select().single();
      if (loanError) throw loanError;

      const txDate = new Date().toISOString();
      const loanTxId = `LOAN-${Date.now()}-${selectedCustomer.id.slice(0, 8)}`;
      const { error: txError } = await supabase.from('transactions').insert({ id: loanTxId, account_number: selectedCustomer.account_number, type: 'debit', amount: totalLoanAmount, date: txDate, status: 'completed', loan_id: loanData.id });
      if (txError) throw txError;

      const checksOutToInsert = transactionState.debitChecks.filter(c => c.amount > 0).map(async (check) => {
        const {data: nextCheckData, error: nextCheckError} = await supabase.rpc('get_next_check_number');
        if(nextCheckError) throw nextCheckError;

        return {
            transaction_id: loanTxId, 
            account_number: selectedCustomer.account_number, 
            check_number: nextCheckData, 
            pay_to_order_of: check.payToOrderOf, 
            amount: check.amount, 
            memo: `Loan - ${check.memo || ''}`, 
            date: txDate, 
            status: 'pending', 
            is_printed: false
        }
      });

      if (checksOutToInsert.length > 0) {
        const resolvedChecks = await Promise.all(checksOutToInsert);
        const { error } = await supabase.from('checks_out').insert(resolvedChecks);
        if (error) throw error;
      }

      const newBalance = parseFloat(selectedCustomer.balance) - totalLoanAmount;
      await supabase.from('customers').update({ balance: newBalance }).eq('id', selectedCustomer.id);

      toast({ title: "Success", description: "Loan created and transaction recorded successfully." });
      refreshData();
      handleClose();

    } catch (error) {
      toast({ title: "Loan Creation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-xl w-full max-w-2xl mx-4 flex flex-col"
              style={{ height: 'auto', maxHeight: '90vh' }}
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg"><Coins className="h-5 w-5 text-white" /></div>
                  <h2 className="text-xl font-bold text-foreground">Add New Loan</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClose}><X className="h-5 w-5" /></Button>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                {!selectedCustomer ? (
                  <CustomerSearch customers={customers} onSelect={(c) => setSelectedCustomer(c)} onAddNew={() => toast({ title: "Action not available", description: "Please add customers from the main Customers page.", variant: "destructive" })} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
                ) : (
                  <>
                    <SelectedCustomerHeader customer={selectedCustomer} onClear={() => setSelectedCustomer(null)} />
                    <div className="space-y-4">
                      <TransactionForm
                        transactionState={transactionState}
                        setTransactionState={setTransactionState}
                        isLoanForm={true}
                      />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Due Date</label>
                        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
                      </div>
                    </div>
                  </>
                )}
              </div>
              {selectedCustomer && (
                <div className="p-6 border-t border-border flex justify-between items-center">
                   <div>
                        <p className="text-muted-foreground">Total Loan Amount</p>
                        <p className="text-2xl font-bold text-red-400">${totalLoanAmount.toLocaleString()}</p>
                    </div>
                  <Button onClick={handleInitiateProcess} disabled={isProcessing} className="bg-gradient-to-r from-yellow-500 to-orange-500 text-lg px-8 py-6">
                    {isProcessing ? 'Processing...' : 'Create Loan'}
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
          <AdminPasswordDialog isOpen={isPasswordDialogOpen} onClose={() => setIsPasswordDialogOpen(false)} onConfirm={handleProcessLoan} />
        </>
      )}
    </AnimatePresence>
  );
};

export default AddLoanModal;