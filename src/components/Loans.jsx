import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Coins, AlertTriangle, Plus, Download, History, X, ChevronDown, ChevronRight, Layers, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, isLoanOverdue } from '@/lib/utils';
import AddLoanModal from '@/components/AddLoanModal';
import PayLoanModal from '@/components/PayLoanModal';
import AdminPasswordDialog from './AdminPasswordDialog';

const fmtMoney = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A loan's original disbursed amount. Falls back to `amount` for records created
// before the original_amount column existed.
const originalOf = (loan) => parseFloat(loan.original_amount != null ? loan.original_amount : (loan.amount || 0));

// A loan's current outstanding balance. Paid loans are always $0. Falls back to
// `amount` (which older code reduced on repayment) when remaining_balance is absent.
const remainingOf = (loan) => {
  if (loan.status === 'paid') return 0;
  if (loan.remaining_balance != null) return Math.max(0, parseFloat(loan.remaining_balance) || 0);
  return Math.max(0, parseFloat(loan.amount || 0));
};

// Modal showing the full payment history for a single loan: the original
// disbursement plus every repayment recorded against it (transactions whose
// loan_id matches this loan).
const LoanHistoryModal = ({ loan, onClose }) => {
  const { transactions } = useData();

  const loanTransactions = useMemo(() => {
    if (!loan) return [];
    return (transactions || [])
      .filter(t => t.loan_id === loan.id)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [transactions, loan]);

  const totalPaid = useMemo(
    () => (loan ? Math.max(0, originalOf(loan) - remainingOf(loan)) : 0),
    [loan]
  );

  if (!loan) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-card border border-border rounded-xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]"
        >
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-teal-500 rounded-lg"><History className="h-5 w-5 text-white" /></div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Loan Payment History</h2>
                <p className="text-sm text-muted-foreground">
                  {loan.customer?.first_name} {loan.customer?.last_name} · {loan.customer?.account_number}
                </p>
                <p className="text-xs text-muted-foreground">Linked Account #: {loan.account_number || loan.customer?.account_number || '—'}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
          </div>

          <div className="grid grid-cols-4 gap-4 p-6 border-b border-border text-center">
            <div>
              <p className="text-xs text-muted-foreground">Loan Amount</p>
              <p className="text-lg font-bold text-foreground">${fmtMoney(originalOf(loan))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className={cn('text-lg font-bold', remainingOf(loan) > 0 ? 'text-orange-400' : 'text-green-400')}>${fmtMoney(remainingOf(loan))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="text-lg font-bold text-green-400">${fmtMoney(totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="text-lg font-bold text-foreground">{new Date(loan.due_date).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="overflow-y-auto p-6">
            {loanTransactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No payments have been recorded against this loan yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2">Date</th>
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loanTransactions.map(t => (
                    <tr key={t.id} className={cn(t.status === 'voided' && 'opacity-50 line-through')}>
                      <td className="py-2 text-foreground">{new Date(t.date).toLocaleDateString()}</td>
                      <td className="py-2 text-muted-foreground">{t.memo || 'Payment'}{t.status === 'voided' ? ' (VOIDED)' : ''}</td>
                      <td className="py-2 text-right font-medium text-green-400">${fmtMoney(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const Loans = () => {
  const { loans, customers, loading } = useData();
  const { isAdmin } = useAuth();
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [payingLoan, setPayingLoan] = useState(null);
  const [historyLoan, setHistoryLoan] = useState(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const toggleExpand = (customerId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId); else next.add(customerId);
      return next;
    });
  };

  const loansWithCustomerData = useMemo(() => {
    return loans.map(loan => {
      const customer = customers.find(c => c.id === loan.customer_id);
      return { ...loan, customer };
    }).filter(loan => loan.customer);
  }, [loans, customers]);

  // Loan search: matches customer name, customer number, loan number,
  // linked account number, or loan status.
  const filteredLoans = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return loansWithCustomerData;
    return loansWithCustomerData.filter(loan => {
      const c = loan.customer || {};
      const status = isLoanOverdue(loan) ? 'overdue' : (loan.status || '');
      const accountNumber = loan.account_number || c.account_number || '';
      const haystack = [
        `${c.first_name || ''} ${c.last_name || ''}`,
        c.account_number || '',
        loan.id || '',
        accountNumber,
        status,
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [loansWithCustomerData, searchTerm]);

  // Group loans by customer so a customer with several loans is shown once,
  // with an indicator, and their individual loans can be expanded on demand.
  const groupedLoans = useMemo(() => {
    const map = new Map();
    filteredLoans.forEach(loan => {
      const key = loan.customer.id;
      if (!map.has(key)) map.set(key, { customer: loan.customer, loans: [] });
      map.get(key).loans.push(loan);
    });
    return Array.from(map.values()).map(g => ({
      ...g,
      totalAmount: g.loans.reduce((s, l) => s + remainingOf(l), 0),
      hasOverdue: g.loans.some(l => isLoanOverdue(l)),
      earliestDue: g.loans.reduce((min, l) => {
        if (!l.due_date) return min;
        const d = new Date(l.due_date);
        return (!min || d < min) ? d : min;
      }, null),
    }));
  }, [filteredLoans]);

  const handleAddLoanClick = () => {
    if (isAdmin) {
      setIsLoanModalOpen(true);
    } else {
      setIsPasswordDialogOpen(true);
    }
  };

  const exportToCSV = () => {
    const headers = ['loan_id', 'customer_name', 'account_number', 'loan_amount', 'remaining_balance', 'due_date', 'status'];
    const csvRows = [headers.join(',')];
    
    filteredLoans.forEach(loan => {
        const row = [
            loan.id,
            `"${loan.customer.first_name} ${loan.customer.last_name}"`,
            loan.account_number || loan.customer.account_number,
            originalOf(loan).toFixed(2),
            remainingOf(loan).toFixed(2),
            loan.due_date,
            loan.status
        ];
        csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'loans.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="text-center p-10">Loading loans...</div>;
  }

  const statusConfig = {
    active: { color: 'text-green-400', bg: 'bg-green-900/20' },
    paid: { color: 'text-blue-400', bg: 'bg-blue-900/20' },
    overdue: { color: 'text-red-400', bg: 'bg-red-900/20' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <Coins className="h-8 w-8 text-primary" />
            <div>
            <h1 className="text-3xl font-bold text-foreground">Loans</h1>
            <p className="text-muted-foreground">Manage all active and paid customer loans.</p>
            </div>
        </div>
        <div className="flex gap-2">
            <Button onClick={exportToCSV} variant="outline"><Download className="h-4 w-4 mr-2" />Export CSV</Button>
            <Button onClick={handleAddLoanClick} className="bg-gradient-to-r from-yellow-500 to-orange-500">
                <Plus className="h-4 w-4 mr-2" />
                Add Loan
            </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search loans by customer name, customer #, loan #, account #, or status..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <motion.div
        className="bg-card backdrop-blur-xl border border-border rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Account #</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Loan Amount</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Remaining</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Due Date</th>
                <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groupedLoans.length > 0 ? groupedLoans.map(group => {
                const isMulti = group.loans.length > 1;
                const isExpanded = expanded.has(group.customer.id);

                // Single-loan customer: show the loan directly (no clutter).
                if (!isMulti) {
                  const loan = group.loans[0];
                  const status = isLoanOverdue(loan) ? 'overdue' : loan.status;
                  const config = statusConfig[status] || statusConfig.active;
                  return (
                    <tr key={loan.id} className={cn('transition-colors', status !== 'paid' && 'hover:bg-accent')}>
                      <td className="px-6 py-4 text-foreground font-medium">{group.customer.first_name} {group.customer.last_name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{loan.account_number || group.customer.account_number || '—'}</td>
                      <td className="px-6 py-4 text-foreground font-bold">${fmtMoney(originalOf(loan))}</td>
                      <td className={cn('px-6 py-4 font-bold', remainingOf(loan) > 0 ? 'text-orange-400' : 'text-green-400')}>${fmtMoney(remainingOf(loan))}</td>
                      <td className="px-6 py-4 text-muted-foreground">{loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</td>
                      <td className="px-6 py-4 text-center">
                        <div className={cn("inline-flex items-center justify-center space-x-2 px-3 py-1 rounded-full", config.bg)}>
                          {status === 'overdue' && <AlertTriangle className={`h-4 w-4 ${config.color}`} />}
                          <span className={`capitalize font-medium ${config.color}`}>{status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setHistoryLoan(loan)} title="View payment history">
                            <History className="h-4 w-4 mr-1" />
                            History
                          </Button>
                          {loan.status !== 'paid' && (
                            <Button variant="outline" size="sm" onClick={() => setPayingLoan(loan)}>
                              Pay Off
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                // Multi-loan customer: one collapsed header row + expandable loan rows.
                const groupStatus = group.hasOverdue
                  ? 'overdue'
                  : (group.loans.every(l => l.status === 'paid') ? 'paid' : 'active');
                const groupConfig = statusConfig[groupStatus] || statusConfig.active;

                return (
                  <React.Fragment key={group.customer.id}>
                    <tr className="transition-colors hover:bg-accent cursor-pointer bg-secondary/20" onClick={() => toggleExpand(group.customer.id)}>
                      <td className="px-6 py-4 text-foreground font-medium">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          <Layers className="h-4 w-4 text-primary" />
                          <span>{group.customer.first_name} {group.customer.last_name}</span>
                          <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{group.loans.length} loans</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{group.customer.account_number || '—'}</td>
                      <td className="px-6 py-4 text-foreground font-bold">${fmtMoney(group.loans.reduce((s, l) => s + originalOf(l), 0))}</td>
                      <td className="px-6 py-4 text-orange-400 font-bold">${fmtMoney(group.totalAmount)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{group.earliestDue ? new Date(group.earliestDue).toLocaleDateString() : '—'}</td>
                      <td className="px-6 py-4 text-center">
                        <div className={cn("inline-flex items-center justify-center space-x-2 px-3 py-1 rounded-full", groupConfig.bg)}>
                          {group.hasOverdue && <AlertTriangle className={`h-4 w-4 ${groupConfig.color}`} />}
                          <span className={`capitalize font-medium ${groupConfig.color}`}>{groupStatus}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-muted-foreground">{isExpanded ? 'Hide' : 'View'} loans</td>
                    </tr>
                    {isExpanded && group.loans.map(loan => {
                      const status = isLoanOverdue(loan) ? 'overdue' : loan.status;
                      const config = statusConfig[status] || statusConfig.active;
                      return (
                        <tr key={loan.id} className="bg-background/40">
                          <td className="px-6 py-3 pl-16 text-sm text-muted-foreground">Loan</td>
                          <td className="px-6 py-3 text-muted-foreground">{loan.account_number || group.customer.account_number || '—'}</td>
                          <td className="px-6 py-3 text-foreground font-semibold">${fmtMoney(originalOf(loan))}</td>
                          <td className={cn('px-6 py-3 font-semibold', remainingOf(loan) > 0 ? 'text-orange-400' : 'text-green-400')}>${fmtMoney(remainingOf(loan))}</td>
                          <td className="px-6 py-3 text-muted-foreground">{loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</td>
                          <td className="px-6 py-3 text-center">
                            <div className={cn("inline-flex items-center justify-center space-x-2 px-3 py-1 rounded-full", config.bg)}>
                              {status === 'overdue' && <AlertTriangle className={`h-4 w-4 ${config.color}`} />}
                              <span className={`capitalize font-medium ${config.color}`}>{status}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setHistoryLoan(loan)} title="View payment history">
                                <History className="h-4 w-4 mr-1" />
                                History
                              </Button>
                              {loan.status !== 'paid' && (
                                <Button variant="outline" size="sm" onClick={() => setPayingLoan(loan)}>
                                  Pay Off
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              }) : (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-muted-foreground">
                    <Coins className="mx-auto h-12 w-12 text-gray-500" />
                    <p className="mt-2">No loans found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
      <AddLoanModal isOpen={isLoanModalOpen} onClose={() => setIsLoanModalOpen(false)} />
      {payingLoan && <PayLoanModal isOpen={!!payingLoan} onClose={() => setPayingLoan(null)} loan={payingLoan} />}
      {historyLoan && <LoanHistoryModal loan={historyLoan} onClose={() => setHistoryLoan(null)} />}
      <AdminPasswordDialog isOpen={isPasswordDialogOpen} onClose={() => setIsPasswordDialogOpen(false)} onConfirm={() => setIsLoanModalOpen(true)} />
    </div>
  );
};

export default Loans;