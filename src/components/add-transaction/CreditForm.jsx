
    import React, { useState, useEffect, useCallback } from 'react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Plus, Trash2, Banknote, Landmark, ShieldCheck } from 'lucide-react';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Label } from '@/components/ui/label';
    import { Switch } from '@/components/ui/switch';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useData } from '@/contexts/DataContext';
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

    const CreditForm = ({ creditCash, creditChecks, onInputChange, onListChange, customerId }) => {
      const [showHoldPrompt, setShowHoldPrompt] = useState(null); // stores index
      const [holdTags, setHoldTags] = useState([]);
      const [tagOptions, setTagOptions] = useState([]);

      const { settings, customers } = useData();
      const holdSettings = settings?.hold_settings || { enabled: false, bounce_threshold: 3, period_days: 90 };
      
      const checkBounceHistory = useCallback(async () => {
        if (!holdSettings.enabled || !customerId) return;
        const customer = customers.find(c => c.id === customerId);
        if (!customer) return;

        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - holdSettings.period_days);

        const { error, count } = await supabase
          .from('checks_in')
          .select('id', { count: 'exact' })
          .eq('account_number', customer.account_number)
          .eq('status', 'bounced')
          .gte('date', dateLimit.toISOString());

        if (error) {
          console.error("Error checking bounce history:", error);
          return;
        }
        
        if (count !== null && count >= holdSettings.bounce_threshold) {
          setShowHoldPrompt(creditChecks.length - 1);
        }
      }, [holdSettings, customerId, customers, creditChecks.length]);

      const fetchHoldTags = async () => {
        const { data, error } = await supabase.from('hold_tags').select('tag');
        if (data) {
          setTagOptions(data.map(t => ({ label: t.tag, value: t.tag })));
        }
      };

      useEffect(() => {
        fetchHoldTags();
      }, []);

      const handleCheckChange = (index, field, value) => {
        const updated = [...creditChecks];
        updated[index][field] = value;
        onListChange('creditChecks', updated);
      };

      const addCheckEntry = useCallback(() => {
        const newChecks = [...creditChecks, { checkNumber: '', amount: '', has_account_number: true, isOnHold: false, holdTags: [] }];
        onListChange('creditChecks', newChecks);
      }, [creditChecks, onListChange]);
      
      useEffect(() => {
        if (creditChecks.length > 0) {
            checkBounceHistory();
        }
      }, [creditChecks.length, checkBounceHistory])

      const removeCheckEntry = (index) => {
        const updated = creditChecks.filter((_, i) => i !== index);
        onListChange('creditChecks', updated);
      };

      const handleHoldConfirm = () => {
        if (showHoldPrompt === null) return;
        handleCheckChange(showHoldPrompt, 'isOnHold', true);
        handleCheckChange(showHoldPrompt, 'holdTags', holdTags.map(t => t.value));
        setShowHoldPrompt(null);
        setHoldTags([]);
      };
      
      const handleTagCreate = async (newTag) => {
        const { data, error } = await supabase.from('hold_tags').insert({ tag: newTag }).select().single();
        if (data) {
          setTagOptions(prev => [...prev, { label: data.tag, value: data.tag }]);
        }
      };

      return (
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2"><Banknote className="h-5 w-5 text-green-400" /> Cash Deposit</h4>
            <Input
              type="number"
              placeholder="Amount"
              value={creditCash}
              onChange={(e) => onInputChange('creditCash', e.target.value)}
            />
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Landmark className="h-5 w-5 text-green-400" /> Checks to Deposit</h4>
            <div className="space-y-4">
              {creditChecks.map((check, index) => (
                <div key={index} className="bg-secondary/50 p-4 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-grow space-y-2">
                      <Input
                        type="text"
                        placeholder="Check Number"
                        value={check.checkNumber}
                        onChange={(e) => handleCheckChange(index, 'checkNumber', e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={check.amount}
                        onChange={(e) => handleCheckChange(index, 'amount', e.target.value)}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeCheckEntry(index)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`has-acct-${index}`}
                        checked={check.has_account_number}
                        onCheckedChange={(checked) => handleCheckChange(index, 'has_account_number', checked)}
                      />
                      <Label htmlFor={`has-acct-${index}`} className="text-sm">Has Account #</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                       <Label htmlFor={`on-hold-${index}`} className="text-sm flex items-center gap-1 text-orange-400"><ShieldCheck className="h-4 w-4"/> On Hold</Label>
                       <Switch
                        id={`on-hold-${index}`}
                        checked={check.isOnHold}
                        onCheckedChange={(checked) => {
                            if(checked) setShowHoldPrompt(index);
                            else handleCheckChange(index, 'isOnHold', false);
                        }}
                      />
                    </div>
                  </div>
                  {check.isOnHold && (
                    <div className="text-xs text-orange-300 pl-2 border-l-2 border-orange-400">
                      Tags: {check.holdTags?.join(', ') || 'None'}
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCheckEntry}>
                <Plus className="h-4 w-4 mr-2" /> Add Check to Deposit
              </Button>
            </div>
          </div>
          
          <AlertDialog open={showHoldPrompt !== null} onOpenChange={(open) => !open && setShowHoldPrompt(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Place Funds on Hold?</AlertDialogTitle>
                <AlertDialogDescription>
                   This customer may have a history of bounced checks. It is recommended to place this check on hold. You can add tags to categorize this hold.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <Label>Hold Tags (e.g., "כולל")</Label>
                <CreatableSelect
                  isMulti
                  value={holdTags}
                  onChange={setHoldTags}
                  onCreateOption={handleTagCreate}
                  options={tagOptions}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setShowHoldPrompt(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleHoldConfirm}>Confirm Hold</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    };

    export default CreditForm;
  