
    import React, { useState, useMemo } from 'react';
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
    import PayMyLoanModal from '@/components/PayMyLoanModal';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
    import { formatCurrency } from '@/lib/utils';

    // Signed effect a single transaction has on a customer's balance.
    // Mirrors the balance rules used by the backend so the running total
    // reconciles to the customer's current stored balance.
    const signedEffect = (tx) => {
        if (tx.status === 'voided') return 0;
        const amt = parseFloat(tx.amount) || 0;
        if (tx.type === 'credit' && tx.status !== 'bounced') return amt;
        if (tx.type === 'transfer') {
            const memo = (tx.memo || '').toLowerCase();
            return memo.includes('from') ? amt : -amt;
        }
        return -amt;
    };

    const CustomerDetail = () => {
        const { id } = useParams();
        const { customers, transactions, loans, settings, loading } = useData();
        
        const customer = useMemo(() => customers.find(c => c.id === id), [customers, id]);
        const [isPayLoanOpen, setIsPayLoanOpen] = useState(false);

        // Outstanding loans for this customer (used to surface "Pay My Loan").
        const hasOutstandingLoans = useMemo(() => {
            if (!customer || !loans) return false;
            return loans.some(l => l.customer_id === customer.id && l.status !== 'paid'
                && (l.remaining_balance != null ? parseFloat(l.remaining_balance) : parseFloat(l.amount || 0)) > 0);
        }, [loans, customer]);

        const canPayLoan = hasOutstandingLoans
            && customer
            && ((parseFloat(customer.balance) || 0) + (parseFloat(customer.overdraft_limit) || 0)) > 0;
        
        const [filters, setFilters] = useState({ startDate: '', endDate: '', type: 'both' });
        const [sort, setSort] = useState({ key: 'date', order: 'desc' });
        // Parent statements show ONLY this account's own transactions by default.
        // Sub-account activity is included only when explicitly requested.
        const [includeSubAccounts, setIncludeSubAccounts] = useState(false);

        const subAccounts = useMemo(() => {
            if (!customer) return [];
            return customers.filter(c => c.parent_account_id === customer.account_number);
        }, [customers, customer]);

        // The sub-accounts actually folded into the statement / running balance.
        const includedSubAccounts = useMemo(
            () => (includeSubAccounts ? subAccounts : []),
            [includeSubAccounts, subAccounts]
        );

        // Running "balance as of that date" for every transaction on this account
        // (including sub-accounts). Computed over the FULL history in chronological
        // order so it stays correct even when the on-screen list is filtered.
        // The opening balance absorbs any starting balance carried over from before
        // the first recorded transaction (e.g. preview-mode / pre-launch activity).
        const { balanceMap, openingBalance } = useMemo(() => {
            if (!transactions || !customer) return { balanceMap: {}, openingBalance: 0 };
            const allAccountNumbers = [customer.account_number, ...includedSubAccounts.map(sa => sa.account_number)];
            const all = transactions
                .filter(t => allAccountNumbers.includes(t.account_number))
                .slice()
                .sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.id).localeCompare(String(b.id)));
            const anchor = (parseFloat(customer.balance) || 0)
                + includedSubAccounts.reduce((s, sa) => s + (parseFloat(sa.balance) || 0), 0);
            const totalEffect = all.reduce((s, t) => s + signedEffect(t), 0);
            const opening = anchor - totalEffect;
            let running = opening;
            const map = {};
            for (const t of all) { running += signedEffect(t); map[t.id] = running; }
            return { balanceMap: map, openingBalance: opening };
        }, [transactions, customer, includedSubAccounts]);
        
        const handlePrint = () => {
            if (!customer) return;
            const companyInfo = settings?.check_config || {};
            const totals = filteredAndSortedTransactions.reduce((acc, tx) => {
                if (tx.status !== 'voided') {
                    if (tx.type === 'credit') acc.credit += parseFloat(tx.amount);
                    else if (tx.type === 'debit' || tx.type === 'fee') acc.debit += parseFloat(tx.amount);
                }
                return acc;
            }, { credit: 0, debit: 0 });

            const txRows = filteredAndSortedTransactions.map(tx => `
                <tr style="border-bottom: 1px solid #ddd; ${tx.status === 'voided' ? 'opacity:0.5;' : ''}">
                    <td style="padding: 8px;">${new Date(tx.date).toLocaleDateString()}</td>
                    <td style="padding: 8px; text-transform: capitalize;">${tx.type}</td>
                    <td style="padding: 8px;">${tx.memo || tx.reason || ''} ${tx.status === 'voided' ? '(VOIDED)' : ''}</td>
                    <td style="padding: 8px; text-align: right; font-family: monospace; color: ${tx.type === 'credit' ? 'green' : 'red'};">${tx.type === 'credit' ? '+' : '-'}$${formatCurrency(tx.amount)}</td>
                    <td style="padding: 8px; text-align: right; font-family: monospace; font-weight: bold;">$${formatCurrency(balanceMap[tx.id] ?? 0)}</td>
                </tr>`).join('');

            const subAccountsHtml = includedSubAccounts.length > 0 ? `<div style="font-size:11px;margin-top:8px;"><strong>Sub-Accounts (included):</strong><ul style="padding-left:20px;margin:4px 0;">${includedSubAccounts.map(sa => `<li>${sa.first_name} ${sa.last_name} (${sa.account_number})</li>`).join('')}</ul></div>` : '';

            const printWindow = window.open('', '_blank', 'width=900,height=700');
            if (!printWindow) return;
            printWindow.document.write(`<!DOCTYPE html><html><head><title>Statement - ${customer.first_name} ${customer.last_name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; padding: 40px; color: #000; background: #fff; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #000;margin-bottom:24px;">
  <div>
    <h1 style="font-size:24px;font-weight:bold;">${customer.first_name} ${customer.last_name}</h1>
    <p style="color:#555;">Account: ${customer.account_number}</p>
    ${customer.phone_number ? `<p style="color:#555;">Phone: ${customer.phone_number}</p>` : ''}
    ${subAccountsHtml}
  </div>
  <div style="text-align:right;">
    ${companyInfo.name ? `<h2 style="font-size:16px;font-weight:bold;color:#333;">${companyInfo.name}</h2>` : ''}
    ${companyInfo.address1 ? `<p style="color:#555;">${companyInfo.address1}</p>` : ''}
    ${companyInfo.address2 ? `<p style="color:#555;">${companyInfo.address2}</p>` : ''}
    <p style="color:#555;margin-top:8px;">Date: ${new Date().toLocaleDateString()}</p>
  </div>
</div>
<div style="margin-bottom:24px;">
  <h3 style="font-size:18px;font-weight:600;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:16px;">Summary</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center;">
    <div style="background:#f0f0f0;padding:16px;border-radius:6px;"><p style="font-size:12px;color:#555;">Total Credits</p><p style="font-size:20px;font-weight:bold;color:green;">$${formatCurrency(totals.credit)}</p></div>
    <div style="background:#f0f0f0;padding:16px;border-radius:6px;"><p style="font-size:12px;color:#555;">Total Debits & Fees</p><p style="font-size:20px;font-weight:bold;color:red;">$${formatCurrency(totals.debit)}</p></div>
    <div style="background:#e0eeff;padding:16px;border-radius:6px;"><p style="font-size:12px;color:#555;">Current Balance</p><p style="font-size:20px;font-weight:bold;color:#1a5db5;">$${formatCurrency(customer.balance)}</p></div>
  </div>
</div>
<div>
  <h3 style="font-size:18px;font-weight:600;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:16px;">Transaction History</h3>
  <p style="font-size:13px;color:#555;margin-bottom:12px;">Opening balance (before listed activity): <strong>$${formatCurrency(openingBalance)}</strong></p>
  ${filteredAndSortedTransactions.length === 0 ? '<p style="text-align:center;padding:24px;color:#888;">No transactions to display.</p>' : `
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="border-bottom:2px solid #000;"><th style="padding:8px;text-align:left;">Date</th><th style="padding:8px;text-align:left;">Type</th><th style="padding:8px;text-align:left;">Memo</th><th style="padding:8px;text-align:right;">Amount</th><th style="padding:8px;text-align:right;">Balance</th></tr></thead>
    <tbody>${txRows}</tbody>
  </table>`}
</div>
<footer style="text-align:center;font-size:11px;color:#888;padding-top:16px;border-top:1px solid #ddd;margin-top:32px;">Thank you for your business.</footer>
</body></html>`);
            printWindow.document.close();
            setTimeout(() => { printWindow.focus(); printWindow.print(); setTimeout(() => printWindow.close(), 1000); }, 500);
        };

        const filteredAndSortedTransactions = useMemo(() => {
            if (!transactions || !customer) return [];
            const allAccountNumbers = [customer.account_number, ...includedSubAccounts.map(sa => sa.account_number)];
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
        }, [transactions, customer, subAccounts, filters, sort, includedSubAccounts]);
        
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
                            <div className="flex items-center gap-3 flex-wrap">
                                {canPayLoan && (
                                    <Button onClick={() => setIsPayLoanOpen(true)} className="bg-gradient-to-r from-green-500 to-teal-500">
                                        <DollarSign className="mr-2 h-4 w-4" /> Pay My Loan
                                    </Button>
                                )}
                                {subAccounts.length > 0 && (
                                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={includeSubAccounts}
                                            onChange={(e) => setIncludeSubAccounts(e.target.checked)}
                                            className="h-4 w-4 rounded border-border accent-primary"
                                        />
                                        Include sub-accounts
                                    </label>
                                )}
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
                        <Transactions transactions={filteredAndSortedTransactions} customers={customers} runningBalances={balanceMap} />
                    </CardContent>
                </Card>
                
                <PayMyLoanModal isOpen={isPayLoanOpen} onClose={() => setIsPayLoanOpen(false)} customer={customer} />
            </motion.div>
        );
    };

    export default CustomerDetail;
  