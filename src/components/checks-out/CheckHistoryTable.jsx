
    import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const CheckHistoryTable = ({ checks, onVoid, onReprint, isVoiding, voidingId }) => {
    
    const getStatusVariant = (status) => {
        switch (status) {
            case 'printed':
                return 'default';
            case 'voided':
                return 'destructive';
            default:
                return 'secondary';
        }
    };

    return (
        <div className="rounded-md border">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Check #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Pay To</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {checks.length > 0 ? (
                    checks.map((check) => (
                        <TableRow key={check.id}>
                            <TableCell>{new Date(check.date).toLocaleDateString()}</TableCell>
                            <TableCell>{check.check_number}</TableCell>
                            <TableCell>{check.customer_name}</TableCell>
                            <TableCell>{check.pay_to_order_of}</TableCell>
                            <TableCell className="text-right">${check.amount.toFixed(2)}</TableCell>
                            <TableCell>
                                <Badge variant={getStatusVariant(check.status)}>{check.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                {check.status !== 'voided' && (
                                     <TooltipProvider>
                                     <div className="flex justify-end items-center gap-2">
                                         <Tooltip>
                                             <TooltipTrigger asChild>
                                                 <Button variant="ghost" size="icon" onClick={() => onReprint(check)}>
                                                     <RefreshCw className="h-4 w-4" />
                                                 </Button>
                                             </TooltipTrigger>
                                             <TooltipContent>
                                                 <p>Reprint</p>
                                             </TooltipContent>
                                         </Tooltip>
                                         <Tooltip>
                                             <TooltipTrigger asChild>
                                                 <Button variant="ghost" size="icon" onClick={() => onVoid(check.id, check.transaction_id)} disabled={isVoiding && voidingId === check.id}>
                                                     {isVoiding && voidingId === check.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                 </Button>
                                             </TooltipTrigger>
                                             <TooltipContent>
                                                 <p>Void</p>
                                             </TooltipContent>
                                         </Tooltip>
                                     </div>
                                 </TooltipProvider>
                                )}
                            </TableCell>
                        </TableRow>
                    ))
                ) : (
                    <TableRow>
                        <TableCell colSpan="7" className="h-24 text-center">
                            No check history found.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
        </div>
    );
};

export default CheckHistoryTable;

  