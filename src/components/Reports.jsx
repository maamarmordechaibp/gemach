
    import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
    import { motion } from 'framer-motion';
    import { useData } from '@/contexts/DataContext';
    import { FileText, Filter, Download, RotateCcw, Loader2, Printer } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { toast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
    import { saveAs } from 'file-saver';
    import { useReactToPrint } from 'react-to-print';
    import Statement from '@/components/ui/statement';
    import { cn } from '@/lib/utils';

    const Reports = () => {
      const {
        customers,
        loans,
        checksIn,
        checksOut,
        transactions,
        refreshData,
        loading,
        settings
      } = useData();
      const [reportType, setReportType] = useState('customers');
      const [filters, setFilters] = useState({});
      const [results, setResults] = useState([]);
      const [voidingFee, setVoidingFee] = useState(null);
      const printComponentRef = useRef(null);
      
      const reportHeaders = useMemo(() => {
        switch (reportType) {
            case 'customers': return ['account_number', 'first_name', 'last_name', 'balance', 'phone_number'];
            case 'loans': return ['customer', 'amount', 'due_date', 'status'];
            case 'checks_in': return ['customer', 'check_number', 'amount', 'date', 'status'];
            case 'checks_out': return ['customer', 'check_number', 'pay_to_order_of', 'amount', 'date', 'status'];
            case 'fees': return ['date', 'amount', 'customerName', 'fromAccount', 'checkNumber', 'reason', 'status'];
            default: return [];
        }
      }, [reportType]);

      const handlePrint = useReactToPrint({
        content: () => printComponentRef.current,
        documentTitle: `${reportType.replace(/_/g, ' ')} Report - ${new Date().toLocaleDateString()}`
      });
      
      const feeTransactions = useMemo(() => {
        if (!transactions || !customers) return [];
        
        return transactions
            .filter(tx => tx.type === 'fee' || tx.id.startsWith('DONATION-'))
            .map(tx => {
                const customer = customers.find(c => c.account_number === (tx.fee_details?.from_account || tx.account_number));
                let reason = tx.memo || 'N/A';
                let checkNumber = 'N/A';
                
                // Extract check number from memo or fee details
                if (tx.memo) {
                    const checkMatch = tx.memo.match(/check #(\w+)/i);
                    if (checkMatch) {
                        checkNumber = checkMatch[1];
                    }
                }
                
                if (tx.fee_details?.reason) {
                    reason = tx.fee_details.reason;
                    // Also try to extract check number from fee details reason
                    const checkMatch = tx.fee_details.reason.match(/check #(\w+)/i);
                    if (checkMatch) {
                        checkNumber = checkMatch[1];
                    }
                }
                
                if (tx.id.startsWith('DONATION-')) {
                    reason = `Donation from ${customer ? customer.first_name + ' ' + customer.last_name : 'N/A'}`;
                }

                return {
                    ...tx,
                    customerName: customer ? `${customer.first_name} ${customer.last_name}` : 'System/Fee Account',
                    fromAccount: tx.fee_details?.from_account || tx.account_number || 'N/A',
                    checkNumber: checkNumber,
                    reason: reason
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date, newest first
      }, [transactions, customers]);

      const generateReport = useCallback(() => {
        let data = [];
        switch (reportType) {
          case 'customers':
            data = customers.filter(c => c.account_number !== 'FEES');
            if (filters.minBalance) data = data.filter(c => parseFloat(c.balance) >= parseFloat(filters.minBalance));
            if (filters.maxBalance) data = data.filter(c => parseFloat(c.balance) <= parseFloat(filters.maxBalance));
            break;
          case 'loans':
            data = (loans || []).map(l => ({
              ...l,
              customer: customers.find(c => c.id === l.customer_id)?.first_name + ' ' + customers.find(c => c.id === l.customer_id)?.last_name
            })).filter(l => l.customer);
            if (filters.loanStatus) data = data.filter(l => l.status === filters.loanStatus);
            if (filters.minLoanAmount) data = data.filter(l => parseFloat(l.amount) >= parseFloat(filters.minLoanAmount));
            break;
          case 'checks_in':
            data = (checksIn || []).map(c => ({
              ...c,
              customer: customers.find(cust => cust.account_number === c.account_number)?.first_name + ' ' + customers.find(cust => cust.account_number === c.account_number)?.last_name
            })).filter(c => c.customer);
            if (filters.checkInStatus) data = data.filter(c => c.status === filters.checkInStatus);
            break;
          case 'checks_out':
            data = (checksOut || []).map(c => ({
              ...c,
              customer: customers.find(cust => cust.account_number === c.account_number)?.first_name + ' ' + customers.find(cust => cust.account_number === c.account_number)?.last_name
            })).filter(c => c.customer);
            if (filters.checkOutStatus) data = data.filter(c => c.status === filters.checkOutStatus);
            break;
          case 'fees':
            data = feeTransactions;
            if (filters.feeStartDate) {
                const startDate = new Date(filters.feeStartDate);
                data = data.filter(tx => new Date(tx.date) >= startDate);
            }
            if (filters.feeEndDate) {
              const endDate = new Date(filters.feeEndDate);
              endDate.setHours(23, 59, 59, 999);
              data = data.filter(tx => new Date(tx.date) <= endDate);
            }
            break;
          default:
            data = [];
        }
        setResults(data);
      }, [reportType, filters, customers, loans, checksIn, checksOut, feeTransactions]);
      
      useEffect(() => {
        generateReport();
      }, [reportType, filters, generateReport]);
      
      const handleVoidFee = async () => {
        if (!voidingFee) return;
        try {
          const { error } = await supabase.rpc('void_transaction', { p_transaction_id: voidingFee.id });
          if (error) throw error;
          toast({
            title: "Success",
            description: "Fee has been voided and balances adjusted."
          });
          refreshData();
        } catch (error) {
          toast({
            title: "Error Voiding Fee",
            description: error.message,
            variant: "destructive"
          });
        } finally {
          setVoidingFee(null);
        }
      };

      const exportToCSV = () => {
        if (results.length === 0) {
            toast({ title: 'No Data', description: 'No data to export.', variant: 'destructive'});
            return;
        };
        
        const formattedHeaders = reportHeaders.map(h => h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
        
        const rows = results.map(row => {
          return reportHeaders.map(header => {
            let value = row[header];
            if(header === 'customer') {
                value = row.customer || "N/A";
            }
            if(header === 'fromAccount') {
                value = row.fromAccount || "N/A";
            }
            if(header === 'checkNumber') {
                value = row.checkNumber || "N/A";
            }
            const stringValue = String(value === null || value === undefined ? '' : value);
            return stringValue.includes(',') ? `"${stringValue}"` : stringValue;
          }).join(',');
        });

        const csv = [formattedHeaders.join(','), ...rows].join('\n');
        const blob = new Blob([csv], {
          type: 'text/csv;charset=utf-8;'
        });
        saveAs(blob, `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
      };

      const renderFilters = () => {
        switch (reportType) {
          case 'customers':
            return <>
                <Input type="number" placeholder="Min Balance" onChange={e => setFilters({ ...filters, minBalance: e.target.value })} className="bg-background"/>
                <Input type="number" placeholder="Max Balance" onChange={e => setFilters({ ...filters, maxBalance: e.target.value })} className="bg-background"/>
              </>;
          case 'loans':
            return <>
                <select onChange={e => setFilters({ ...filters, loanStatus: e.target.value })} className="w-full p-2 bg-background border border-border rounded-lg text-foreground h-10">
                  <option value="">Any Status</option>
                  <option value="active">Active</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </select>
                <Input type="number" placeholder="Min Loan Amount" onChange={e => setFilters({ ...filters, minLoanAmount: e.target.value })} className="bg-background" />
              </>;
          case 'checks_in':
            return <select onChange={e => setFilters({ ...filters, checkInStatus: e.target.value })} className="w-full p-2 bg-background border border-border rounded-lg text-foreground h-10">
                <option value="">Any Status</option>
                <option value="pending">Pending</option>
                <option value="deposited">Deposited</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced</option>
              </select>;
          case 'checks_out':
            return <select onChange={e => setFilters({ ...filters, checkOutStatus: e.target.value })} className="w-full p-2 bg-background border border-border rounded-lg text-foreground h-10">
                <option value="">Any Status</option>
                <option value="pending">Pending</option>
                <option value="printed">Printed</option>
                <option value="deposited">Deposited</option>
              </select>;
          case 'fees':
            return <>
                <Input type="date" placeholder="Start Date" onChange={e => setFilters({ ...filters, feeStartDate: e.target.value })} className="bg-background" />
                <Input type="date" placeholder="End Date" onChange={e => setFilters({ ...filters, feeEndDate: e.target.value })} className="bg-background" />
                </>;
          default:
            return null;
        }
      };

      const renderResults = () => {
        if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        if (results.length === 0) return <p className="text-muted-foreground text-center py-10">No results to display. Choose a report type and apply filters.</p>;
        
        return <div className="overflow-x-auto">
            <table className="w-full print-table">
              <thead>
                <tr>
                  {reportHeaders.map(h => <th key={h} className="px-6 py-4 text-left text-sm font-medium text-muted-foreground capitalize">{h.replace(/_/g, ' ')}</th>)}
                  {reportType === 'fees' && <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground no-print">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((row, index) => {
                    const statusClass = cn({
                        'text-red-400': row.status === 'bounced' || row.status === 'overdue',
                        'text-yellow-400': row.status === 'pending' || row.status === 'hold',
                        'text-slate-400': row.status === 'voided',
                        'line-through opacity-50': row.status === 'voided',
                    });

                    return (<tr key={row.id || index} className={statusClass}>
                        {reportHeaders.map(h => {
                            let value = row[h];
                            if (h === 'customer') {
                                value = row.customer || "N/A";
                            }
                            if (h === 'fromAccount') {
                                value = row.fromAccount || "N/A";
                            }
                            if (h === 'checkNumber') {
                                value = row.checkNumber || "N/A";
                            }
                            if (h === 'balance' || (h === 'amount' && typeof value === 'number')) {
                                value = `$${parseFloat(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                            }
                            if (h === 'date' && value) {
                                value = new Date(value).toLocaleDateString();
                            }
                            return <td key={h} className="px-6 py-4">{String(value ?? '')}</td>
                        })}
                        {reportType === 'fees' && <td className="px-6 py-4 text-right no-print">
                                {row.status !== 'voided' && <Button variant="destructive" size="sm" onClick={() => setVoidingFee(row)}>
                                        <RotateCcw className="h-4 w-4" />
                                    </Button>}
                            </td>}
                    </tr>)
                })}
              </tbody>
            </table>
          </div>;
      };

      const renderPrintableContent = () => (
         <div className="hidden">
            <div ref={printComponentRef}>
              <Statement 
                title={`${reportType.replace(/_/g, ' ')} Report`}
                transactions={results.map(r => ({...r, customer: customers.find(c => c.account_number === r.account_number)}))}
                settings={settings}
                filters={filters}
              />
            </div>
        </div>
      );

      return <div className="space-y-6 p-4">
          <div className="flex items-center gap-4">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Custom Reports</h1>
              <p className="text-muted-foreground">Create and export custom reports for various data types.</p>
            </div>
          </div>

          <motion.div className="bg-card/50 border border-border rounded-xl p-6 space-y-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-lg font-bold flex items-center gap-2"><Filter className="h-5 w-5" /> Report Builder</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <select value={reportType} onChange={e => { setReportType(e.target.value); setFilters({}); setResults([]); }} className="w-full p-2 bg-input border-border rounded-lg text-foreground h-10">
                <option value="customers">Customers</option>
                <option value="loans">Loans</option>
                <option value="checks_in">Checks In</option>
                <option value="checks_out">Checks Out</option>
                <option value="fees">Fee Ledger</option>
              </select>
              {renderFilters()}
            </div>
          </motion.div>

          <motion.div className="bg-card/50 border border-border rounded-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div className="p-6 flex justify-between items-center border-b border-border">
              <h2 className="text-xl font-bold capitalize">{reportType.replace(/_/g, ' ')} Report Results</h2>
              <div className="flex gap-2 no-print">
                <Button variant="outline" onClick={handlePrint} disabled={results.length === 0}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" onClick={exportToCSV} disabled={results.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
            <div className="printable-content p-4">
              {renderResults()}
            </div>
          </motion.div>
          
          {renderPrintableContent()}

          <AlertDialog open={!!voidingFee} onOpenChange={open => !open && setVoidingFee(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Void Fee</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to void this fee? The amount will be credited back to the customer's account (if applicable). This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleVoidFee} className="bg-red-600 hover:bg-red-700">Confirm Void</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>;
    };
    export default Reports;
  