import React, { useEffect, useState, useRef } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CustomerSearch = ({ customers, onSelect, onAddNew, searchTerm, setSearchTerm }) => {
    const [focusedIndex, setFocusedIndex] = useState(0);
    const listRef = useRef(null);
    const searchInputRef = useRef(null);

    const filteredCustomers = customers.filter(c =>
        (c.first_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.last_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.account_number || '').includes(searchTerm) ||
        (c.phone_number && c.phone_number.includes(searchTerm))
    );

    useEffect(() => {
        setFocusedIndex(0);
    }, [searchTerm]);

    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev => (prev + 1) % (filteredCustomers.length || 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev => (prev - 1 + filteredCustomers.length) % (filteredCustomers.length || 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredCustomers.length > 0 && focusedIndex >= 0) {
                onSelect(filteredCustomers[focusedIndex]);
            }
        }
    };

    useEffect(() => {
        listRef.current?.children[focusedIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    }, [focusedIndex]);

    return (
        <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by name, account number, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-12 pr-4 py-4 bg-card/70 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
            {searchTerm && (
                <div ref={listRef} className="absolute w-full bg-card border border-border rounded-lg mt-2 overflow-y-auto max-h-60 z-10 shadow-2xl">
                    {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((c, index) => (
                            <div
                                key={c.id}
                                onClick={() => onSelect(c)}
                                className={`p-4 hover:bg-accent cursor-pointer flex justify-between items-center transition-colors ${index === focusedIndex ? 'bg-accent' : ''}`}
                            >
                                <div>
                                    <p className="font-bold text-foreground">{c.first_name} {c.last_name}</p>
                                    <p className="text-sm text-muted-foreground">Acc: {c.account_number} | Phone: {c.phone_number || 'N/A'}</p>
                                </div>
                                <p className="text-muted-foreground">Balance: ${parseFloat(c.balance).toLocaleString()}</p>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 text-center text-muted-foreground flex flex-col items-center gap-2">
                            <p>No customers matching "{searchTerm}" found.</p>
                            <Button variant="secondary" onClick={onAddNew}><UserPlus className="h-4 w-4 mr-2" />Add New Customer</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CustomerSearch;