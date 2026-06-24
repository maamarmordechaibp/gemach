import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, X, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';
import { cn } from '@/lib/utils';
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

const fmt = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PayLoanModal = ({ isOpen, onClose, loan }) => {
  const { customers, loans, refreshData } = useData();
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [overpaymentPrompt, setOverpaymentPrompt] = useState({ show: false, leftover: 0 });

  const customer = useMemo(() => customers.find(c => c.id === loan?.customer_id), [customers, loan]);

  // All unpaid loans for this customer, oldest due date first.
  const customerLoans = useMemo(() => {
    if (!customer) return [];
    return loans
      .filter(l => l.customer_id === customer.id && l.status !== 'paid' && parseFloat(l.amount) > 0)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }, [loans, customer]);

  // Initialize selection whenever the modal opens.
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(customerLoans.map(l => l.id)));
      setPaymentAmount('');
      setOverpaymentPrompt({ show: false, leftover: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loan?.id]);

  const paymentNum = parseFloat(paymentAmount) || 0;

  // Auto-allocate the payment across selected loans, oldest first.
  const allocations = useMemo(() => {
    let remaining = paymentNum;
    return customerLoans.map(l => {
      if (!selectedIds.has(l.id)) return { loan: l, alloc: 0 };
      const amt = parseFloat(l.amount);
      const alloc = Math.min(remaining, amt);
      remaining = Math.max(0, remaining - alloc);
      return { loan: l, alloc };
    });
  }, [customerLoans, selectedIds, paymentNum]);

  const totalAllocated = useMemo(() => allocations.reduce((s, a) => s + a.alloc, 0), [allocations]);
  const leftover = Math.max(0, paymentNum - totalAllocated);
  const totalSelectedOwed = useMemo(
    () => customerLoans.filter(l => selectedIds.has(l.id)).reduce((s, l) => s + parseFloat(l.amount), 0),
    [customerLoans, selectedIds]
  );

  const toggleLoan = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fillSelectedTotal = () => {
    setPaymentAmount(totalSelectedOwed > 0 ? totalSelectedOwed.toFixed(2) : '');
  };

  const handleClose = () => {
    setIsProcessing(false);
    setOverpaymentPrompt({ show: false, leftover: 0 });
    onClose();
  };

  const handleProcessPayment = () => {
    if (!customer) return;
    if (paymentNum <= 0) {
      toast({ title: "No payment amount", description: "Please enter a payment amount.", variant: "destructive" });
      return;
    }
    if (totalAllocated <= 0) {
      toast({ title: "No loan selected", description: "Select at least one loan to pay.", variant: "destructive" });
      return;
    }
    if (leftover > 0.001) {
      setOverpaymentPrompt({ show: true, leftover });
      return;
    }
    executePayment(false);
  };

  const executePayment = async (addLeftoverToBalance) => {
    if (!customer) return;
    setIsProcessing(true);
    try {
      const txDate = new Date().toISOString();
      const transactionsToInsert = [];
      let balanceChange = 0;

      for (const { loan: l, alloc } of allocations) {
        if (alloc <= 0) continue;
        const remaining = parseFloat(l.amount) - alloc;
        const newStatus = remaining <= 0.001 ? 'paid' : (l.status === 'overdue' ? 'overdue' : 'active');

        const { error: loanError } = await supabase
          .from('loans')
          .update({ amount: Math.max(0, remaining), status: newStatus })
          .eq('id', l.id);
        if (loanError) throw loanError;

        transactionsToInsert.push({
          id: `REPAY-${Date.now()}-${l.id.slice(0, 8)}`,
          account_number: customer.account_number,
          type: 'credit',
          amount: alloc,
          date: txDate,
          status: 'completed',
          loan_id: l.id,
          memo: 'Loan Repayment',
        });
        balanceChange += alloc;
      }

      if (addLeftoverToBalance && leftover > 0.001) {
        transactionsToInsert.push({
          id: `CREDIT-${Date.now()}-${customer.id.slice(0, 8)}`,
          account_number: customer.account_number,
          type: 'credit',
          amount: leftover,
          date: txDate,
          status: 'completed',
          memo: 'Overpayment Credit',
        });
        balanceChange += leftover;
      }

      if (transactionsToInsert.length > 0) {
        const { error: txError } = await supabase.from('transactions').insert(transactionsToInsert);
        if (txError) throw txError;
      }

      if (balanceChange > 0) {
        const newBalance = (parseFloat(customer.balance) || 0) + balanceChange;
        const { error: balError } = await supabase.from('customers').update({ balance: newBalance }).eq('id', customer.id);
        if (balError) throw balError;
      }

      toast({ title: "Success", description: `Applied $${fmt(totalAllocated)} across ${allocations.filter(a => a.alloc > 0).length} loan(s).` });
      refreshData();
      handleClose();
    } catch (error) {
      toast({ title: "Payment Failed", description: error.message, variant: "destructive" });
      setIsProcessing(false);
      setOverpaymentPrompt({ show: false, leftover: 0 });
    }
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
                <p className="text-sm text-muted-foreground">Paying loans for</p>
                <h2 className="text-2xl font-bold text-foreground">{customer.first_name} {customer.last_name}</h2>
                <p className="text-muted-foreground">Total outstanding (selected): <span className="font-bold text-red-400">${fmt(totalSelectedOwed)}</span></p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Payment Amount</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    autoFocus
                  />
                  <Button type="button" variant="outline" onClick={fillSelectedTotal} className="whitespace-nowrap">
                    Pay Full
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  The amount is automatically applied to the selected loans, oldest due date first.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Loans</p>
                {customerLoans.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No outstanding loans for this customer.</p>
                ) : (
                  allocations.map(({ loan: l, alloc }) => {
                    const selected = selectedIds.has(l.id);
                    const remaining = parseFloat(l.amount) - alloc;
                    const willBePaid = selected && alloc > 0 && remaining <= 0.001;
                    return (
                      <div
                        key={l.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                          selected ? 'border-primary/40 bg-secondary/40' : 'border-border bg-transparent opacity-60'
                        )}
                      >
                        <Checkbox checked={selected} onCheckedChange={() => toggleLoan(l.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">${fmt(l.amount)}</span>
                            {willBePaid && (
                              <span className="inline-flex items-center gap-1 text-xs text-green-400">
                                <CheckCircle2 className="h-3 w-3" /> Paid off
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Due {l.due_date ? new Date(l.due_date).toLocaleDateString() : '—'} · {l.status}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={cn('font-semibold', alloc > 0 ? 'text-green-400' : 'text-muted-foreground')}>
                            {alloc > 0 ? `-$${fmt(alloc)}` : '$0.00'}
                          </p>
                          {selected && alloc > 0 && (
                            <p className="text-xs text-muted-foreground">Remaining ${fmt(Math.max(0, remaining))}</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-6 border-t border-border bg-card">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Applied to loans: <span className="font-bold text-green-400">${fmt(totalAllocated)}</span></p>
                  {leftover > 0.001 && (
                    <p className="text-sm text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> Leftover ${fmt(leftover)} exceeds selected loans
                    </p>
                  )}
                </div>
                <Button onClick={handleProcessPayment} disabled={isProcessing} className="bg-gradient-to-r from-purple-500 to-indigo-500 min-w-[160px]">
                  {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : 'Process Payment'}
                </Button>
              </div>
            </div>
          </motion.div>

          <AlertDialog open={overpaymentPrompt.show}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-yellow-400" /> Overpayment Detected</AlertDialogTitle>
                <AlertDialogDescription>
                  The payment exceeds the selected loans by ${fmt(overpaymentPrompt.leftover)}. What would you like to do with the leftover?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => executePayment(true)}>Add leftover to balance</AlertDialogAction>
                <AlertDialogCancel onClick={() => setOverpaymentPrompt({ show: false, leftover: 0 })}>Cancel</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PayLoanModal;