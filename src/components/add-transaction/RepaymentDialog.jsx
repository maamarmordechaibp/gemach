import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Coins } from 'lucide-react';

const fmt = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const loanRemaining = (l) => (l && l.remaining_balance != null ? parseFloat(l.remaining_balance) : parseFloat(l?.amount || 0));

const RepaymentDialog = ({ isOpen, onClose, onConfirm, loans, totalCredit }) => {
  // All outstanding loans for this customer, oldest due date first.
  const loanList = useMemo(() => {
    return (loans || [])
      .filter(l => loanRemaining(l) > 0 && l.status !== 'paid')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }, [loans]);

  const totalOwed = useMemo(
    () => loanList.reduce((s, l) => s + loanRemaining(l), 0),
    [loanList]
  );

  const credit = parseFloat(totalCredit) || 0;
  const defaultAmount = Math.min(credit, totalOwed);
  const [applyAmount, setApplyAmount] = useState(defaultAmount.toFixed(2));

  // Reset the suggested amount each time the dialog opens for a new customer/credit.
  useEffect(() => {
    if (isOpen) {
      setApplyAmount(Math.min(credit, totalOwed).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, totalCredit, totalOwed]);

  if (!loanList.length) return null;

  const amountNum = parseFloat(applyAmount) || 0;
  // Never apply more than the total owed or more than the credit available.
  const cappedAmount = Math.max(0, Math.min(amountNum, totalOwed, credit));

  // Allocate the amount across loans, oldest first, for the preview.
  let remaining = cappedAmount;
  const allocations = loanList.map(l => {
    const amt = loanRemaining(l);
    const alloc = Math.min(remaining, amt);
    remaining = Math.max(0, remaining - alloc);
    return { loan: l, alloc };
  });

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><Coins className="text-green-400" /> Loan Repayment?</AlertDialogTitle>
          <AlertDialogDescription>
            This customer has {loanList.length} outstanding loan{loanList.length > 1 ? 's' : ''} totaling ${fmt(totalOwed)}. You can apply some or all of this ${fmt(credit)} credit toward the loans (applied to the oldest first).
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {allocations.map(({ loan, alloc }) => (
            <div key={loan.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</span>
              <div className="flex items-center gap-3">
                <span className="font-medium">${fmt(loanRemaining(loan))}</span>
                {alloc > 0.001 && <span className="text-green-500 text-xs">-${fmt(alloc)}</span>}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 text-sm font-bold bg-muted/40">
            <span>Total owed</span>
            <span>${fmt(totalOwed)}</span>
          </div>
        </div>

        <div className="space-y-2 py-2">
          <label className="text-sm font-medium text-muted-foreground">Amount to apply to loans</label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={applyAmount}
            onChange={(e) => setApplyAmount(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Applying ${fmt(cappedAmount)} · Total remaining after: ${fmt(Math.max(0, totalOwed - cappedAmount))}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onConfirm(true, cappedAmount)}>Apply to loan{loanList.length > 1 ? 's' : ''}</AlertDialogAction>
          <AlertDialogCancel onClick={() => onConfirm(false, 0)}>No, add to balance</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RepaymentDialog;