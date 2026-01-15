import React from 'react';
import { Button } from '@/components/ui/button';
import { Gift, Loader2 } from 'lucide-react';

const TransactionSummary = ({
  totalCredit,
  totalDebit,
  transactionFee,
  onProcess,
  onDonate,
  isProcessing
}) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
      <div className="flex gap-4 sm:gap-6 items-center">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Total Credit</p>
          <p className="text-2xl font-bold text-green-400">${totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Total Debit</p>
          <p className="text-2xl font-bold text-red-400">${totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        {transactionFee > 0 && (
          <div className="text-center pl-4 border-l border-border">
            <p className="text-muted-foreground text-sm">Fee</p>
            <p className="text-lg font-bold text-yellow-400">${transactionFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        )}
      </div>
      <div className="flex gap-4">
        {onDonate &&
          <Button onClick={onDonate} variant="outline" className="bg-pink-500/10 border-pink-500/30 text-pink-400 hover:bg-pink-500/20 hover:text-pink-300">
            <Gift className="h-4 w-4 mr-2"/>
            Donate
          </Button>
        }
        <Button onClick={onProcess} disabled={isProcessing} className="bg-gradient-to-r from-purple-500 to-indigo-500 min-w-[180px]">
          {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processing...</> : 'Process Transaction'}
        </Button>
      </div>
    </div>
  );
};
export default TransactionSummary;