import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

// Master "apply fees" switch plus a per-fee-type waiver (cash fee, check fee, ...).
// The fee types listed come from calculate_fee_v2's breakdown, so only fees that
// actually apply to the current transaction are shown.
const FeeWaivers = ({ transactionState, setTransactionState, feeBreakdown, cashCredit = 0 }) => {
  const waived = transactionState.waivedFees || [];
  const chargeable = feeBreakdown.filter(f => (Number(f.amount) || 0) > 0);
  const cashCovered = Number(feeBreakdown.find(f => f.type === 'cash_debit')?.covered) || 0;
  const depositingCash = parseFloat(transactionState.creditCash) || 0;

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

      {(cashCredit > 0 || depositingCash > 0) && (
        <p className="text-sm text-muted-foreground">
          Fee-free cash available: <span className="font-semibold text-green-700 dark:text-green-400">${formatCurrency(cashCredit + depositingCash)}</span>
          {depositingCash > 0 && cashCredit > 0 ? ' (incl. this deposit)' : depositingCash > 0 ? ' (from this deposit)' : ''}
          {cashCovered > 0 && <> · ${formatCurrency(cashCovered)} of this withdrawal is fee-free</>}
        </p>
      )}

      {transactionState.applyFee && chargeable.length > 0 && (
        <div className="space-y-2 pl-1">
          {chargeable.map(f => (
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
