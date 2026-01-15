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
  Download,
  X,
  SlidersHorizontal
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TransactionFilters = ({ filters, onFiltersChange, onClear }) => {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" />
            Filters & Search
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onClear}>
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>

          {/* Transaction Type */}
          <Select value={filters.type} onValueChange={(value) => onFiltersChange({ ...filters, type: value })}>
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="credit">Credits</SelectItem>
              <SelectItem value="debit">Debits</SelectItem>
              <SelectItem value="fee">Fees</SelectItem>
              <SelectItem value="transfer">Transfers</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={filters.status} onValueChange={(value) => onFiltersChange({ ...filters, status: value })}>
            <SelectTrigger>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
            </SelectContent>
          </Select>

          {/* Amount Range */}
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Min $"
              value={filters.minAmount}
              onChange={(e) => onFiltersChange({ ...filters, minAmount: e.target.value })}
              className="w-20"
            />
            <Input
              type="number"
              placeholder="Max $"
              value={filters.maxAmount}
              onChange={(e) => onFiltersChange({ ...filters, maxAmount: e.target.value })}
              className="w-20"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {/* Date Range */}
          <Input
            type="date"
            placeholder="Start Date"
            value={filters.startDate}
            onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value })}
          />
          <Input
            type="date"
            placeholder="End Date"
            value={filters.endDate}
            onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value })}
          />
          
          {/* Sort Options */}
          <Select value={filters.sortBy} onValueChange={(value) => onFiltersChange({ ...filters, sortBy: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Date (Newest)</SelectItem>
              <SelectItem value="date-asc">Date (Oldest)</SelectItem>
              <SelectItem value="amount-desc">Amount (High-Low)</SelectItem>
              <SelectItem value="amount-asc">Amount (Low-High)</SelectItem>
              <SelectItem value="customer">Customer (A-Z)</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};

const TransactionSummary = ({ transactions }) => {
  const summary = useMemo(() => {
    const completed = transactions.filter(tx => tx.status === 'completed');
    const credits = completed.filter(tx => tx.type === 'credit');
    const debits = completed.filter(tx => tx.type === 'debit');
    const fees = completed.filter(tx => tx.type === 'fee');
    
    return {
      totalTransactions: transactions.length,
      totalCredits: credits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0),
      totalDebits: debits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0),
      totalFees: fees.reduce((sum, tx) => sum + parseFloat(tx.amount), 0),
      pendingCount: transactions.filter(tx => tx.status === 'pending').length,
      bouncedCount: transactions.filter(tx => tx.status === 'bounced').length,
      voidedCount: transactions.filter(tx => tx.status === 'voided').length
    };
  }, [transactions]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-blue-400" />
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{summary.totalTransactions}</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-400" />
          <div>
            <p className="text-sm text-muted-foreground">Credits</p>
            <p className="text-lg font-bold text-green-400">${summary.totalCredits.toFixed(2)}</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-red-400" />
          <div>
            <p className="text-sm text-muted-foreground">Debits</p>
            <p className="text-lg font-bold text-red-400">${summary.totalDebits.toFixed(2)}</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-yellow-400" />
          <div>
            <p className="text-sm text-muted-foreground">Fees</p>
            <p className="text-lg font-bold text-yellow-400">${summary.totalFees.toFixed(2)}</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-400" />
          <div>
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-orange-400">{summary.pendingCount}</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <div>
            <p className="text-sm text-muted-foreground">Bounced</p>
            <p className="text-lg font-bold text-red-400">{summary.bouncedCount}</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <X className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-sm text-muted-foreground">Voided</p>
            <p className="text-lg font-bold text-gray-400">{summary.voidedCount}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

const TransactionsList = ({ transactions, customers, onVoid }) => {
  const getCustomerName = (accountNumber) => {
    const customer = customers.find(c => c.account_number === accountNumber);
    return customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown Customer';
  };

  const getStatusStyle = (status) => {
      switch (status) {
          case 'voided': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
          case 'bounced': return 'bg-red-500/20 text-red-400 border-red-500/30';
          case 'on_hold': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
          case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
          case 'pending': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
          default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      }
  };
  
  const getRowStyle = (status) => {
     switch (status) {
          case 'voided': return 'opacity-50 line-through bg-gray-900/10';
          case 'bounced': return 'bg-red-900/10 border-l-4 border-red-500/30';
          case 'on_hold': return 'bg-orange-900/10 border-l-4 border-orange-500/30';
          default: return 'hover:bg-muted/50';
      }
  };
  
  const getIconForType = (tx) => {
    if (tx.memo && tx.memo.toLowerCase().includes('on hold')) return <Lock size={16} className="text-orange-400"/>;
    if (tx.type === 'credit') return <TrendingUp size={16} className="text-green-400"/>;
    if (tx.type === 'fee') return <DollarSign size={16} className="text-yellow-400"/>;
    if (tx.type === 'transfer') return <ArrowUpDown size={16} className="text-blue-400"/>;
    return <TrendingDown size={16} className="text-red-400"/>;
  };

  const formatDescription = (tx) => {
    if (tx.type === 'fee') {
      return tx.memo || 'Fee Transaction';
    }
    return tx.memo || tx.type;
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground">No transactions found</h3>
        <p className="text-muted-foreground">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Date</th>
            <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Description</th>
            <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Customer</th>
            <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Amount</th>
            <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Status</th>
            <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.map((tx) => {
              const isCredit = tx.type === 'credit' && tx.status !== 'bounced';
              const isFee = tx.type === 'fee';
              
              return (
                <motion.tr
                  key={tx.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className={cn('transition-colors', getRowStyle(tx.status))}
                >
                  <td className="px-6 py-4 text-muted-foreground font-mono text-sm">
                    {new Date(tx.date).toLocaleDateString()}
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                       {getIconForType(tx)}
                       <div>
                         <div className={cn('font-medium', {
                           'text-green-400': isCredit,
                           'text-red-400': !isCredit && !isFee,
                           'text-yellow-400': isFee
                         })}>
                           {formatDescription(tx)}
                         </div>
                         {tx.id && (
                           <div className="text-xs text-muted-foreground font-mono">
                             ID: {tx.id.substring(0, 12)}...
                           </div>
                         )}
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-foreground">{getCustomerName(tx.account_number)}</div>
                      <div className="text-sm text-muted-foreground">{tx.account_number}</div>
                    </div>
                  </td>
                  <td className={cn('px-6 py-4 text-right font-bold text-lg', {
                    'text-green-400': isCredit,
                    'text-red-400': !isCredit && !isFee,
                    'text-yellow-400': isFee
                  })}>
                    {isCredit ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge className={cn('border', getStatusStyle(tx.status))}>
                        {tx.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {tx.status !== 'voided' && (
                      <Button variant="ghost" size="sm" onClick={() => onVoid(tx)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </motion.tr>
              )
          })}
        </tbody>
      </table>
    </div>
  );
};

const TransactionsEnhanced = ({ transactions: initialTransactions, customers: initialCustomers }) => {
  const { transactions: allTransactions, customers: allCustomers, refreshData } = useData();
  const [voidingTransaction, setVoidingTransaction] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    status: 'all',
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: '',
    sortBy: 'date-desc'
  });
  
  const transactions = useMemo(() => initialTransactions || allTransactions, [initialTransactions, allTransactions]);
  const customers = useMemo(() => initialCustomers || allCustomers, [initialCustomers, allCustomers]);

  // Apply filters and sorting
  const filteredAndSortedTransactions = useMemo(() => {
    if (!transactions) return [];
    
    let filtered = [...transactions];

    // Apply filters
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(tx => {
        const customer = customers.find(c => c.account_number === tx.account_number);
        const customerName = customer ? `${customer.first_name} ${customer.last_name}` : '';
        const description = tx.memo || tx.type || '';
        
        return (
          customerName.toLowerCase().includes(searchTerm) ||
          description.toLowerCase().includes(searchTerm) ||
          tx.account_number.toLowerCase().includes(searchTerm) ||
          tx.amount.toString().includes(searchTerm) ||
          tx.status.toLowerCase().includes(searchTerm) ||
          new Date(tx.date).toLocaleDateString().includes(searchTerm)
        );
      });
    }

    if (filters.type !== 'all') {
      filtered = filtered.filter(tx => tx.type === filters.type);
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(tx => tx.status === filters.status);
    }

    if (filters.minAmount) {
      filtered = filtered.filter(tx => parseFloat(tx.amount) >= parseFloat(filters.minAmount));
    }

    if (filters.maxAmount) {
      filtered = filtered.filter(tx => parseFloat(tx.amount) <= parseFloat(filters.maxAmount));
    }

    if (filters.startDate) {
      filtered = filtered.filter(tx => new Date(tx.date) >= new Date(filters.startDate));
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(tx => new Date(tx.date) <= endDate);
    }

    // Apply sorting
    switch (filters.sortBy) {
      case 'date-desc':
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        break;
      case 'date-asc':
        filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
        break;
      case 'amount-desc':
        filtered.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
        break;
      case 'amount-asc':
        filtered.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
        break;
      case 'customer':
        filtered.sort((a, b) => {
          const customerA = customers.find(c => c.account_number === a.account_number);
          const customerB = customers.find(c => c.account_number === b.account_number);
          const nameA = customerA ? `${customerA.first_name} ${customerA.last_name}` : '';
          const nameB = customerB ? `${customerB.first_name} ${customerB.last_name}` : '';
          return nameA.localeCompare(nameB);
        });
        break;
      case 'status':
        filtered.sort((a, b) => a.status.localeCompare(b.status));
        break;
    }

    return filtered;
  }, [transactions, customers, filters]);

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

  const clearFilters = () => {
    setFilters({
      search: '',
      type: 'all',
      status: 'all',
      minAmount: '',
      maxAmount: '',
      startDate: '',
      endDate: '',
      sortBy: 'date-desc'
    });
  };

  const exportToCSV = () => {
    if (filteredAndSortedTransactions.length === 0) {
      toast({ title: 'No Data', description: 'No transactions to export.', variant: 'destructive' });
      return;
    }

    const headers = ['Date', 'Time', 'Type', 'Description', 'Customer', 'Account', 'Amount', 'Status', 'Transaction ID'];
    const rows = filteredAndSortedTransactions.map(tx => {
      const customer = customers.find(c => c.account_number === tx.account_number);
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown';
      
      return [
        new Date(tx.date).toLocaleDateString(),
        new Date(tx.date).toLocaleTimeString(),
        tx.type,
        tx.memo || tx.type,
        customerName,
        tx.account_number,
        tx.amount,
        tx.status,
        tx.id
      ].map(field => `"${field}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const hasTransactions = transactions && transactions.length > 0;

  return (
    <div className="space-y-6 p-6">
      {!initialTransactions && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">All Transactions</h1>
            <p className="text-muted-foreground">A complete log of all financial movements.</p>
          </div>
          <Button onClick={exportToCSV} disabled={filteredAndSortedTransactions.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      )}

      {hasTransactions && (
        <>
          <TransactionSummary transactions={filteredAndSortedTransactions} />
          
          <TransactionFilters 
            filters={filters} 
            onFiltersChange={setFilters} 
            onClear={clearFilters}
          />
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-card border border-border rounded-xl overflow-hidden shadow-lg"
      >
        {hasTransactions ? (
          <TransactionsList 
            transactions={filteredAndSortedTransactions} 
            customers={customers} 
            onVoid={setVoidingTransaction} 
          />
        ) : (
          <div className="text-center py-12">
            <List className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No transactions to display</h3>
            <p className="text-muted-foreground">Create a transaction to get started.</p>
          </div>
        )}
      </motion.div>

      <AlertDialog open={!!voidingTransaction} onOpenChange={(open) => !open && setVoidingTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-yellow-400" />
              Confirm Void Transaction
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void this transaction? This will reverse the balance change for the customer and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoidTransaction} className="bg-red-600 hover:bg-red-700">
              Confirm Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TransactionsEnhanced;
