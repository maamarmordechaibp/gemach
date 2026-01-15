import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Trash2 } from 'lucide-react';

const defaultFees = {
    enabled: false,
    cash_debit: {
        enabled: false,
        fee_type: 'flat',
        fee_value: 0,
        waiver: {
            mode: 'always', 
            threshold_amount: 0,
            period_days: 30
        }
    },
    check_debit: {
        enabled: false,
        tiers: [{ from: 1, to: 1, fee: 0 }]
    },
    check_credit_missing_account_number: {
        enabled: false,
        tiers: [{ from: 1, to: 5, fee: 0 }]
    },
    check_reprint: {
        enabled: false,
        fee: 0
    },
    rush_fee: {
        enabled: false,
        overwrite: false,
        cash: {
            tiers: [{ from: 0, to: 100, fee: 0, fee_type: 'flat' }]
        },
        check: {
            tiers: [{ from: 1, to: 5, fee: 0, fee_type: 'flat' }]
        }
    }
};

const SectionWrapper = ({ title, children }) => (
    <div className="space-y-4 p-4 border border-border rounded-lg bg-card-foreground/5">
        <h4 className="font-semibold text-lg">{title}</h4>
        <div className="pl-4 border-l-2 border-border/50 ml-2 space-y-4">
            {children}
        </div>
    </div>
);

