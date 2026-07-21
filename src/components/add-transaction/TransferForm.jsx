import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, Trash2 } from 'lucide-react';

const emptyTransfer = () => ({ toAccount: '', amount: '' });

const TransferRow = ({ index, transfer, customers, canRemove, onChange, onRemove }) => {
    const [recipientSearchTerm, setRecipientSearchTerm] = useState('');

    const selectedRecipient = useMemo(() => {
        if (!transfer.toAccount) return null;
        return customers.find(c => c.account_number === transfer.toAccount) || null;
    }, [transfer.toAccount, customers]);

    const recipientSearchResults = useMemo(() => {
        if (!recipientSearchTerm) return [];
        return customers.filter(c =>
            c.first_name.toLowerCase().includes(recipientSearchTerm.toLowerCase()) ||
            c.last_name.toLowerCase().includes(recipientSearchTerm.toLowerCase()) ||
            (c.account_number || '').toLowerCase().includes(recipientSearchTerm.toLowerCase())
        ).slice(0, 5);
    }, [recipientSearchTerm, customers]);

    const handleSelectRecipient = (customer) => {
        onChange(index, { toAccount: customer.account_number });
        setRecipientSearchTerm('');
    };

    const clearRecipient = () => onChange(index, { toAccount: '' });

    return (
        <div className="relative space-y-2 rounded-lg border border-border p-3">
            {canRemove && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(index)}
                    className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label="Remove transfer"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}

            <div>
                <label className="text-sm font-medium text-muted-foreground">Amount</label>
                <Input
                    type="number"
                    placeholder="Transfer Amount"
                    value={transfer.amount || ''}
                    onChange={(e) => onChange(index, { amount: e.target.value })}
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

const TransferForm = ({ transactionState, setTransactionState }) => {
    const { customers } = useData();

    const transfers = transactionState?.transferDetails?.transfers || [];

    const updateTransfers = (nextTransfers) => {
        setTransactionState(prev => ({
            ...prev,
            transferDetails: {
                ...prev.transferDetails,
                transfers: nextTransfers
            }
        }));
    };

    const handleRowChange = (index, newValues) => {
        updateTransfers(transfers.map((t, i) => (i === index ? { ...t, ...newValues } : t)));
    };

    const handleAddTransfer = () => {
        updateTransfers([...transfers, emptyTransfer()]);
    };

    const handleRemoveTransfer = (index) => {
        const next = transfers.filter((_, i) => i !== index);
        updateTransfers(next.length ? next : [emptyTransfer()]);
    };

    return (
        <div className="space-y-3">
            {transfers.map((transfer, index) => (
                <TransferRow
                    key={index}
                    index={index}
                    transfer={transfer}
                    customers={customers}
                    canRemove={transfers.length > 1}
                    onChange={handleRowChange}
                    onRemove={handleRemoveTransfer}
                />
            ))}

            <Button
                type="button"
                variant="outline"
                onClick={handleAddTransfer}
                className="w-full sm:w-auto"
            >
                <Plus className="h-4 w-4 mr-2" />
                Add another transfer
            </Button>
        </div>
    );
};

export default TransferForm;