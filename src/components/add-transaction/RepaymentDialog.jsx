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
import { Checkbox } from '@/components/ui/checkbox';
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
  // Loans the payment should go to. Defaults to all; the user can pick specific
  // loans (e.g. keep a large loan with its own payoff arrangement untouched).
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedLoans = useMemo(() => loanList.filter(l => selectedIds.includes(l.id)), [loanList, selectedIds]);
  const selectedOwed = useMemo(() => selectedLoans.reduce((s, l) => s + loanRemaining(l), 0), [selectedLoans]);
  const [applyAmount, setApplyAmount] = useState(Math.min(credit, totalOwed).toFixed(2));

  // Reset the selection and suggested amount each time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(loanList.map(l => l.id));
      setApplyAmount(Math.min(credit, totalOwed).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, totalCredit, totalOwed]);

  const toggleLoan = (id, checked) => {
    const next = checked ? [...new Set([...selectedIds, id])] : selectedIds.filter(x => x !== id);
    setSelectedIds(next);
    const owed = loanList.filter(l => next.includes(l.id)).reduce((s, l) => s + loanRemaining(l), 0);
    setApplyAmount(Math.min(credit, owed).toFixed(2));
  };

  if (!loanList.length) return null;

  const amountNum = parseFloat(applyAmount) || 0;
  // Never apply more than the selected loans owe or more than the credit available.
  const cappedAmount = Math.max(0, Math.min(amountNum, selectedOwed, credit));

  // Allocate the amount across the selected loans, oldest first, for the preview.
  let remaining = cappedAmount;
  const allocations = loanList.map(l => {
    if (!selectedIds.includes(l.id)) return { loan: l, alloc: 0 };
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
            This customer has {loanList.length} outstanding loan{loanList.length > 1 ? 's' : ''} totaling ${fmt(totalOwed)}. Check the loan{loanList.length > 1 ? 's' : ''} to pay and apply some or all of this ${fmt(credit)} credit (split oldest first among the checked loans).
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {allocations.map(({ loan, alloc }) => (
            <label key={loan.id} htmlFor={`repay-loan-${loan.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
              <span className="flex items-center gap-2">
                <Checkbox
                  id={`repay-loan-${loan.id}`}
                  checked={selectedIds.includes(loan.id)}
                  onCheckedChange={(checked) => toggleLoan(loan.id, checked === true)}
                />
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">
                    Loan of ${fmt(loan.original_amount ?? loan.amount)}
                    {loan.account_number ? <span className="text-muted-foreground font-normal"> · Acct {loan.account_number}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {loan.created_at ? `Taken ${new Date(loan.created_at).toLocaleDateString()} · ` : ''}Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}
                  </span>
                </span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-medium">${fmt(loanRemaining(loan))}</span>
                {alloc > 0.001 && <span className="text-green-700 dark:text-green-500 text-xs">-${fmt(alloc)}</span>}
              </div>
            </label>
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
            Applying ${fmt(cappedAmount)} to {selectedLoans.length} loan{selectedLoans.length === 1 ? '' : 's'} · Total remaining after: ${fmt(Math.max(0, totalOwed - cappedAmount))}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction
            disabled={selectedLoans.length === 0 || cappedAmount <= 0}
            onClick={() => onConfirm(true, cappedAmount, selectedIds)}
          >
            Apply to {selectedLoans.length === 1 ? 'selected loan' : 'selected loans'}
          </AlertDialogAction>
          <AlertDialogCancel onClick={() => onConfirm(false, 0)}>No, add to balance</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RepaymentDialog;