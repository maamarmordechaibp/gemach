import React from 'react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
    import { Loader2 } from 'lucide-react';
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

    const LoanChoiceDialog = ({ isOpen, onClose, onConfirm, totalDebit, shortfall, dueDate, setDueDate, loanOption, setLoanOption, isProcessing }) => {
      if (!isOpen) return null;

      return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Insufficient Funds</AlertDialogTitle>
              <AlertDialogDescription>
                The customer's balance is insufficient. You can offer a loan to cover the transaction.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
              <RadioGroup value={loanOption} onValueChange={setLoanOption}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="shortfall" id="shortfall" />
                  <Label htmlFor="shortfall">Loan for the shortfall of ${shortfall.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full">Loan for the full debit amount of ${totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Label>
                </div>
              </RadioGroup>
              <div className="space-y-2">
                <Label htmlFor="due-date">Loan Due Date</Label>
                <Input 
                  id="due-date" 
                  type="date" 
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm} disabled={isProcessing || !dueDate}>
                {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processing...</> : 'Confirm & Process'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    };

    export default LoanChoiceDialog;