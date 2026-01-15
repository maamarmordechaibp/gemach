
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  List, 
  TrendingUp, 
  TrendingDown, 
  RotateCcw, 
  AlertTriangle, 
  Lock, 
  CheckCircle, 
  Search, 
  Filter, 
  Calendar, 
  DollarSign,
  User,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TransactionsList = ({ transactions, customers, onVoid }) => {
      const getCustomerName = (accountNumber) => {
        const customer = customers.find(c => c.account_number === accountNumber);
        return customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown Customer';
      };

      const getStatusStyle = (status) => {
          switch (status) {
              case 'voided': return 'bg-slate-600 text-slate-200';
              case 'bounced': return 'bg-red-500/20 text-red-400';
              case 'on_hold': return 'bg-orange-500/20 text-orange-400';
              case 'pending': return 'bg-yellow-500/20 text-yellow-400';
              default: return 'bg-green-500/20 text-green-400';
          }
      };
      
      const getRowStyle = (status) => {
         switch (status) {
              case 'voided': return 'opacity-50 line-through';
              case 'bounced': return 'bg-red-900/20';
              default: return '';
          }
      };
      
      const getIconForType = (tx) => {
        if (tx.memo && tx.memo.toLowerCase().includes('on hold')) return <Lock className="h-4 w-4 text-orange-400" />;
        if (tx.type === 'credit') return <TrendingUp className="h-4 w-4 text-green-400" />;
        if (tx.type === 'fee') return <DollarSign className="h-4 w-4 text-yellow-400" />;
        return <TrendingDown className="h-4 w-4 text-red-400" />;
      };

      const getTypeLabel = (tx) => {
        if (tx.type === 'fee') return 'Fee';
        if (tx.type === 'transfer') return 'Transfer';
        if (tx.memo && tx.memo.toLowerCase().includes('loan')) return 'Loan';
        if (tx.memo && tx.memo.toLowerCase().includes('check')) return 'Check';
        return tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
      };

      return (
        <>
          {transactions.map((tx) => {
              const isCredit = tx.type === 'credit' && tx.status !== 'bounced';
              const isBounced = tx.status === 'bounced';
              const customer = customers.find(c => c.account_number === tx.account_number);
              
              return (
                <motion.tr
                  key={tx.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className={cn('hover:bg-slate-700/30 transition-colors', getRowStyle(tx.status))}
                >
                  <td className="px-6 py-4 text-slate-300">
                    <div className="flex flex-col">
                      <span className="font-medium">{new Date(tx.date).toLocaleDateString()}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                       {getIconForType(tx)}
                       <Badge variant="outline" className={cn('text-xs', getStatusStyle(tx.status))}>
                         {getTypeLabel(tx)}
                       </Badge>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-white">{getCustomerName(tx.account_number)}</span>
                      <span className="text-xs text-muted-foreground">{tx.account_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    <div className="max-w-xs truncate" title={tx.memo}>
                      {tx.memo || 'No description'}
                    </div>
                  </td>
                  <td className={cn('px-6 py-4 text-right font-bold text-lg', isCredit ? 'text-green-400' : 'text-red-400')}>
                    {isCredit ? '+' : '-'}${parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge 
                      variant={tx.status === 'completed' ? 'default' : tx.status === 'bounced' ? 'destructive' : 'secondary'} 
                      className={getStatusStyle(tx.status)}
                    >
                        {tx.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {tx.status !== 'voided' && (
                      <Button variant="destructive" size="sm" onClick={() => onVoid(tx)} title="Void Transaction">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </motion.tr>
              )
          })}
        </>
      );
    };

    const Transactions = ({ transactions: initialTransactions, customers: initialCustomers }) => {
      const { transactions: allTransactions, customers: allCustomers, refreshData } = useData();
      const [voidingTransaction, setVoidingTransaction] = useState(null);
      const [searchTerm, setSearchTerm] = useState('');
      const [typeFilter, setTypeFilter] = useState('all');
      const [statusFilter, setStatusFilter] = useState('all');
      const [amountFilter, setAmountFilter] = useState({ min: '', max: '' });
      const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
      const [sortBy, setSortBy] = useState('date');
      const [sortOrder, setSortOrder] = useState('desc');
      const [currentPage, setCurrentPage] = useState(1);
      const itemsPerPage = 25;
      
      const transactions = useMemo(() => initialTransactions || allTransactions, [initialTransactions, allTransactions]);
      const customers = useMemo(() => initialCustomers || allCustomers, [initialCustomers, allCustomers]);

      // Filter and sort transactions
      const filteredAndSortedTransactions = useMemo(() => {
        if (!transactions || !customers) return [];
        
        let filtered = transactions.filter(tx => {
          const customer = customers.find(c => c.account_number === tx.account_number);
          const customerName = customer ? `${customer.first_name} ${customer.last_name}`.toLowerCase() : '';
          const memo = (tx.memo || '').toLowerCase();
          const searchMatch = searchTerm === '' || 
            customerName.includes(searchTerm.toLowerCase()) ||
            memo.includes(searchTerm.toLowerCase()) ||
            tx.account_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tx.id.toLowerCase().includes(searchTerm.toLowerCase());
          
          const typeMatch = typeFilter === 'all' || tx.type === typeFilter;
          const statusMatch = statusFilter === 'all' || tx.status === statusFilter;
          
          const amount = parseFloat(tx.amount);
          const amountMatch = (!amountFilter.min || amount >= parseFloat(amountFilter.min)) &&
                             (!amountFilter.max || amount <= parseFloat(amountFilter.max));
          
          const txDate = new Date(tx.date);
          const dateMatch = (!dateFilter.start || txDate >= new Date(dateFilter.start)) &&
                           (!dateFilter.end || txDate <= new Date(dateFilter.end + 'T23:59:59'));
          
          return searchMatch && typeMatch && statusMatch && amountMatch && dateMatch;
        });
        
        // Sort transactions
        filtered.sort((a, b) => {
          let aVal, bVal;
          
          switch (sortBy) {
            case 'date':
              aVal = new Date(a.date);
              bVal = new Date(b.date);
              break;
            case 'amount':
              aVal = parseFloat(a.amount);
              bVal = parseFloat(b.amount);
              break;
            case 'customer':
              const customerA = customers.find(c => c.account_number === a.account_number);
              const customerB = customers.find(c => c.account_number === b.account_number);
              aVal = customerA ? `${customerA.first_name} ${customerA.last_name}` : '';
              bVal = customerB ? `${customerB.first_name} ${customerB.last_name}` : '';
              break;
            case 'type':
              aVal = a.type;
              bVal = b.type;
              break;
            default:
              aVal = a[sortBy];
              bVal = b[sortBy];
          }
          
          if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        });
        
        return filtered;
      }, [transactions, customers, searchTerm, typeFilter, statusFilter, amountFilter, dateFilter, sortBy, sortOrder]);

      // Pagination
      const totalPages = Math.ceil(filteredAndSortedTransactions.length / itemsPerPage);
      const paginatedTransactions = filteredAndSortedTransactions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      );

      // Summary statistics
      const summaryStats = useMemo(() => {
        const stats = filteredAndSortedTransactions.reduce((acc, tx) => {
          if (tx.status !== 'voided') {
            if (tx.type === 'credit' && tx.status !== 'bounced') {
              acc.totalCredits += parseFloat(tx.amount);
              acc.creditCount++;
            } else if (tx.type === 'debit' || tx.status === 'bounced') {
              acc.totalDebits += parseFloat(tx.amount);
              acc.debitCount++;
            }
            if (tx.type === 'fee') {
              acc.totalFees += parseFloat(tx.amount);
              acc.feeCount++;
            }
          }
          return acc;
        }, { totalCredits: 0, totalDebits: 0, totalFees: 0, creditCount: 0, debitCount: 0, feeCount: 0 });
        
        stats.netAmount = stats.totalCredits - stats.totalDebits;
        return stats;
      }, [filteredAndSortedTransactions]);

      const handleSort = (field) => {
        if (sortBy === field) {
          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
          setSortBy(field);
          setSortOrder('desc');
        }
        setCurrentPage(1);
      };

      const clearFilters = () => {
        setSearchTerm('');
        setTypeFilter('all');
        setStatusFilter('all');
        setAmountFilter({ min: '', max: '' });
        setDateFilter({ start: '', end: '' });
        setSortBy('date');
        setSortOrder('desc');
        setCurrentPage(1);
      };

      const exportToCSV = () => {
        if (filteredAndSortedTransactions.length === 0) {
          toast({ title: 'No Data', description: 'No transactions to export.', variant: 'destructive' });
          return;
        }
        
        const headers = ['Date', 'Type', 'Customer', 'Account Number', 'Amount', 'Memo', 'Status'];
        const csvData = filteredAndSortedTransactions.map(tx => {
          const customer = customers.find(c => c.account_number === tx.account_number);
          const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown';
          return [
            new Date(tx.date).toLocaleDateString(),
            tx.type,
            customerName,
            tx.account_number,
            parseFloat(tx.amount).toFixed(2),
            tx.memo || '',
            tx.status
          ].map(field => `"${field}"`).join(',');
        });
        
        const csv = [headers.join(','), ...csvData].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      };


      const handleVoidTransaction = async () => {
        if (!voidingTransaction) return;
        
        try {
            const { error } = await supabase.rpc('void_transaction', { p_transaction_id: voidingTransaction.id });
            if (error) throw error;
            toast({ title: "Success", description: "Transaction has been voided." });
            refreshData();
        } catch (error) {
          toast({ title: "Error Voiding Transaction", description: error.message, variant: "destructive" });
        } finally {
          setVoidingTransaction(null);
        }
      };

      const hasTransactions = transactions && transactions.length > 0;

      return (
        <div className="space-y-6">
          {!initialTransactions && (
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Transaction History</h1>
                <p className="text-muted-foreground">Complete log of all financial movements</p>
              </div>
              <Button onClick={exportToCSV} variant="outline" disabled={filteredAndSortedTransactions.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          )}

          {/* Summary Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Credits</p>
                    <p className="text-2xl font-bold text-green-400">
                      ${summaryStats.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">{summaryStats.creditCount} transactions</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Debits</p>
                    <p className="text-2xl font-bold text-red-400">
                      ${summaryStats.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">{summaryStats.debitCount} transactions</p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-red-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Fees</p>
                    <p className="text-2xl font-bold text-yellow-400">
                      ${summaryStats.totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">{summaryStats.feeCount} fees</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-yellow-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Net Amount</p>
                    <p className={`text-2xl font-bold ${summaryStats.netAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${Math.abs(summaryStats.netAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filteredAndSortedTransactions.length} total transactions
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Search */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters & Search
                </CardTitle>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by customer name, memo, account number, or transaction ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Filter Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="fee">Fee</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                    <SelectItem value="voided">Voided</SelectItem>
                  </SelectContent>
                </Select>
                
                <Input
                  type="number"
                  placeholder="Min Amount"
                  value={amountFilter.min}
                  onChange={(e) => setAmountFilter({ ...amountFilter, min: e.target.value })}
                />
                
                <Input
                  type="number"
                  placeholder="Max Amount"
                  value={amountFilter.max}
                  onChange={(e) => setAmountFilter({ ...amountFilter, max: e.target.value })}
                />
                
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={dateFilter.start}
                  onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                />
                
                <Input
                  type="date"
                  placeholder="End Date"
                  value={dateFilter.end}
                  onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl overflow-hidden"
          >
            {paginatedTransactions.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('date')}
                            className="flex items-center gap-1 hover:bg-slate-600/50"
                          >
                            Date
                            {sortBy === 'date' && (
                              sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('type')}
                            className="flex items-center gap-1 hover:bg-slate-600/50"
                          >
                            Type
                            {sortBy === 'type' && (
                              sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('customer')}
                            className="flex items-center gap-1 hover:bg-slate-600/50"
                          >
                            Customer
                            {sortBy === 'customer' && (
                              sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">Description</th>
                        <th className="px-6 py-4 text-right text-sm font-medium text-slate-300">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('amount')}
                            className="flex items-center gap-1 hover:bg-slate-600/50"
                          >
                            Amount
                            {sortBy === 'amount' && (
                              sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </th>
                        <th className="px-6 py-4 text-center text-sm font-medium text-slate-300">Status</th>
                        <th className="px-6 py-4 text-right text-sm font-medium text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      <TransactionsList transactions={paginatedTransactions} customers={customers} onVoid={setVoidingTransaction} />
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 bg-slate-800/50 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedTransactions.length)} of {filteredAndSortedTransactions.length} transactions
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <List className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground">No transactions found</h3>
                <p className="text-muted-foreground">
                  {filteredAndSortedTransactions.length === 0 && (searchTerm || typeFilter !== 'all' || statusFilter !== 'all')
                    ? 'Try adjusting your filters to see more results.'
                    : 'Create a transaction to get started.'}
                </p>
              </div>
            )}
          </motion.div>

          <AlertDialog open={!!voidingTransaction} onOpenChange={(open) => !open && setVoidingTransaction(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-yellow-400" />Confirm Void Transaction</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to void this transaction? This will reverse the balance change for the customer and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleVoidTransaction} className="bg-red-600 hover:bg-red-700">Confirm Void</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    };

    export default Transactions;
  