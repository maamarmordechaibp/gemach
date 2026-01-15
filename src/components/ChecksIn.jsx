
    import React, { useState, useMemo } from 'react';
    import { motion } from 'framer-motion';
    import { Clock, CheckCircle, XCircle, AlertTriangle, Search, Banknote, Inbox, Loader2, ShieldCheck, Lock } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { toast } from '@/components/ui/use-toast';
    import { useData } from '@/contexts/DataContext';
    import { supabase } from '@/lib/customSupabaseClient';
    import { cn } from '@/lib/utils';
    import BulkDepositModal from '@/components/BulkDepositModal';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import ChecksOnHold from '@/components/checks-in/ChecksOnHold';
    import {
      AlertDialog,
      AlertDialogAction,
      AlertDialogCancel,
      AlertDialogContent,
      AlertDialogDescription,
      AlertDialogFooter,
      AlertDialogHeader,
      AlertDialogTitle,
    } from "@/components/ui/alert-dialog"

    const ChecksIn = () => {
      const { checksIn, customers, refreshData, settings } = useData();
      const [bounceCheck, setBounceCheck] = useState(null);
      const [bounceFee, setBounceFee] = useState('');
      const [searchTerm, setSearchTerm] = useState('');
      const [isBulkDepositOpen, setIsBulkDepositOpen] = useState(false);

      const feeSettings = useMemo(() => settings?.transaction_fees?.bounced_check || {}, [settings]);

      const handleStatusChange = async (checkId, newStatus) => {
        try {
          const { error } = await supabase.from('checks_in').update({ status: newStatus }).eq('id', checkId);
          if (error) throw error;
          toast({ title: "Success", description: `Check status updated to ${newStatus}.` });
          refreshData();
        } catch (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }
      };

      const openBounceDialog = (check) => {
        const defaultFee = feeSettings.enabled ? feeSettings.fee : '0';
        setBounceFee(defaultFee);
        setBounceCheck(check);
      }

      const handleBounceConfirm = async () => {
        if (!bounceCheck || !customers) return;
        const fee = parseFloat(bounceFee) || 0;
        const customer = customers.find(c => c.account_number === bounceCheck.account_number);

        if (!customer) {
            toast({ title: "Error", description: "Customer not found.", variant: "destructive" });
            return;
        }

        try {
          const balanceAdjustment = parseFloat(bounceCheck.amount) + fee;
          const newBalance = parseFloat(customer.balance) - balanceAdjustment;

          await supabase.from('customers').update({ balance: newBalance }).eq('id', customer.id);
          
          const { error: checkError } = await supabase.from('checks_in').update({ status: 'bounced' }).eq('id', bounceCheck.id);
          if (checkError) throw checkError;

          // Mark the original transaction as bounced
          if (bounceCheck.transaction_id) {
            const { error: txError } = await supabase.from('transactions').update({ status: 'bounced' }).eq('id', bounceCheck.transaction_id);
            if (txError) throw txError;
          }

          // Create a debit transaction for the bounced check reversal
          const bounceTxId = `BOUNCE-REVERSAL-${Date.now()}`;
          const checkNum = bounceCheck.check_number || 'N/A';
          const bounceAmount = parseFloat(bounceCheck.amount);
          const bounceMemo = `Bounced Check Reversal #${checkNum} - ${customer.first_name} ${customer.last_name}`;
          
          console.log(`Debug - Creating bounced check reversal transaction: ${bounceTxId} for $${bounceAmount}`);
          const { error: bounceDebitError } = await supabase.from('transactions').insert({
              id: bounceTxId,
              account_number: customer.account_number,
              type: 'debit',
              amount: bounceAmount,
              date: new Date().toISOString(),
              status: 'completed',
              memo: bounceMemo,
              debit_details: {
                  reversal_type: 'bounced_check',
                  check_number: checkNum,
                  customer_name: `${customer.first_name} ${customer.last_name}`,
                  original_transaction_id: bounceCheck.transaction_id || null,
                  original_check_id: bounceCheck.id,
                  timestamp: new Date().toISOString()
              }
          });
          
          if (bounceDebitError) {
              console.error('Error creating bounced check reversal transaction:', bounceDebitError);
              throw bounceDebitError;
          }
          
          console.log(`Debug - Created bounced check reversal transaction for $${bounceAmount}`);

          // Create the bounced check fee transaction
          if (fee > 0) {
            const feeTxId = `FEE-BOUNCE-${Date.now()}`;
            const feeMemo = `Bounced check fee for check #${checkNum} from ${customer.first_name} ${customer.last_name}`;
            console.log(`Debug - Creating bounced check fee transaction: ${feeTxId} for $${fee}`);
            const { error: feeError } = await supabase.from('transactions').insert({
                id: feeTxId,
                account_number: customer.account_number,
                type: 'fee',
                amount: fee,
                date: new Date().toISOString(),
                status: 'completed',
                memo: feeMemo,
                fee_details: { 
                    reason: feeMemo, 
                    from_account: customer.account_number, 
                    from_customer: `${customer.first_name} ${customer.last_name}`,
                    check_number: checkNum,
                    fee_type: 'bounced_check',
                    check_amount: bounceCheck.amount || null,
                    original_transaction_id: bounceCheck.transaction_id || null,
                    timestamp: new Date().toISOString()
                }
            });
            if (feeError) throw feeError;

            // Add the fee to the FEES account
            console.log(`Debug - Adding bounced check fee of $${fee} to FEES account`);
            const { error: feeAccountError } = await supabase.rpc('execute_sql', {
                sql: `UPDATE customers SET balance = balance + ${fee} WHERE account_number = 'FEES';`
            });
            if (feeAccountError) {
                console.error('Error updating FEES account:', feeAccountError);
                throw new Error('Failed to add fee to FEES account');
            }
            console.log(`Debug - Successfully added $${fee} to FEES account for bounced check`);
          }

          toast({ title: "Success", description: "Check bounced and balance adjusted." });
          refreshData();
        } catch (error) {
           toast({ title: "Error Bouncing Check", description: error.message, variant: "destructive" });
        } finally {
            setBounceCheck(null);
            setBounceFee('');
        }
      };

      const getCustomerName = (accountNumber) => {
        if (!customers) return '...';
        const customer = customers.find(c => c.account_number === accountNumber);
        return customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown';
      };

      const regularChecks = useMemo(() => {
        if (!checksIn || !customers) return [];
        let sortedChecks = [...checksIn].filter(c => !c.is_on_hold).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!searchTerm) return sortedChecks;
        return sortedChecks.filter(check => 
          (check.check_number || 'N/A').toLowerCase().includes(searchTerm.toLowerCase()) ||
          getCustomerName(check.account_number).toLowerCase().includes(searchTerm.toLowerCase())
        );
      }, [searchTerm, checksIn, customers]);

      const statusConfig = {
        pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-900/20 hover:bg-yellow-900/30 border-l-4 border-yellow-400' },
        deposited: { icon: Inbox, color: 'text-blue-400', bg: 'bg-blue-900/20 hover:bg-blue-900/30 border-l-4 border-blue-400' },
        cleared: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20 hover:bg-green-900/30 border-l-4 border-green-400' },
        bounced: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/20 hover:bg-red-900/30 border-l-4 border-red-400' },
        voided: { icon: XCircle, color: 'text-slate-500', bg: 'bg-slate-800/20 hover:bg-slate-800/30 border-l-4 border-slate-500' },
        hold: { icon: ShieldCheck, color: 'text-orange-400', bg: 'bg-orange-900/20 hover:bg-orange-900/30 border-l-4 border-orange-400' },
      };

      if (!checksIn || !customers) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
      }

      return (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Incoming Checks</h1>
              <p className="text-slate-400 mt-1">Manage and track deposited checks.</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by Check # or Customer"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-64 pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground"
                    />
                </div>
                <Button onClick={() => setIsBulkDepositOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Banknote className="mr-2 h-4 w-4" /> Bulk Deposit
                </Button>
            </div>
          </div>
          <Tabs defaultValue="regularChecks" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="regularChecks">All Checks</TabsTrigger>
              <TabsTrigger value="onHold"><Lock className="mr-2 h-4 w-4"/>Checks on Hold</TabsTrigger>
            </TabsList>
            <TabsContent value="regularChecks">
              <motion.div
                className="bg-card backdrop-blur-xl border border-border rounded-xl overflow-hidden mt-4"
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Customer</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Check #</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Amount</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                        <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {regularChecks.length > 0 ? regularChecks.map((check) => {
                        const isBounced = check.status === 'bounced';
                        const config = statusConfig[check.status] || statusConfig.pending;
                        const Icon = config.icon;
                        return (
                        <motion.tr key={check.id} className={cn('transition-colors', config.bg)}>
                          <td className="px-6 py-4 text-muted-foreground">{new Date(check.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-foreground">{getCustomerName(check.account_number)} ({check.account_number})</td>
                          <td className="px-6 py-4 text-foreground font-medium">{check.check_number || 'N/A'}</td>
                          <td className={`px-6 py-4 font-bold ${isBounced ? 'text-red-400' : 'text-green-400'}`}>
                            {isBounced ? '-' : ''}${parseFloat(check.amount).toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2">
                              <Icon className={`h-4 w-4 ${config.color}`} />
                              <span className={`capitalize font-medium ${config.color}`}>{check.status}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {check.status === 'pending' && (
                                <>
                                  <Button size="sm" onClick={() => handleStatusChange(check.id, 'deposited')} className="bg-blue-600 hover:bg-blue-700 text-white">Deposit</Button>
                                  <Button size="sm" onClick={() => handleStatusChange(check.id, 'cleared')} className="bg-green-600 hover:bg-green-700 text-white">Clear</Button>
                                  <Button size="sm" variant="destructive" onClick={() => openBounceDialog(check)}>Bounce</Button>
                                </>
                              )}
                              {(check.status === 'deposited' || check.status === 'hold') && (
                                <>
                                  <Button size="sm" onClick={() => handleStatusChange(check.id, 'cleared')} className="bg-green-600 hover:bg-green-700 text-white">Clear</Button>
                                  <Button size="sm" variant="destructive" onClick={() => openBounceDialog(check)}>Bounce</Button>
                                </>
                              )}
                               {check.status !== 'voided' && check.status !== 'bounced' && (
                                 <Button size="sm" variant="ghost" onClick={() => handleStatusChange(check.id, 'voided')}>Void</Button>
                               )}
                            </div>
                          </td>
                        </motion.tr>
                      )}) : (
                        <tr>
                          <td colSpan="6" className="text-center py-12 text-muted-foreground">No incoming checks found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </TabsContent>
            <TabsContent value="onHold">
                <ChecksOnHold/>
            </TabsContent>
          </Tabs>

           <AlertDialog open={!!bounceCheck} onOpenChange={(open) => !open && setBounceCheck(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-yellow-400" />Confirm Bounced Check</AlertDialogTitle>
                <AlertDialogDescription>
                  Marking this check as bounced will deduct the amount and any fee from the customer's balance.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                 <label htmlFor="bounce-fee" className="text-sm font-medium text-muted-foreground">Bounce Fee ($)</label>
                 <input
                    id="bounce-fee"
                    type="number"
                    value={bounceFee}
                    onChange={(e) => setBounceFee(e.target.value)}
                    placeholder="0.00"
                    className="mt-2 w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground"
                 />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setBounceCheck(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleBounceConfirm} className="bg-red-600 hover:bg-red-700">Confirm Bounce</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <BulkDepositModal
            isOpen={isBulkDepositOpen}
            onClose={() => setIsBulkDepositOpen(false)}
            checks={checksIn ? checksIn.filter(c => c.status === 'pending') : []}
            customers={customers}
            onBulkUpdate={refreshData}
          />
        </div>
      );
    };

    export default ChecksIn;
  