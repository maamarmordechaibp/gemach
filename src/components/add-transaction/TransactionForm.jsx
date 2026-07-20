
    import React from 'react';
    import CreditForm from '@/components/add-transaction/CreditForm';
    import DebitForm from '@/components/add-transaction/DebitForm';
    import TransferForm from '@/components/add-transaction/TransferForm';
    import { Loader2 } from 'lucide-react';

    const TransactionForm = ({ type, transactionState, setTransactionState, customer }) => {
      const handleListChange = (key, value) => {
        setTransactionState(prev => ({ ...prev, [key]: value }));
      };

      const handleInputChange = (key, value) => {
        setTransactionState(prev => ({ ...prev, [key]: value }));
      };

      if (!transactionState) {
        return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
      }

      switch (type) {
        case 'credit':
          return (
            <div className="space-y-4">
              <CreditForm
                creditCash={transactionState.creditCash}
                creditChecks={transactionState.creditChecks}
                onInputChange={handleInputChange}
                onListChange={handleListChange}
                customerId={customer?.id}
              />
              <div>
                <label htmlFor="credit-note" className="text-sm font-medium text-muted-foreground">Note (optional)</label>
                <input
                  id="credit-note"
                  type="text"
                  placeholder="Add a note for this deposit..."
                  value={transactionState.creditNote || ''}
                  onChange={(e) => handleInputChange('creditNote', e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          );
        case 'debit':
          return (
            <div className="space-y-4">
              <DebitForm
                debitCashEntries={transactionState.debitCashEntries}
                debitChecks={transactionState.debitChecks}
                onListChange={handleListChange}
                customer={customer}
              />
              <div>
                <label htmlFor="debit-note" className="text-sm font-medium text-muted-foreground">Note (optional)</label>
                <input
                  id="debit-note"
                  type="text"
                  placeholder="Add a note for this withdrawal..."
                  value={transactionState.debitNote || ''}
                  onChange={(e) => handleInputChange('debitNote', e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          );
        case 'transfer':
          return (
            <TransferForm
                transactionState={transactionState}
                setTransactionState={setTransactionState}
            />
          );
        default:
          return null;
      }
    };

    export default TransactionForm;
  