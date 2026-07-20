import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';
import { cn } from '@/lib/utils';

const fmt = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getRemaining = (l) => (l && l.remaining_balance != null ? parseFloat(l.remaining_balance) : parseFloat(l?.amount || 0));

// "Pay My Loan": a customer pays a loan directly from their own account balance.
const PayMyLoanModal = ({ isOpen, onClose, customer }) => {
  const { loans, refreshData } = useData();
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const customerLoans = useMemo(() => {
    if (!customer) return [];
    return loans
      .filter(l => l.customer_id === customer.id && l.status !== 'paid' && getRemaining(l) > 0)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }, [loans, customer]);

  const selectedLoan = useMemo(
    () => customerLoans.find(l => l.id === selectedLoanId) || null,
    [customerLoans, selectedLoanId]
  );

  const available = customer
    ? (parseFloat(customer.balance) || 0) + (parseFloat(customer.overdraft_limit) || 0)
    : 0;

  useEffect(() => {
    if (isOpen) {
      const first = customerLoans[0] || null;
      setSelectedLoanId(first ? first.id : null);
      setAmount('');
      setIsProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const remaining = selectedLoan ? getRemaining(selectedLoan) : 0;
  const maxPayable = Math.min(remaining, available);
  const amountNum = parseFloat(amount) || 0;

  const fillMax = () => setAmount(maxPayable > 0 ? maxPayable.toFixed(2) : '');

  const handleClose = () => {
    setIsProcessing(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!customer || !selectedLoan) {
      toast({ title: 'Select a loan', variant: 'destructive' });
      return;
    }
    if (amountNum <= 0) {
      toast({ title: 'Enter a payment amount', variant: 'destructive' });
      return;
    }
    if (amountNum > available + 0.001) {
      toast({ title: 'Insufficient balance', description: `Available balance is $${fmt(available)}.`, variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase.rpc('pay_loan_from_account', {
        p_customer_id: customer.id,
        p_loan_id: selectedLoan.id,
        p_amount: amountNum,
      });
      if (error) throw error;

      toast({ title: 'Payment applied', description: `Paid $${fmt(Math.min(amountNum, remaining))} toward the loan.` });
      refreshData();
      handleClose();
    } catch (error) {
      toast({ title: 'Payment failed', description: error.message, variant: 'destructive' });
      setIsProcessing(false);
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
            className="relative bg-card border border-border rounded-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg"><Coins className="h-5 w-5 text-white" /></div>
                <h2 className="text-xl font-bold text-foreground">Pay My Loan</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose}><X className="h-5 w-5" /></Button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="bg-secondary/50 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Available balance</p>
                  <p className="text-2xl font-bold text-foreground">${fmt(available)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Account</p>
                  <p className="font-semibold text-foreground">{customer.account_number}</p>
                </div>
              </div>

              {customerLoans.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">This customer has no outstanding loans.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Select a loan</Label>
                    {customerLoans.map(l => {
                      const isSelected = l.id === selectedLoanId;
                      return (
                        <button
                          type="button"
                          key={l.id}
                          onClick={() => setSelectedLoanId(l.id)}
                          className={cn(
                            'w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors',
                            isSelected ? 'border-primary/60 bg-secondary/50' : 'border-border hover:bg-accent'
                          )}
                        >
                          <div>
                            <p className="font-medium text-foreground">Remaining ${fmt(getRemaining(l))}</p>
                            <p className="text-xs text-muted-foreground">Due {l.due_date ? new Date(l.due_date).toLocaleDateString() : '—'} · {l.status}</p>
                          </div>
                          {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Payment amount</Label>
                    <div className="flex gap-2 mt-1">
                      <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                      <Button type="button" variant="outline" onClick={fillMax} className="whitespace-nowrap">Pay Max</Button>
                    </div>
                    <p className={`text-xs mt-1 ${amountNum > available ? 'text-red-400' : 'text-muted-foreground'}`}>
                      Max payable ${fmt(maxPayable)} (limited by balance & remaining loan)
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={isProcessing || customerLoans.length === 0} className="bg-gradient-to-r from-green-500 to-teal-500">
                {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><Coins className="mr-2 h-4 w-4" /> Pay Loan</>}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PayMyLoanModal;
