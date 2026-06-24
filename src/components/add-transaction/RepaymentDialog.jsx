import React, { useState, useEffect } from 'react';
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

const RepaymentDialog = ({ isOpen, onClose, onConfirm, loan, totalCredit }) => {
  const loanBalance = loan ? parseFloat(loan.amount) : 0;
  const defaultAmount = Math.min(parseFloat(totalCredit) || 0, loanBalance);
  const [applyAmount, setApplyAmount] = useState(defaultAmount.toFixed(2));

  // Reset the suggested amount each time the dialog opens for a new loan/credit.
  useEffect(() => {
    if (isOpen) {
      setApplyAmount(Math.min(parseFloat(totalCredit) || 0, loanBalance).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loan?.id, totalCredit]);

  if (!loan) return null;

  const amountNum = parseFloat(applyAmount) || 0;
  // Never apply more than the loan balance or more than the credit available.
  const cappedAmount = Math.max(0, Math.min(amountNum, loanBalance, parseFloat(totalCredit) || 0));

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><Coins className="text-green-400" /> Loan Repayment?</AlertDialogTitle>
          <AlertDialogDescription>
            This customer has an outstanding loan of ${fmt(loanBalance)}. You can apply some or all of this ${fmt(totalCredit)} credit toward the loan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm font-medium text-muted-foreground">Amount to apply to loan</label>
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
            Applying ${fmt(cappedAmount)} · Loan remaining after: ${fmt(Math.max(0, loanBalance - cappedAmount))}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onConfirm(true, cappedAmount)}>Apply to loan</AlertDialogAction>
          <AlertDialogCancel onClick={() => onConfirm(false, 0)}>No, add to balance</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RepaymentDialog;