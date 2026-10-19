import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

// Master "apply fees" switch plus a per-fee-type waiver (cash fee, check fee, ...).
// The fee types listed come from calculate_fee_v2's breakdown, so only fees that
// actually apply to the current transaction are shown.
const FeeWaivers = ({ transactionState, setTransactionState, feeBreakdown }) => {
  const waived = transactionState.waivedFees || [];

  const toggleWaive = (type, checked) => {
    setTransactionState(prev => {
      const current = prev.waivedFees || [];
      const next = checked ? [...new Set([...current, type])] : current.filter(t => t !== type);
      return { ...prev, waivedFees: next };
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Switch
          id="apply-fee"
          checked={transactionState.applyFee}
          onCheckedChange={(checked) => setTransactionState(prev => ({ ...prev, applyFee: checked }))}
        />
        <Label htmlFor="apply-fee" className="text-lg">Apply Transaction Fees</Label>
      </div>

      {transactionState.applyFee && feeBreakdown.length > 0 && (
        <div className="space-y-2 pl-1">
          {feeBreakdown.map(f => (
            <div key={f.type} className="flex items-center gap-3 text-sm">
              <Checkbox
                id={`waive-${f.type}`}
                checked={waived.includes(f.type)}
                onCheckedChange={(checked) => toggleWaive(f.type, checked === true)}
              />
              <Label htmlFor={`waive-${f.type}`} className="cursor-pointer">
                Waive {f.label}
              </Label>
              <span className={f.waived ? 'line-through text-muted-foreground' : 'font-semibold text-yellow-700 dark:text-yellow-400'}>
                ${formatCurrency(Number(f.amount) || 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeeWaivers;
