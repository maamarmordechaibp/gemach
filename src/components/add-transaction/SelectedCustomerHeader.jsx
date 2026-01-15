import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const SelectedCustomerHeader = ({ customer, onClear }) => {
    return (
        <div className="flex justify-between items-start bg-secondary/50 p-4 rounded-lg">
            <div>
                <p className="text-sm text-muted-foreground">Customer</p>
                <h2 className="text-2xl font-bold text-foreground">{customer.first_name} {customer.last_name}</h2>
                <p className="text-muted-foreground">Account: {customer.account_number}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClear}><X className="h-5 w-5" /></Button>
        </div>
    );
};

export default SelectedCustomerHeader;