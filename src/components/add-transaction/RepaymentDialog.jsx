import React from 'react';
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
import { Coins } from 'lucide-react';

const RepaymentDialog = ({ isOpen, onClose, onConfirm, loan, totalCredit }) => {
  if (!loan) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><Coins className="text-green-400" /> Loan Repayment?</AlertDialogTitle>
          <AlertDialogDescription>
            This customer has an outstanding loan of ${parseFloat(loan.amount).toLocaleString()}. Do you want to apply this credit of ${totalCredit.toLocaleString()} towards the loan?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onConfirm(true)}>Yes, apply to loan</AlertDialogAction>
          <AlertDialogCancel onClick={() => onConfirm(false)}>No, add to balance</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RepaymentDialog;