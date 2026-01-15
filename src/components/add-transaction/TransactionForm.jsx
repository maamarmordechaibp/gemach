
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
            <CreditForm
              creditCash={transactionState.creditCash}
              creditChecks={transactionState.creditChecks}
              onInputChange={handleInputChange}
              onListChange={handleListChange}
              customerId={customer?.id}
            />
          );
        case 'debit':
          return (
            <DebitForm
              debitCashEntries={transactionState.debitCashEntries}
              debitChecks={transactionState.debitChecks}
              onListChange={handleListChange}
              customer={customer}
            />
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
  