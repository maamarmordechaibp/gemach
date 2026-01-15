
    import React from 'react';
    import { Checkbox } from '@/components/ui/checkbox';
    import { cn } from '@/lib/utils';
    import { Inbox } from 'lucide-react';

    const UnprintedChecksTable = ({ checks, selectedChecks, onSelectCheck, onSelectAll }) => {
      if (checks.length === 0) {
        return (
          <div className="text-center py-12 text-muted-foreground">
            <Inbox className="mx-auto h-12 w-12" />
            <h3 className="mt-2 text-lg font-semibold">All caught up!</h3>
            <p className="mt-1 text-sm">There are no unprinted checks.</p>
          </div>
        );
      }

      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr >
                <th className="p-3 text-left w-10">
                  <Checkbox 
                    checked={checks.length > 0 && selectedChecks.size === checks.length}
                    onCheckedChange={onSelectAll}
                    aria-label="Select all unprinted checks"
                  />
                </th>
                <th className="p-3 text-left font-semibold">Date</th>
                <th className="p-3 text-left font-semibold">Check #</th>
                <th className="p-3 text-left font-semibold">Customer</th>
                <th className="p-3 text-left font-semibold">Pay To</th>
                <th className="p-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {checks.map(check => (
                <tr key={check.id} 
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-muted/50 cursor-pointer",
                      selectedChecks.has(check.id) ? 'bg-primary/10' : ''
                    )}
                    onClick={() => onSelectCheck(check.id)}>
                  <td className="p-3">
                    <Checkbox checked={selectedChecks.has(check.id)} onCheckedChange={() => onSelectCheck(check.id)} aria-label={`Select check ${check.check_number}`} />
                  </td>
                  <td className="p-3">{new Date(check.date).toLocaleDateString()}</td>
                  <td className="p-3 font-mono">{check.check_number}</td>
                  <td className="p-3">{check.customer_name}</td>
                  <td className="p-3">{check.pay_to_order_of}</td>
                  <td className="p-3 text-right font-mono">${parseFloat(check.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    export default UnprintedChecksTable;
  