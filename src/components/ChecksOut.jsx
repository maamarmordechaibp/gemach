
    
import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import UnprintedChecksTable from '@/components/checks-out/UnprintedChecksTable';
import CheckHistoryTable from '@/components/checks-out/CheckHistoryTable';
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

    const unprintedChecks = useMemo(() => {
        const customerMap = new Map(customers.map(c => [c.account_number, `${c.first_name} ${c.last_name}`]));
        return checksOut
            .filter(c => !c.is_printed && c.status !== 'voided')
            .map(c => ({ ...c, customer_name: customerMap.get(c.account_number) || 'N/A' }))
            .filter(c =>
                c.customer_name.toLowerCase().includes(unprintedSearchTerm.toLowerCase()) ||
                (c.pay_to_order_of || '').toLowerCase().includes(unprintedSearchTerm.toLowerCase()) ||
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
                (c.pay_to_order_of || '').toLowerCase().includes(historySearchTerm.toLowerCase()) ||
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

            const { error: customerUpdateError } = await supabase.rpc('execute_sql', {
                sql: `UPDATE customers SET balance = balance - ${feeAmount} WHERE account_number = '${check.account_number}';`
            });

            if (customerUpdateError) throw customerUpdateError;
            
            const { error: feeAccountError } = await supabase.rpc('execute_sql', {
                sql: `UPDATE customers SET balance = balance + ${feeAmount} WHERE account_number = 'FEES';`
            });

            if(feeAccountError) throw feeAccountError;

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

    // Number to words helper
    const numberToWords = (numStr) => {
        const num = parseFloat(numStr);
        if (isNaN(num)) return '';
        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
            'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
            'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        function convertGroup(n) {
            let result = '';
            if (n >= 100) { result += ones[Math.floor(n / 100)] + ' hundred '; n %= 100; }
            if (n >= 20) { result += tens[Math.floor(n / 10)]; if (n % 10 > 0) result += '-' + ones[n % 10]; }
            else if (n > 0) { result += ones[n]; }
            return result.trim();
        }
        let dollars = Math.floor(num);
        let cents = Math.round((num - dollars) * 100);
        let result = '';
        if (dollars >= 1000000) { result += convertGroup(Math.floor(dollars / 1000000)) + ' million '; dollars %= 1000000; }
        if (dollars >= 1000) { result += convertGroup(Math.floor(dollars / 1000)) + ' thousand '; dollars %= 1000; }
        if (dollars > 0) { result += convertGroup(dollars); }
        if (result === '') result = 'zero';
        result += ' and ' + cents.toString().padStart(2, '0') + '/100';
        return result.charAt(0).toUpperCase() + result.slice(1);
    };

    // Build check HTML for a single check
    const buildCheckHtml = (checkData) => {
        const config = settings?.check_config || {};
        const accountName = config.name || 'ACCOUNT NAME';
        const payToOrderOf = (checkData.pay_to_order_of || '').trim();
        const memoText = checkData.account_number || '';
        const amount = parseFloat(checkData.amount || 0).toFixed(2);
        const amountInWords = numberToWords(checkData.amount || 0);
        const checkNumber = String(checkData.check_number || '0000').padStart(4, '0');
        const date = new Date(checkData.date).toLocaleDateString();
        const micrRouting = config.routing_number || '123456789';
        const micrAccount = config.account_number || '1122334455';
        const micrLine = `C${micrRouting}C ${micrAccount}C ${checkNumber}C`;

        return `
            <div class="check-container">
                <div class="account-name">${accountName}</div>
                <div class="phone-number">${config.phone_number || ''}</div>
                <div class="check-number">No. ${checkNumber}</div>
                <div class="account-address">${config.address1 || ''}<br>${config.address2 || ''}</div>
                <div class="date-line">Date <span>${date}</span></div>
                <div class="payee-line">
                    <span class="payee-label">Pay to the order of</span>
                    <span class="payee-input">${payToOrderOf}</span>
                </div>
                <div class="amount-box">$${amount}</div>
                <div class="amount-words">
                    <span class="amount-text">${amountInWords}</span>
                    <span class="dollars-text">DOLLARS</span>
                </div>
                <div class="bank-info">
                    <div class="bank-name">${config.bank_name || ''}</div>
                    <div class="bank-address">${config.bank_address || ''}</div>
                </div>
                <div class="memo-signature">
                    <div class="memo">
                        <span class="memo-label">Memo</span>
                        <span class="memo-input">${memoText}</span>
                    </div>
                    <div class="signature">
                        <div class="signature-line"></div>
                        <div class="signature-label">Authorized Signature</div>
                    </div>
                </div>
                <div class="micr-line">${micrLine}</div>
            </div>`;
    };

    const triggerPrint = () => {
        if (selectedChecks.size === 0) return;
        setIsPrinting(true);

        const checksToPrint = unprintedChecks.filter(c => selectedChecks.has(c.id));
        if (checksToPrint.length === 0) {
            setIsPrinting(false);
            return;
        }

        const config = settings?.check_config || {};
        const fontUrl = config.font_url;
        const checksHtml = checksToPrint.map(c => buildCheckHtml(c)).join('');

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            toast({ title: 'Popup Blocked', description: 'Please allow popups for this site to print checks.', variant: 'destructive' });
            setIsPrinting(false);
            return;
        }

        printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Print Checks</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${fontUrl ? `@font-face { font-family: 'customCheckFont'; src: url('${fontUrl}') format('woff'); font-display: swap; }` : ''}
${fontUrl ? `@font-face { font-family: 'customMicrFont'; src: url('${fontUrl}') format('woff'); font-display: swap; }` : ''}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: white; margin: 0; padding: 0.1in 0.25in; }
.check-container { width: 8.5in; height: 3.2in; background: white; border: 1px solid #2c5f8d; padding: 0.3in 0.4in 0.2in 0.4in; position: relative; margin-bottom: 0.1in; page-break-inside: avoid; font-family: 'Roboto', Arial, sans-serif; }
.check-container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #1e4d72 0%, #2c5f8d 50%, #1e4d72 100%); }
.account-name { position: absolute; top: 0.38in; left: 0.4in; font-size: 14pt; font-weight: 700; color: #1a1a1a; letter-spacing: 0.3px; text-transform: uppercase; }
.phone-number { position: absolute; top: 0.62in; left: 0.4in; font-size: 9pt; color: #444; }
.check-number { position: absolute; top: 0.36in; right: 0.4in; text-align: right; font-size: 17pt; font-weight: 700; color: #1e4d72; letter-spacing: 1px; }
.account-address { position: absolute; top: 0.8in; left: 0.4in; font-size: 9pt; color: #444; line-height: 1.4; }
.date-line { position: absolute; top: 0.6in; right: 0.4in; text-align: right; font-size: 10pt; color: #1a1a1a; font-weight: 500; }
.date-line span { display: inline-block; min-width: 1.2in; border-bottom: 1px solid #333; padding: 0 4px 2px 4px; margin-left: 6px; }
.payee-line { position: absolute; top: 1.18in; left: 0.4in; right: 1.6in; display: flex; align-items: baseline; font-size: 11pt; }
.payee-label { font-weight: 600; color: #1a1a1a; white-space: nowrap; margin-right: 8px; font-size: 10pt; }
.payee-input { flex: 1; border-bottom: 1px solid #333; font-size: 12pt; color: #000; font-weight: 500; padding: 0 4px 3px 4px; }
.amount-box { position: absolute; top: 1.15in; right: 0.4in; width: 1.35in; height: 0.3in; display: flex; align-items: center; justify-content: flex-end; border: 2px solid #1e4d72; background: #f8f9fa; padding: 0 10px; font-size: 14pt; font-weight: 700; color: #000; font-family: 'Roboto Mono', monospace; }
.amount-words { position: absolute; top: 1.55in; left: 0.4in; right: 0.4in; font-size: 10pt; border-bottom: 1px solid #333; min-height: 0.22in; display: flex; align-items: flex-end; justify-content: space-between; padding: 0 4px 2px 4px; color: #000; }
.amount-text { flex: 1; color: #000; font-weight: 500; text-transform: capitalize; }
.dollars-text { font-weight: 700; color: #000; font-size: 10pt; margin-left: 8px; }
.bank-info { position: absolute; top: 1.85in; left: 0.4in; right: 3.5in; font-size: 10pt; color: #1a1a1a; line-height: 1.3; }
.bank-name { font-weight: 700; font-size: 11pt; color: #1e4d72; text-transform: uppercase; letter-spacing: 0.3px; }
.bank-address { font-size: 9pt; margin-top: 2px; color: #444; }
.memo-signature { position: absolute; top: 2.3in; left: 0.4in; right: 0.4in; display: grid; grid-template-columns: 2.2in 1fr; gap: 0.5in; }
.memo { display: flex; align-items: baseline; font-size: 9pt; }
.memo-label { font-weight: 600; color: #1a1a1a; margin-right: 6px; }
.memo-input { flex: 1; border-bottom: 1px solid #333; font-size: 9pt; padding: 0 4px 2px 4px; color: #000; max-width: 2in; }
.signature { display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; }
.signature-line { border-bottom: 1.5px solid #333; width: 100%; max-width: 2.8in; height: 0.3in; margin-bottom: 2px; }
.signature-label { font-size: 8pt; color: #666; text-align: right; width: 100%; max-width: 2.8in; }
.micr-line { position: absolute; bottom: 0.15in; left: 0.6in; right: 0.4in; font-family: ${fontUrl ? "'customMicrFont', " : ""}'Roboto Mono', monospace; font-size: 12pt; letter-spacing: 2px; color: #000; line-height: 1; }
@media print {
  body { background: white; margin: 0; padding: 0.1in 0.25in; }
  .check-container { box-shadow: none; border: 1px solid #2c5f8d; page-break-inside: avoid; margin-bottom: 0.1in; background: white; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head><body>${checksHtml}</body></html>`);
        printWindow.document.close();

        // Wait for fonts to load, then print
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            // After print dialog closes, mark as printed
            const printedIds = Array.from(selectedChecks);
            handlePrintSuccess(printedIds);
            setTimeout(() => printWindow.close(), 1000);
        }, 1500);
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

    const reprintFeeAmount = settings?.transaction_fees?.check_reprint?.fee;

    return (
        <div className="space-y-6">
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

  