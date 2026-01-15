import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

const TransferForm = ({ transactionState, setTransactionState }) => {
    const { customers } = useData();
    const [recipientSearchTerm, setRecipientSearchTerm] = useState('');
    const [selectedRecipient, setSelectedRecipient] = useState(null);

    const transferDetails = transactionState?.transferDetails || {};

    const setTransferDetails = (newDetails) => {
        setTransactionState(prev => ({
            ...prev,
            transferDetails: {
                ...prev.transferDetails,
                ...newDetails
            }
        }));
    };

    const recipientSearchResults = useMemo(() => {
        if (!recipientSearchTerm) return [];
        return customers.filter(c =>
            c.first_name.toLowerCase().includes(recipientSearchTerm.toLowerCase()) ||
            c.last_name.toLowerCase().includes(recipientSearchTerm.toLowerCase()) ||
            c.account_number.includes(recipientSearchTerm)
        ).slice(0, 5);
    }, [recipientSearchTerm, customers]);

    const handleSelectRecipient = (customer) => {
        setSelectedRecipient(customer);
        setTransferDetails({ toAccount: customer.account_number });
        setRecipientSearchTerm('');
    };
    
    const clearRecipient = () => {
        setSelectedRecipient(null);
        setTransferDetails({ toAccount: '' });
    };

    return (
        <div className="space-y-2">
            <div>
                <label className="text-sm font-medium text-muted-foreground">Amount</label>
                <Input 
                    type="number" 
                    placeholder="Transfer Amount" 
                    value={transferDetails.amount || ''} 
                    onChange={(e) => setTransferDetails({ amount: e.target.value })} 
                    className="w-full max-w-xs bg-input border border-border rounded-lg p-2 text-foreground mt-1" 
                />
            </div>

            <div>
                <label className="text-sm font-medium text-muted-foreground">Recipient Account</label>
                {selectedRecipient ? (
                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg mt-1">
                        <div>
                            <p className="font-bold text-foreground">{selectedRecipient.first_name} {selectedRecipient.last_name}</p>
                            <p className="text-sm text-muted-foreground">Acc: {selectedRecipient.account_number}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={clearRecipient}>Change</Button>
                    </div>
                ) : (
                    <div className="relative mt-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search recipient by name or account..."
                            value={recipientSearchTerm}
                            onChange={(e) => setRecipientSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-input border-border rounded-lg"
                        />
                        {recipientSearchTerm && (
                            <div className="absolute w-full bg-card border border-border rounded-lg mt-1 z-20 shadow-lg">
                                {recipientSearchResults.length > 0 ? (
                                    recipientSearchResults.map(c => (
                                        <div key={c.id} onClick={() => handleSelectRecipient(c)} className="p-3 hover:bg-accent cursor-pointer">
                                            <p className="font-semibold text-foreground">{c.first_name} {c.last_name}</p>
                                            <p className="text-sm text-muted-foreground">Acc: {c.account_number}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="p-3 text-muted-foreground text-center">No results</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransferForm;