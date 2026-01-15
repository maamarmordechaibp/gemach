import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Coins, AlertTriangle, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AddLoanModal from '@/components/AddLoanModal';
import PayLoanModal from '@/components/PayLoanModal';
import AdminPasswordDialog from './AdminPasswordDialog';

const Loans = () => {
  const { loans, customers, loading } = useData();
  const { isAdmin } = useAuth();
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [payingLoan, setPayingLoan] = useState(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  const loansWithCustomerData = useMemo(() => {
    return loans.map(loan => {
      const customer = customers.find(c => c.id === loan.customer_id);
      return { ...loan, customer };
    }).filter(loan => loan.customer);
  }, [loans, customers]);

  const handleAddLoanClick = () => {
    if (isAdmin) {
      setIsLoanModalOpen(true);
    } else {
      setIsPasswordDialogOpen(true);
    }
  };

  const exportToCSV = () => {
    const headers = ['loan_id', 'customer_name', 'account_number', 'amount', 'due_date', 'status'];
    const csvRows = [headers.join(',')];
    
    loansWithCustomerData.forEach(loan => {
        const row = [
            loan.id,
            `"${loan.customer.first_name} ${loan.customer.last_name}"`,
            loan.customer.account_number,
            loan.amount,
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

      <motion.div
        className="bg-card backdrop-blur-xl border border-border rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Amount</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Due Date</th>
                <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loansWithCustomerData.length > 0 ? loansWithCustomerData.map(loan => {
                const config = statusConfig[loan.status] || statusConfig.active;
                return (
                  <motion.tr 
                    key={loan.id} 
                    className={cn('transition-colors', (loan.status === 'active' || loan.status === 'overdue') && 'hover:bg-accent')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <td className="px-6 py-4 text-foreground font-medium">{loan.customer.first_name} {loan.customer.last_name}</td>
                    <td className="px-6 py-4 text-foreground font-bold">${parseFloat(loan.amount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(loan.due_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-center">
                      <div className={cn("flex items-center justify-center space-x-2 p-1 rounded-full", config.bg)}>
                        {loan.status === 'overdue' && <AlertTriangle className={`h-4 w-4 ${config.color}`} />}
                        <span className={`capitalize font-medium ${config.color}`}>{loan.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {loan.status !== 'paid' && (
                        <Button variant="outline" size="sm" onClick={() => setPayingLoan(loan)}>
                          Pay Off
                        </Button>
                      )}
                    </td>
                  </motion.tr>
                )
              }) : (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-muted-foreground">
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
      <AdminPasswordDialog isOpen={isPasswordDialogOpen} onClose={() => setIsPasswordDialogOpen(false)} onConfirm={() => setIsLoanModalOpen(true)} />
    </div>
  );
};

export default Loans;