const TieredFeeEditor = ({ tiers, onTierChange, onAddTier, onRemoveTier, unit = 'checks', perTierType = false }) => (
    <div className="space-y-3">
        {tiers.map((tier, index) => (
            <div key={index} className="flex items-center flex-wrap gap-2 p-2 bg-background/50 rounded-md">
                <span className="text-sm text-muted-foreground">From</span>
                <Input type="number" value={tier.from} onChange={e => onTierChange(index, 'from', parseInt(e.target.value) || 0)} className="w-20" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="number" value={tier.to} onChange={e => onTierChange(index, 'to', parseInt(e.target.value) || 0)} className="w-20" />
                <span className="text-sm text-muted-foreground">{unit}, fee is</span>
                <Input type="number" value={tier.fee} onChange={e => onTierChange(index, 'fee', parseFloat(e.target.value) || 0)} className="w-24" />
                {perTierType ? (
                    <RadioGroup value={tier.fee_type || 'flat'} onValueChange={(v) => onTierChange(index, 'fee_type', v)} className="flex items-center gap-2">
                        <div className="flex items-center space-x-1"><RadioGroupItem value="flat" id={`tier-flat-${index}`} /><Label htmlFor={`tier-flat-${index}`}>$</Label></div>
                        <div className="flex items-center space-x-1"><RadioGroupItem value="percent" id={`tier-percent-${index}`} /><Label htmlFor={`tier-percent-${index}`}>%</Label></div>
                    </RadioGroup>
                ) : (
                    <span className="text-sm text-muted-foreground">$ each</span>
                )}
                <Button variant="ghost" size="icon" onClick={() => onRemoveTier(index)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
            </div>
        ))}
        <Button variant="outline" size="sm" onClick={onAddTier}><Plus className="h-4 w-4 mr-2"/>Add Tier</Button>
    </div>
);

const TransactionFees = () => {
    const { settings, refreshData } = useData();
    const [fees, setFees] = useState(defaultFees);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (settings.transaction_fees) {
            const currentFees = settings.transaction_fees;
            const mergedFees = {
                ...defaultFees,
                ...currentFees,
                cash_debit: { ...defaultFees.cash_debit, ...(currentFees.cash_debit || {}), waiver: {...defaultFees.cash_debit.waiver, ...currentFees.cash_debit?.waiver} },
                check_debit: { ...defaultFees.check_debit, ...(currentFees.check_debit || {}) },
                check_credit_missing_account_number: { ...defaultFees.check_credit_missing_account_number, ...(currentFees.check_credit_missing_account_number || {}) },
                check_reprint: { ...defaultFees.check_reprint, ...(currentFees.check_reprint || {}) },
                rush_fee: { ...defaultFees.rush_fee, ...(currentFees.rush_fee || {}), cash: {...defaultFees.rush_fee.cash, ...currentFees.rush_fee?.cash, tiers: currentFees.rush_fee?.cash?.tiers || defaultFees.rush_fee.cash.tiers}, check: {...defaultFees.rush_fee.check, ...currentFees.rush_fee?.check, tiers: currentFees.rush_fee?.check?.tiers || defaultFees.rush_fee.check.tiers} },
            };
            setFees(mergedFees);
        }
    }, [settings.transaction_fees]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('system_settings')
                .upsert({ key: 'transaction_fees', value: fees }, { onConflict: 'key' });

            if (error) throw error;
            toast({ title: 'Success', description: 'Transaction fees updated successfully.' });
            refreshData();
        } catch (error) {
            toast({ title: 'Error saving fees', description: error.message, variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };
    
    const setFeeValue = (path, value) => {
        setFees(prev => {
            const keys = path.split('.');
            let tempState = JSON.parse(JSON.stringify(prev));
            let current = tempState;
            for (let i = 0; i < keys.length - 1; i++) {
                if (current[keys[i]] === undefined) current[keys[i]] = {};
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return tempState;
        });
    };

    const handleTierChange = (category, index, key, value) => {
        const newTiers = [...fees[category].tiers];
        newTiers[index][key] = value;
        setFeeValue(`${category}.tiers`, newTiers);
    };
    
    const handleRushTierChange = (type, index, key, value) => {
        const newTiers = [...fees.rush_fee[type].tiers];
        newTiers[index][key] = value;
        setFeeValue(`rush_fee.${type}.tiers`, newTiers);
    };

    const addTier = (category) => {
        const tiers = fees[category].tiers;
        const lastTier = tiers[tiers.length - 1];
        const newFrom = lastTier ? (parseInt(lastTier.to) || 0) + 1 : 1;
        const newTiers = [...tiers, { from: newFrom, to: newFrom, fee: 0 }];
        setFeeValue(`${category}.tiers`, newTiers);
    };
    
    const addRushTier = (type) => {
        const tiers = fees.rush_fee[type].tiers;
        const lastTier = tiers[tiers.length - 1];
        const newFrom = lastTier ? (parseInt(lastTier.to) || 0) + 1 : 1;
        const newTiers = [...tiers, { from: newFrom, to: newFrom, fee: 0, fee_type: 'flat' }];
        setFeeValue(`rush_fee.${type}.tiers`, newTiers);
    };

    const removeTier = (category, index) => {
        const newTiers = fees[category].tiers.filter((_, i) => i !== index);
        setFeeValue(`${category}.tiers`, newTiers);
    };
    
    const removeRushTier = (type, index) => {
        const newTiers = fees.rush_fee[type].tiers.filter((_, i) => i !== index);
        setFeeValue(`rush_fee.${type}.tiers`, newTiers);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-2">
                <Switch id="fees-enabled" checked={fees.enabled} onCheckedChange={(checked) => setFeeValue('enabled', checked)} />
                <Label htmlFor="fees-enabled">Enable Transaction Fees System</Label>
            </div>
            {fees.enabled && (
                <div className="space-y-6">
                    <SectionWrapper title="Cash Withdrawal Fees">
                        <div className="flex items-center space-x-2">
                            <Switch id="cash-debit-enabled" checked={fees.cash_debit.enabled} onCheckedChange={(checked) => setFeeValue('cash_debit.enabled', checked)} />
                            <Label htmlFor="cash-debit-enabled">Enable Cash Withdrawal Fee</Label>
                        </div>
                        {fees.cash_debit.enabled && (
                            <>
                                <RadioGroup value={fees.cash_debit.fee_type} onValueChange={(v) => setFeeValue('cash_debit.fee_type', v)} className="flex items-center gap-4">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="flat" id="cash-flat" /><Label htmlFor="cash-flat">Flat Rate</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="percent" id="cash-percent" /><Label htmlFor="cash-percent">Percentage</Label></div>
                                </RadioGroup>
                                <div className="flex items-center gap-2">
                                    <Input type="number" value={fees.cash_debit.fee_value} onChange={(e) => setFeeValue('cash_debit.fee_value', parseFloat(e.target.value) || 0)} className="w-40" />
                                    <span>{fees.cash_debit.fee_type === 'flat' ? '$' : '%'}</span>
                                </div>
                                <div>
                                    <Label>Fee Waiver Rule</Label>
                                    <RadioGroup value={fees.cash_debit.waiver.mode} onValueChange={(v) => setFeeValue('cash_debit.waiver.mode', v)} className="flex items-center gap-4 mt-2">
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="always" id="waiver-always" /><Label htmlFor="waiver-always">Always Charge</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="never" id="waiver-never" /><Label htmlFor="waiver-never">Never Charge</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="conditional" id="waiver-conditional" /><Label htmlFor="waiver-conditional">Conditional</Label></div>
                                    </RadioGroup>
                                </div>
                                {fees.cash_debit.waiver.mode === 'conditional' && (
                                    <div className="flex items-center gap-2 p-2 bg-background/50 rounded-md text-sm">
                                        <span>Waive fee if total debit in last</span>
                                        <Input type="number" value={fees.cash_debit.waiver.period_days} onChange={(e) => setFeeValue('cash_debit.waiver.period_days', parseInt(e.target.value) || 0)} className="w-20" />
                                        <span>days is less than</span>
                                        <Input type="number" value={fees.cash_debit.waiver.threshold_amount} onChange={(e) => setFeeValue('cash_debit.waiver.threshold_amount', parseFloat(e.target.value) || 0)} className="w-24" />
                                        <span>$</span>
                                    </div>
                                )}
                            </>
                        )}
                    </SectionWrapper>

                    <SectionWrapper title="Outgoing Check Fees">
                        <div className="flex items-center space-x-2">
                            <Switch id="check-debit-enabled" checked={fees.check_debit.enabled} onCheckedChange={(checked) => setFeeValue('check_debit.enabled', checked)} />
                            <Label htmlFor="check-debit-enabled">Enable Tiered Fee for Outgoing Checks</Label>
                        </div>
                        {fees.check_debit.enabled && (
                            <TieredFeeEditor tiers={fees.check_debit.tiers} onTierChange={(i, k, v) => handleTierChange('check_debit', i, k, v)} onAddTier={() => addTier('check_debit')} onRemoveTier={(i) => removeTier('check_debit', i)} />
                        )}
                    </SectionWrapper>
                    
                    <SectionWrapper title="Incoming Check Fees (Missing Account #)">
                        <div className="flex items-center space-x-2">
                             <Switch id="check-credit-enabled" checked={fees.check_credit_missing_account_number.enabled} onCheckedChange={(checked) => setFeeValue('check_credit_missing_account_number.enabled', checked)} />
                            <Label htmlFor="check-credit-enabled">Enable Fee for Incoming Checks Missing Account Number</Label>
                        </div>
                        {fees.check_credit_missing_account_number.enabled && (
                            <TieredFeeEditor tiers={fees.check_credit_missing_account_number.tiers} onTierChange={(i, k, v) => handleTierChange('check_credit_missing_account_number', i, k, v)} onAddTier={() => addTier('check_credit_missing_account_number')} onRemoveTier={(i) => removeTier('check_credit_missing_account_number', i)} />
                        )}
                    </SectionWrapper>

                    <SectionWrapper title="Check Reprint Fee">
                        <div className="flex items-center space-x-2">
                            <Switch id="check-reprint-enabled" checked={fees.check_reprint.enabled} onCheckedChange={(checked) => setFeeValue('check_reprint.enabled', checked)} />
                            <Label htmlFor="check-reprint-enabled">Enable Fee for Reprinting Checks</Label>
                        </div>
                        {fees.check_reprint.enabled && (
                            <div className="flex items-center gap-2">
                                <Label>Fee Amount</Label>
                                <Input type="number" value={fees.check_reprint.fee} onChange={(e) => setFeeValue('check_reprint.fee', parseFloat(e.target.value) || 0)} className="w-32" />
                                <span>$</span>
                            </div>
                        )}
                    </SectionWrapper>

                    <SectionWrapper title="Rush Fee">
                        <div className="flex items-center space-x-2">
                            <Switch id="rush-fee-enabled" checked={fees.rush_fee.enabled} onCheckedChange={(checked) => setFeeValue('rush_fee.enabled', checked)} />
                            <Label htmlFor="rush-fee-enabled">Enable Rush Fee</Label>
                        </div>
                        {fees.rush_fee.enabled && (
                            <div className="space-y-4">
                                <div className="flex items-center space-x-2">
                                    <Switch id="rush-fee-overwrite" checked={fees.rush_fee.overwrite} onCheckedChange={(checked) => setFeeValue('rush_fee.overwrite', checked)} />
                                    <Label htmlFor="rush-fee-overwrite">Overwrite regular fees (if disabled, Rush Fee is additional)</Label>
                                </div>
                                
                                <div className="p-3 border border-border/50 rounded-md">
                                    <h5 className="font-medium mb-2">Cash Rush Fee Tiers</h5>
                                    <TieredFeeEditor unit="$" perTierType={true} tiers={fees.rush_fee.cash.tiers} onTierChange={(i, k, v) => handleRushTierChange('cash', i, k, v)} onAddTier={() => addRushTier('cash')} onRemoveTier={(i) => removeRushTier('cash', i)} />
                                </div>

                                <div className="p-3 border border-border/50 rounded-md">
                                    <h5 className="font-medium mb-2">Check Rush Fee Tiers</h5>
                                    <TieredFeeEditor unit="checks" perTierType={true} tiers={fees.rush_fee.check.tiers} onTierChange={(i, k, v) => handleRushTierChange('check', i, k, v)} onAddTier={() => addRushTier('check')} onRemoveTier={(i) => removeRushTier('check', i)} />
                                </div>
                            </div>
                        )}
                    </SectionWrapper>
                </div>
            )}
            <div className="pt-4">
                <Button onClick={handleSave} disabled={isLoading}>
                    {isLoading ? 'Saving...' : 'Save All Fee Settings'}
                </Button>
            </div>
        </div>
    );
};

export default TransactionFees;