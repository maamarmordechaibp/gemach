
    import React, { useState, useMemo } from 'react';
    import { useHold } from '@/contexts/HoldContext';
    import { useData } from '@/contexts/DataContext';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Badge } from '@/components/ui/badge';
    import { Loader2, Tag, Unlock, CheckCheck, Trash2 } from 'lucide-react';
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
    import CreatableSelect from '@/components/ui/creatable-select';
    import { cn } from '@/lib/utils';

    const ChecksOnHold = () => {
        const { heldChecks, releaseFunds, releasePartialFunds, loading, tagOptions } = useHold();
        const { getCustomerName } = useData();

        const [selectedTag, setSelectedTag] = useState(null);
        const [selectedChecks, setSelectedChecks] = useState(new Set());
        const [partialRelease, setPartialRelease] = useState({ show: false, amount: '', tag: null });
        const [showClearAllDialog, setShowClearAllDialog] = useState(false);

        const filteredChecks = useMemo(() => {
            if (!selectedTag) return heldChecks;
            return heldChecks.filter(c => c.hold_tags?.includes(selectedTag.value));
        }, [heldChecks, selectedTag]);

        const totalHeldAmount = useMemo(() => {
            return filteredChecks.reduce((sum, check) => sum + (parseFloat(check.amount) - (check.hold_cleared_amount || 0)), 0);
        }, [filteredChecks]);

        const handleSelectCheck = (checkId) => {
            setSelectedChecks(prev => {
                const newSet = new Set(prev);
                if (newSet.has(checkId)) newSet.delete(checkId);
                else newSet.add(checkId);
                return newSet;
            });
        };
        
        const handleSelectAll = () => {
            if (selectedChecks.size === filteredChecks.length && filteredChecks.length > 0) {
                setSelectedChecks(new Set());
            } else {
                setSelectedChecks(new Set(filteredChecks.map(c => c.id)));
            }
        };

        const handleReleaseSelected = () => {
            releaseFunds(Array.from(selectedChecks));
            setSelectedChecks(new Set());
        };

        const handleReleasePartial = () => {
            releasePartialFunds(partialRelease.tag, partialRelease.amount);
            setPartialRelease({ show: false, amount: '', tag: null });
        };
        
        const handleClearAllForTag = () => {
            const checkIds = filteredChecks.map(c => c.id);
            releaseFunds(checkIds);
            setShowClearAllDialog(false);
        };
        
        if (loading) {
            return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        }

        return (
            <div className="space-y-4 pt-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-card/80 border border-border rounded-lg">
                    <div className="w-full md:w-1/3">
                        <CreatableSelect
                            placeholder="Filter by tag..."
                            isClearable
                            value={selectedTag}
                            onChange={setSelectedTag}
                            options={tagOptions}
                        />
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">Total Held for Filter</p>
                        <p className="text-2xl font-bold text-orange-400">${totalHeldAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleReleaseSelected} disabled={selectedChecks.size === 0}><Unlock className="h-4 w-4 mr-2"/> Release Selected</Button>
                        {selectedTag && <Button variant="secondary" onClick={() => setPartialRelease({ show: true, amount: '', tag: selectedTag.value })}><Unlock className="h-4 w-4 mr-2"/>Partial Release</Button>}
                        {selectedTag && <Button variant="destructive" onClick={() => setShowClearAllDialog(true)}><CheckCheck className="h-4 w-4 mr-2"/>Clear All For Tag</Button>}
                    </div>
                </div>

                <div className="overflow-x-auto bg-card/80 border border-border rounded-lg">
                    <table className="w-full text-sm">
                        <thead>
                        <tr className="border-b border-border">
                            <th className="p-3 w-10"><Checkbox onCheckedChange={handleSelectAll} checked={selectedChecks.size === filteredChecks.length && filteredChecks.length > 0} /></th>
                            <th className="p-3 text-left">Date</th>
                            <th className="p-3 text-left">Customer</th>
                            <th className="p-3 text-left">Check #</th>
                            <th className="p-3 text-right">Amount</th>
                            <th className="p-3 text-right">Cleared</th>
                            <th className="p-3 text-right">Remaining</th>
                            <th className="p-3 text-left">Tags</th>
                        </tr>
                        </thead>
                        <tbody>
                            {filteredChecks.map(check => (
                                <tr key={check.id} className={cn("border-b border-border/50 hover:bg-muted/30", selectedChecks.has(check.id) && 'bg-blue-900/30')}>
                                    <td className="p-3"><Checkbox onCheckedChange={() => handleSelectCheck(check.id)} checked={selectedChecks.has(check.id)} /></td>
                                    <td className="p-3">{new Date(check.date).toLocaleDateString()}</td>
                                    <td className="p-3">{getCustomerName(check.account_number)}</td>
                                    <td className="p-3">{check.check_number}</td>
                                    <td className="p-3 text-right">${parseFloat(check.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-right text-green-400">${parseFloat(check.hold_cleared_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-right font-bold text-orange-400">${(parseFloat(check.amount) - (check.hold_cleared_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3">
                                        <div className="flex flex-wrap gap-1">
                                            {check.hold_tags?.map(tag => <Badge key={tag} variant="secondary" className="bg-orange-500/20 text-orange-300">{tag}</Badge>)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {filteredChecks.length === 0 && <p className="text-center text-muted-foreground p-8">No checks on hold matching the criteria.</p>}
                </div>
                
                <AlertDialog open={partialRelease.show} onOpenChange={() => setPartialRelease({ show: false, amount: '', tag: null })}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Partial Fund Release</AlertDialogTitle>
                            <AlertDialogDescription>
                                Enter the amount you want to release for checks with the tag "{partialRelease.tag}". Funds will be released from the oldest checks first.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Input 
                            type="number" 
                            placeholder="Amount to release" 
                            value={partialRelease.amount} 
                            onChange={e => setPartialRelease(p => ({...p, amount: e.target.value}))}
                        />
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleReleasePartial}>Release Funds</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                
                 <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Clear all for "{selectedTag?.value}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will release all remaining funds for all checks with this tag. Are you sure?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleClearAllForTag}>Yes, Clear All</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    };

    export default ChecksOnHold;
  