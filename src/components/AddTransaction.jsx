import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import CustomerModal from '@/components/CustomerModal';
import CustomerSearch from './add-transaction/CustomerSearch';
import SelectedCustomerHeader from './add-transaction/SelectedCustomerHeader';
import TransactionForm from './add-transaction/TransactionForm';
import TransactionSummary from './add-transaction/TransactionSummary';
import LoanChoiceDialog from './add-transaction/LoanChoiceDialog';
import RepaymentDialog from './add-transaction/RepaymentDialog';
import AdminPasswordDialog from './AdminPasswordDialog';
import DonationModal from '@/components/DonationModal';
import { useTransactionLogic } from '@/hooks/useTransactionLogic';
import { toast } from '@/components/ui/use-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MinusCircle, PlusCircle, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const AddTransaction = () => {
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
    handleFullReset();
    toast({ title: "Success", description: "Transaction completed successfully." });
  });
  
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
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
  
  const handleAddNewCustomerClick = () => {
    if (/^\d{7,15}$/.test(searchTerm)) setCustomerInitialData({ phone_number: searchTerm });
    else setCustomerInitialData({});
    setIsCustomerModalOpen(true);
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

    if ((parseFloat(transactionState.transferDetails?.amount) || 0) > 0) {
      if (!transactionState.transferDetails.toAccount) {
        toast({ title: "Recipient required", description: "Please select a recipient for the transfer.", variant: "destructive" });
        return;
      }
      if (transactionState.transferDetails.toAccount === selectedCustomer.account_number) {
        toast({ title: "Invalid Transfer", description: "Cannot transfer to the same account.", variant: "destructive" });
        return;
      }
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
  
  const renderTransactionContent = () => {
    if (!transactionState) {
      return (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    
    return (
      <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="space-y-6">
        <SelectedCustomerHeader customer={selectedCustomer} onClear={handleFullReset} />
        
        <div className="space-y-[-16px]">
          <Card className="relative z-10 shadow-lg">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><PlusCircle className="text-green-500" /> Credit / Deposit</CardTitle>
            </CardHeader>
            <CardContent>
                <TransactionForm type="credit" transactionState={transactionState} setTransactionState={setTransactionState} />
            </CardContent>
          </Card>

          <Card className="relative z-0 shadow-lg pt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MinusCircle className="text-red-500" /> Debit / Withdrawal</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionForm type="debit" transactionState={transactionState} setTransactionState={setTransactionState} customer={selectedCustomer} />
            </CardContent>
          </Card>
        </div>
      
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ArrowRightLeft className="text-blue-500"/> Transfer</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionForm type="transfer" transactionState={transactionState} setTransactionState={setTransactionState} />
          </CardContent>
        </Card>

        <div className="bg-card/50 border border-border rounded-xl p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2">
              <Switch 
                  id="apply-fee" 
                  checked={transactionState.applyFee} 
                  onCheckedChange={(checked) => setTransactionState(prev => ({...prev, applyFee: checked}))}
              />
              <Label htmlFor="apply-fee" className="text-lg">Apply Transaction Fees</Label>
          </div>
          <TransactionSummary 
              totalCredit={totalCredit} 
              totalDebit={totalDebit} 
              transactionFee={transactionFee} 
              onProcess={handleProcessTransaction} 
              isProcessing={isProcessing} 
              onDonate={() => setIsDonationModalOpen(true)}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground tracking-tight">New Transaction</h1>
        <p className="text-muted-foreground mt-2">Search for a customer to begin a new transaction.</p>
      </div>

      {!selectedCustomer ? (
        <CustomerSearch customers={customers} onSelect={handleCustomerSelect} onAddNew={handleAddNewCustomerClick} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      ) : (
        renderTransactionContent()
      )}
      <CustomerModal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} onSave={() => {}} initialData={customerInitialData} />
      <DonationModal isOpen={isDonationModalOpen} onClose={() => setIsDonationModalOpen(false)} customer={selectedCustomer} onDonationSuccess={refreshData} />
      <LoanChoiceDialog isOpen={loanPrompt.show} onClose={() => setLoanPrompt({ ...loanPrompt, show: false })} onConfirm={handleLoanPromptConfirm} totalDebit={totalDebit} shortfall={loanPrompt.shortfall} dueDate={loanPrompt.dueDate} setDueDate={(d) => setLoanPrompt({...loanPrompt, dueDate: d})} loanOption={loanPrompt.loanOption} setLoanOption={(o) => setLoanPrompt({...loanPrompt, loanOption: o})} isProcessing={isProcessing} />
      <RepaymentDialog isOpen={repaymentPrompt.show} onClose={() => setRepaymentPrompt({ show: false, loan: null })} onConfirm={handleRepaymentConfirm} loan={repaymentPrompt.loan} totalCredit={totalCredit} />
      <AdminPasswordDialog isOpen={passwordDialog.show} onClose={() => setPasswordDialog({ show: false, onConfirm: null })} onConfirm={passwordDialog.onConfirm} />
    </div>
  );
};

export default AddTransaction;