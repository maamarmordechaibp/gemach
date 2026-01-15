
    import React, { useState, useMemo, useRef } from 'react';
    import { useParams, Link } from 'react-router-dom';
    import { useData } from '@/contexts/DataContext';
    import { Loader2, ArrowLeft, User, Hash, Phone, DollarSign, Printer } from 'lucide-react';
    import { motion } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import {
      Card,
      CardContent,
      CardHeader,
      CardTitle,
      CardDescription
    } from '@/components/ui/card.jsx';
    import Transactions from '@/components/Transactions';
    import { Input } from '@/components/ui/input';
    import { useReactToPrint } from 'react-to-print';
    import Statement from '@/components/ui/statement';
    import { Label } from '@/components/ui/label';
    import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

    const CustomerDetail = () => {
        const { id } = useParams();
        const { customers, transactions, settings, loading } = useData();
        
        const customer = useMemo(() => customers.find(c => c.id === id), [customers, id]);
        
        const [filters, setFilters] = useState({ startDate: '', endDate: '', type: 'both' });
        const [sort, setSort] = useState({ key: 'date', order: 'desc' });
        const printComponentRef = useRef(null);

        const subAccounts = useMemo(() => {
            if (!customer) return [];
            return customers.filter(c => c.parent_account_id === customer.account_number);
        }, [customers, customer]);
        
        const handlePrint = useReactToPrint({
            content: () => printComponentRef.current,
            documentTitle: customer ? `Statement - ${customer.first_name} ${customer.last_name}` : 'Statement',
        });

        const filteredAndSortedTransactions = useMemo(() => {
            if (!transactions || !customer) return [];
            const allAccountNumbers = [customer.account_number, ...subAccounts.map(sa => sa.account_number)];
            let customerTransactions = transactions.filter(t => allAccountNumbers.includes(t.account_number));

            if (filters.startDate) {
                customerTransactions = customerTransactions.filter(t => new Date(t.date) >= new Date(filters.startDate));
            }
            if (filters.endDate) {
                const endDate = new Date(filters.endDate);
                endDate.setHours(23, 59, 59, 999);
                customerTransactions = customerTransactions.filter(t => new Date(t.date) <= endDate);
            }
            if (filters.type !== 'both') {
                customerTransactions = customerTransactions.filter(t => t.type === filters.type);
            }

            customerTransactions.sort((a, b) => {
                let valA = a[sort.key];
                let valB = b[sort.key];
                if (sort.key === 'amount') {
                    valA = parseFloat(valA);
                    valB = parseFloat(valB);
                }
                if (sort.key === 'date') {
                    valA = new Date(valA).getTime();
                    valB = new Date(valB).getTime();
                }
                
                if (valA < valB) return sort.order === 'asc' ? -1 : 1;
                if (valA > valB) return sort.order === 'asc' ? 1 : -1;
                return 0;
            });

            return customerTransactions;
        }, [transactions, customer, subAccounts, filters, sort]);
        
        if (loading) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            );
        }

        if (!customer) {
            return <p>Customer not found.</p>;
        }

        const parentAccount = customer.parent_account_id ? customers.find(c => c.account_number === customer.parent_account_id) : null;

        const handleSort = (key) => {
            setSort(prev => ({
                key,
                order: prev.key === key && prev.order === 'desc' ? 'asc' : 'desc'
            }));
        };

        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                <Link to="/customers" className="flex items-center gap-2 text-primary hover:underline mb-6">
                    <ArrowLeft size={16} /> Back to Customers
                </Link>

                <Card className="mb-6 overflow-hidden shadow-lg border-border/80 bg-card/60">
                    <CardHeader className="bg-muted/30 border-b border-border/80 p-6">
                        <div className="flex justify-between items-start flex-wrap gap-4">
                            <div>
                                <CardTitle className="text-3xl font-extrabold text-foreground flex items-center gap-3">
                                    <User size={28} className="text-primary"/>
                                    {customer.first_name} {customer.last_name}
                                </CardTitle>
                                <CardDescription className="text-md text-muted-foreground mt-1">Customer Details</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handlePrint}>
                                    <Printer className="mr-2 h-4 w-4" /> Print Statement
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex items-center gap-4 p-4 bg-background/50 rounded-lg">
                            <Hash className="h-6 w-6 text-primary" />
                            <div>
                                <p className="text-sm text-muted-foreground">Account Number</p>
                                <p className="font-bold text-lg">{customer.account_number}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 bg-background/50 rounded-lg">
                            <Phone className="h-6 w-6 text-primary" />
                            <div>
                                <p className="text-sm text-muted-foreground">Phone Number</p>
                                <p className="font-bold text-lg">{customer.phone_number || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 bg-background/50 rounded-lg">
                            <DollarSign className="h-6 w-6 text-green-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">Current Balance</p>
                                <p className="font-bold text-2xl">${parseFloat(customer.balance).toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {(parentAccount || subAccounts.length > 0) && (
                    <Card className="mb-6 shadow-lg border-border/80 bg-card/60">
                        <CardHeader className="bg-muted/30 border-b border-border/80">
                            <CardTitle>Related Accounts</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            {parentAccount && (
                                 <div className="mb-2">
                                    <span className="font-semibold">Parent Account: </span>
                                    <Link to={`/customers/${parentAccount.id}`} className="text-primary hover:underline">
                                        {parentAccount.first_name} {parentAccount.last_name} ({parentAccount.account_number})
                                    </Link>
                                 </div>
                            )}
                            {subAccounts.length > 0 && (
                                <div>
                                    <span className="font-semibold">Sub-Accounts:</span>
                                    <ul className="list-disc pl-5 mt-1">
                                        {subAccounts.map(sub => (
                                            <li key={sub.id}>
                                                <Link to={`/customers/${sub.id}`} className="text-primary hover:underline">
                                                    {sub.first_name} {sub.last_name} ({sub.account_number})
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                <Card className="shadow-lg border-border/80 bg-card/60">
                    <CardHeader className="bg-muted/30 border-b border-border/80">
                         <div className="flex justify-between items-center flex-wrap gap-4">
                            <CardTitle>Transaction History</CardTitle>
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Input type="date" value={filters.startDate} onChange={e => setFilters(prev => ({...prev, startDate: e.target.value}))} className="bg-input h-8" />
                                    <span className="text-muted-foreground">-</span>
                                    <Input type="date" value={filters.endDate} onChange={e => setFilters(prev => ({...prev, endDate: e.target.value}))} className="bg-input h-8" />
                                </div>
                                 <RadioGroup value={filters.type} onValueChange={(v) => setFilters(f => ({...f, type: v}))} className="flex items-center gap-4">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="both" id="type-both" /><Label htmlFor="type-both">Both</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="credit" id="type-credit" /><Label htmlFor="type-credit">Credit</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="debit" id="type-debit" /><Label htmlFor="type-debit">Debit</Label></div>
                                </RadioGroup>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => handleSort('date')}>Date</Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleSort('amount')}>Amount</Button>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <Transactions transactions={filteredAndSortedTransactions} customers={customers} />
                    </CardContent>
                </Card>
                
                <div className="hidden">
                    <div ref={printComponentRef}>
                         <Statement 
                          title="Customer Statement"
                          customer={customer}
                          subAccounts={subAccounts}
                          transactions={filteredAndSortedTransactions}
                          filters={filters}
                          settings={settings}
                        />
                    </div>
                </div>

            </motion.div>
        );
    };

    export default CustomerDetail;
  