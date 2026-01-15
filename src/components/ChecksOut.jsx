
    
import React, { useState, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from '@/lib/customSupabaseClient';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import UnprintedChecksTable from '@/components/checks-out/UnprintedChecksTable';
import CheckHistoryTable from '@/components/checks-out/CheckHistoryTable';
import CheckDocument from '@/components/CheckDocument';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileDown, Search } from 'lucide-react';
import { useEffect } from 'react';

const ChecksOut = () => {
    const { checksOut, customers, settings, refreshData } = useData();
    const { toast } = useToast();
    
    // Force refresh data when component mounts to ensure we have latest check data
    useEffect(() => {
        refreshData();
    }, []);
    
    const [unprintedSearchTerm, setUnprintedSearchTerm] = useState('');
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [selectedChecks, setSelectedChecks] = useState(new Set());
    const [isPrinting, setIsPrinting] = useState(false);
    const [isVoiding, setIsVoiding] = useState(false);
    const [voidingId, setVoidingId] = useState(null);
    const [reprintDialogOpen, setReprintDialogOpen] = useState(false);
    const [checkToReprint, setCheckToReprint] = useState(null);
    
    const componentToPrintRef = useRef();

    const unprintedChecks = useMemo(() => {
        const customerMap = new Map(customers.map(c => [c.account_number, `${c.first_name} ${c.last_name}`]));
        return checksOut
            .filter(c => !c.is_printed && c.status !== 'voided')
            .map(c => ({ ...c, customer_name: customerMap.get(c.account_number) || 'N/A' }))
            .filter(c =>
                c.customer_name.toLowerCase().includes(unprintedSearchTerm.toLowerCase()) ||
                c.pay_to_order_of.toLowerCase().includes(unprintedSearchTerm.toLowerCase()) ||
                c.check_number.toString().includes(unprintedSearchTerm)
            );
    }, [checksOut, customers, unprintedSearchTerm]);

    const checkHistory = useMemo(() => {
        const customerMap = new Map(customers.map(c => [c.account_number, `${c.first_name} ${c.last_name}`]));
        return checksOut
            .filter(c => c.is_printed || c.status === 'voided')
            .map(c => ({ ...c, customer_name: customerMap.get(c.account_number) || 'N/A' }))
             .filter(c =>
                c.customer_name.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
                c.pay_to_order_of.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
                c.check_number.toString().includes(historySearchTerm)
            )
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [checksOut, customers, historySearchTerm]);

    const handleSelectCheck = (id) => {
        setSelectedChecks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedChecks.size === unprintedChecks.length) {
            setSelectedChecks(new Set());
        } else {
            setSelectedChecks(new Set(unprintedChecks.map(c => c.id)));
        }
    };

    const applyReprintFee = async (check) => {
        const reprintFeeSettings = settings?.transaction_fees?.check_reprint;
        if (!reprintFeeSettings?.enabled) {
            return true;
        }

        const feeAmount = reprintFeeSettings.fee || 0;
        if (feeAmount <= 0) {
            return true;
        }

        try {
            const feeTxId = `FEE-REPRINT-${Date.now()}`;
            const checkNum = check.check_number || 'N/A';
            const customer = customers.find(c => c.account_number === check.account_number);
            const customerName = customer ? `${customer.first_name} ${customer.last_name}` : check.account_number;
            const reprintMemo = `Reprint fee for check #${checkNum} - ${customerName}`;
            
            console.log(`Debug - Creating reprint fee transaction: ${feeTxId} for $${feeAmount}`);
            const { error: feeError } = await supabase.from('transactions').insert({
                id: feeTxId,
                account_number: check.account_number,
                type: 'fee',
                amount: feeAmount,
                date: new Date().toISOString(),
                status: 'completed',
                memo: reprintMemo,
                fee_details: {
                    reason: reprintMemo,
                    from_account: check.account_number,
                    from_customer: customerName,
                    check_number: checkNum,
                    fee_type: 'reprint',
                    payee: check.pay_to_order_of || null,
                    check_amount: check.amount || null,
                    timestamp: new Date().toISOString()
                }
            });

            if (feeError) throw feeError;

            console.log(`Debug - Deducting reprint fee of $${feeAmount} from customer ${check.account_number}`);
            const { error: customerUpdateError } = await supabase.rpc('execute_sql', {
                sql: `UPDATE customers SET balance = balance - ${feeAmount} WHERE account_number = '${check.account_number}';`
            });

            if (customerUpdateError) throw customerUpdateError;
            
            console.log(`Debug - Adding reprint fee of $${feeAmount} to FEES account`);
            const { error: feeAccountError } = await supabase.rpc('execute_sql', {
                sql: `UPDATE customers SET balance = balance + ${feeAmount} WHERE account_number = 'FEES';`
            });

            if(feeAccountError) throw feeAccountError;

            console.log(`Debug - Successfully added reprint fee of $${feeAmount} to FEES account`);
            toast({ title: "Reprint Fee Applied", description: `A fee of $${feeAmount.toFixed(2)} has been charged to ${customerName}.` });
            return true;
        } catch (error) {
            console.error("Error applying reprint fee:", error);
            toast({
                title: "Fee Application Failed",
                description: error.message,
                variant: "destructive"
            });
            return false;
        }
    };

    const handleReprintConfirm = async (applyFee) => {
        if (!checkToReprint) return;

        if (applyFee) {
            const feeApplied = await applyReprintFee(checkToReprint);
            if (!feeApplied) {
                setReprintDialogOpen(false);
                setCheckToReprint(null);
                return; // Stop if fee application fails
            }
        }

        try {
            const { error } = await supabase
                .from('checks_out')
                .update({ is_printed: false })
                .eq('id', checkToReprint.id);

            if (error) throw error;

            toast({ title: 'Check Sent to Unprinted List', description: `Check #${checkToReprint.check_number} is ready to be printed again.` });
            refreshData();
        } catch (error) {
            toast({ title: 'Reprint Failed', description: error.message, variant: 'destructive' });
        } finally {
            setReprintDialogOpen(false);
            setCheckToReprint(null);
        }
    };

    const handleReprint = (check) => {
        setCheckToReprint(check);
        const reprintFeeSettings = settings?.transaction_fees?.check_reprint;
        if (reprintFeeSettings?.enabled && reprintFeeSettings.fee > 0) {
            setReprintDialogOpen(true);
        } else {
            handleReprintConfirm(false); // No fee, just proceed
        }
    };
    
    const handlePrintSuccess = async (printedCheckIds) => {
        const { error: updateError } = await supabase
            .from('checks_out')
            .update({ is_printed: true, status: 'printed' })
            .in('id', printedCheckIds);

        if (updateError) {
            toast({ title: "Error updating checks", description: updateError.message, variant: "destructive" });
        } else {
            toast({ title: "Checks Printed", description: `${printedCheckIds.length} checks have been marked as printed.` });
            setSelectedChecks(new Set());
        }

        const { error: inventoryError } = await supabase.rpc('decrement_check_inventory', {
            p_checks_printed_count: printedCheckIds.length
        });

        if (inventoryError) {
            toast({ title: "Inventory Error", description: `Failed to update check paper inventory: ${inventoryError.message}`, variant: "destructive" });
        }

        refreshData();
        setIsPrinting(false);
    };
    
    const handlePrint = useReactToPrint({
        content: () => componentToPrintRef.current,
        onBeforePrint: async () => {
            // Force one final data refresh right before printing
            await refreshData();
            return Promise.resolve();
        },
        onAfterPrint: () => {
            const printedIds = Array.from(selectedChecks);
            if (printedIds.length > 0) {
               handlePrintSuccess(printedIds);
            } else {
               setIsPrinting(false);
            }
        },
        onPrintError: () => {
            toast({ title: 'Print Error', description: 'There was an error generating the print document.', variant: 'destructive' });
            setIsPrinting(false);
        },
    });
    
    const triggerPrint = async () => {
        if (selectedChecks.size > 0) {
            setIsPrinting(true);
            
            // First refresh data to ensure we have latest from database
            await refreshData();
            
            // Wait for state update and component re-render
            setTimeout(() => {
                // Validate we have payee data before printing
                const checksToValidate = unprintedChecks.filter(c => selectedChecks.has(c.id));
                const hasAllPayeeData = checksToValidate.every(check => 
                    check.pay_to_order_of && check.pay_to_order_of.trim() !== ''
                );
                
                console.log('Print validation:', {
                    checksToValidate: checksToValidate.length,
                    hasAllPayeeData,
                    payeeData: checksToValidate.map(c => ({ id: c.id, payee: c.pay_to_order_of }))
                });
                
                if (!hasAllPayeeData) {
                    toast({ 
                        title: 'Missing Data', 
                        description: 'Some checks are missing payee information. Please refresh and try again.', 
                        variant: 'destructive' 
                    });
                    setIsPrinting(false);
                    return;
                }
                
                // Proceed with print
                handlePrint();
            }, 500);
        }
    };

    const handleVoid = async (checkId, transactionId) => {
        setIsVoiding(true);
        setVoidingId(checkId);
        try {
            const { error } = await supabase.rpc('void_transaction', { p_transaction_id: transactionId });
            if (error) throw error;
            toast({ title: "Check Voided", description: "The check and related transaction have been voided." });
            refreshData();
        } catch (error) {
            toast({ title: "Voiding Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsVoiding(false);
            setVoidingId(null);
        }
    };

    const checksToPrint = unprintedChecks.filter(c => selectedChecks.has(c.id));
    
    // Debug: Log the actual check data being sent to print with detailed payee info
    console.log('Debug - checksToPrint data:', checksToPrint);
    console.log('Debug - checksToPrint pay_to_order_of values:', checksToPrint.map(c => ({ 
        id: c.id, 
        check_number: c.check_number, 
        pay_to_order_of: c.pay_to_order_of,
        amount: c.amount,
        account_number: c.account_number
    })));
    
    // Debug: Also log the raw checksOut data to see if issue is in filtering
    console.log('Debug - Raw checksOut data for selected checks:', 
        checksOut.filter(c => selectedChecks.has(c.id)).map(c => ({ 
            id: c.id, 
            check_number: c.check_number, 
            pay_to_order_of: c.pay_to_order_of,
            amount: c.amount 
        }))
    );

    const reprintFeeAmount = settings?.transaction_fees?.check_reprint?.fee;

    return (
        <div className="space-y-6">
            {isPrinting && checksToPrint.length > 0 && (
                <div className="print-component" style={{ 
                    background: 'white', 
                    color: 'black', 
                    position: 'fixed', 
                    top: '-9999px', 
                    left: '-9999px',
                    width: '8.5in',
                    zIndex: 9999
                }}>
                    {/* Always render CheckDocument - it handles missing data internally */}
                    <CheckDocument ref={componentToPrintRef} checks={checksToPrint} config={settings.check_config} />
                </div>
            )}
            
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-foreground">Checks Out</h1>
                <p className="text-sm text-muted-foreground">Manage, print, and track outgoing checks.</p>
              </div>
            </div>

            <Tabs defaultValue="unprinted">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="unprinted">Unprinted Checks</TabsTrigger>
                    <TabsTrigger value="history">Check History</TabsTrigger>
                </TabsList>
                <TabsContent value="unprinted">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Ready to Print</CardTitle>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    placeholder="Search..."
                                    value={unprintedSearchTerm}
                                    onChange={(e) => setUnprintedSearchTerm(e.target.value)}
                                    className="pl-10 w-48 h-9"
                                  />
                                </div>
                                <Button onClick={triggerPrint} disabled={selectedChecks.size === 0 || isPrinting} size="sm">
                                  {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                  {isPrinting ? `Generating...` : `Print (${selectedChecks.size})`}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <UnprintedChecksTable
                                checks={unprintedChecks}
                                selectedChecks={selectedChecks}
                                onSelectCheck={handleSelectCheck}
                                onSelectAll={handleSelectAll}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="history">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Printed & Voided Checks</CardTitle>
                             <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    placeholder="Search history..."
                                    value={historySearchTerm}
                                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                                    className="pl-10 w-48 h-9"
                                  />
                                </div>
                        </CardHeader>
                        <CardContent>
                            <CheckHistoryTable
                                checks={checkHistory}
                                onVoid={handleVoid}
                                onReprint={handleReprint}
                                isVoiding={isVoiding}
                                voidingId={voidingId}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
            <AlertDialog open={reprintDialogOpen} onOpenChange={setReprintDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Apply Reprint Fee?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A reprint fee of ${reprintFeeAmount?.toFixed(2) || '0.00'} will be charged to the customer's account. Do you want to proceed?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => handleReprintConfirm(false)}>No, Just Reprint</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleReprintConfirm(true)}>Yes, Apply Fee & Reprint</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ChecksOut;

  