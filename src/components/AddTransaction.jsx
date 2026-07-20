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
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MinusCircle, PlusCircle, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Outstanding balance for a loan. Prefers the explicit remaining_balance column,
// falling back to `amount` for records created before the column existed.
const loanRemaining = (l) => (l && l.remaining_balance != null ? parseFloat(l.remaining_balance) : parseFloat(l?.amount || 0));

const AddTransaction = () => {
  const { customers, loans, refreshData, settings } = useData();
  const { isAdmin } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const printReceipt = (custName, acctNum, creditAmt, debitAmt, feeAmt, transferAmt, newBalance) => {
    const companyInfo = settings?.check_config || {};
    const now = new Date();
    const receiptHtml = `<!DOCTYPE html><html><head><title>Receipt</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:monospace;padding:20px;width:3in;color:#000;background:#fff;font-size:11px;}
.center{text-align:center;}.line{border-bottom:1px dashed #000;margin:8px 0;}.row{display:flex;justify-content:space-between;padding:2px 0;}
.bold{font-weight:bold;}.big{font-size:16px;}.mt{margin-top:8px;}@media print{body{padding:5px;margin:0;}}</style>
</head><body>
<div class="center">${companyInfo.name ? `<div class="bold big">${companyInfo.name}</div>` : ''}
${companyInfo.address1 ? `<div>${companyInfo.address1}</div>` : ''}${companyInfo.phone_number ? `<div>${companyInfo.phone_number}</div>` : ''}
</div>
<div class="line"></div>
<div class="center bold">TRANSACTION RECEIPT</div>
<div class="center">${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
<div class="line"></div>
<div class="row bold"><span>Customer:</span><span>${custName}</span></div>
<div class="row"><span>Account:</span><span>${acctNum}</span></div>
<div class="line"></div>
${creditAmt > 0 ? `<div class="row"><span>Credit/Deposit:</span><span>+$${formatCurrency(creditAmt)}</span></div>` : ''}
${debitAmt > 0 ? `<div class="row"><span>Debit/Withdrawal:</span><span>-$${formatCurrency(debitAmt)}</span></div>` : ''}
${feeAmt > 0 ? `<div class="row"><span>Fees:</span><span>-$${formatCurrency(feeAmt)}</span></div>` : ''}
${transferAmt > 0 ? `<div class="row"><span>Transfer Out:</span><span>-$${formatCurrency(transferAmt)}</span></div>` : ''}
<div class="line"></div>
<div class="row bold big"><span>Balance:</span><span>$${formatCurrency(newBalance)}</span></div>
<div class="line"></div>
<div class="center mt">Thank you!</div>
</body></html>`;
    const w = window.open('', '_blank', 'width=350,height=500');
    if (!w) return;
    w.document.write(receiptHtml);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); setTimeout(() => w.close(), 1000); }, 400);
  };

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
    if (selectedCustomer) {
      const fee = transactionState?.applyFee ? transactionFee : 0;
      const transferAmt = parseFloat(transactionState?.transferDetails?.amount) || 0;
      const newBalance = (parseFloat(selectedCustomer.balance) || 0) + totalCredit - totalDebit - fee - transferAmt;
      printReceipt(
        `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
        selectedCustomer.account_number,
        totalCredit, totalDebit, fee, transferAmt, newBalance
      );
    }
    handleFullReset();
  });
  
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
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

  const recipientCustomer = useMemo(() => {
    const toAccount = transactionState?.transferDetails?.toAccount;
    if (!toAccount) return null;
    return (customers || []).find(c => c.account_number === toAccount) || null;
  }, [transactionState?.transferDetails?.toAccount, customers]);

  const recipientLoans = useMemo(() => {
    if (!recipientCustomer || !loans) return [];
    return loans.filter(l => l.customer_id === recipientCustomer.id && l.status !== 'paid');
  }, [recipientCustomer, loans]);
  
  const handleAddNewCustomerClick = () => {
    if (/^\d{7,15}$/.test(searchTerm)) setCustomerInitialData({ phone_number: searchTerm });
    else setCustomerInitialData({});
    setIsCustomerModalOpen(true);
  };

  const handleProcessTransaction = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !transactionState) { toast({ title: "No Customer Selected", variant: "destructive" }); return; }
    if (totalCredit <= 0 && totalDebit <= 0 && (parseFloat(transactionState.transferDetails?.amount) || 0) <= 0) { toast({ title: "Empty Transaction", variant: "destructive" }); return; }

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
      const overdraftLimit = parseFloat(selectedCustomer.overdraft_limit) || 0;

      // Overdraft product: if the shortfall fits within the account's overdraft
      // limit, let the balance go negative (using overdraft) without a loan.
      if (shortfall <= overdraftLimit) {
        await handleSubmit();
        return;
      }

      // Shortfall exceeds any available overdraft — offer a loan or overdraft.
      setLoanPrompt({ show: true, shortfall, dueDate: '', loanOption: 'shortfall' });
      return;
    }

    if (totalCredit > 0 && customerLoans.length > 0) {
      setRepaymentPrompt({ show: true, loans: customerLoans, recipient: null, isTransfer: false, amount: totalCredit });
      return;
    }

    const transferAmount = parseFloat(transactionState.transferDetails?.amount) || 0;
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
      // Since this portion is applied to loans (not kept as savings), deduct it
      // back out so the balance nets to zero for the applied amount.
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
      const cashTxId = (depositTxIds || []).find(id => id.startsWith('CREDIT-CASH-'));
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
          // Part stayed in the account — relabel the original deposit row.
          const { error: updErr } = await supabase
            .from('transactions')
            .update({ amount: accountPortion, memo: `Deposit to balance (part of $${formatCurrency(depositTotal)} deposit)` })
            .eq('id', cashTxId);
          if (updErr) throw updErr;
        } else {
          // Whole deposit went to the loans — remove the now-redundant deposit row.
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

  const handleRepaymentConfirm = async (applyToLoan, applyAmount = 0) => {
    const prompt = repaymentPrompt;
    // The credit/transfer is added to the balance by process_transaction_v2.
    // When applying to loans we additionally reduce the loan records by the
    // amount the user chose (allocated oldest-first), so partial payments only
    // reduce the loans by that amount instead of paying them all off.
    const target = prompt.recipient || selectedCustomer;
    const promptLoans = prompt.loans || [];
    setRepaymentPrompt({ show: false, loans: [], recipient: null, isTransfer: false, amount: 0 });
    const result = await handleSubmit();
    if (result?.success && applyToLoan && promptLoans.length && applyAmount > 0) {
      const sorted = promptLoans
        .filter(l => loanRemaining(l) > 0 && l.status !== 'paid')
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
              customer={selectedCustomer}
              applyFee={transactionState?.applyFee}
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
      <RepaymentDialog isOpen={repaymentPrompt.show} onClose={() => setRepaymentPrompt({ show: false, loans: [], recipient: null, isTransfer: false, amount: 0 })} onConfirm={handleRepaymentConfirm} loans={repaymentPrompt.loans} totalCredit={repaymentPrompt.amount || totalCredit} />
      <AdminPasswordDialog isOpen={passwordDialog.show} onClose={() => setPasswordDialog({ show: false, onConfirm: null })} onConfirm={passwordDialog.onConfirm} />
    </div>
  );
};

export default AddTransaction;