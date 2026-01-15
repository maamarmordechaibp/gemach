
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Banknote, FileSignature } from 'lucide-react';
import PayeeInput from '@/components/add-transaction/PayeeInput';

const DebitForm = ({ debitCashEntries, debitChecks, onListChange, customer }) => {
  const handleCashChange = (index, field, value) => {
    const updated = [...debitCashEntries];
    updated[index][field] = value;
    onListChange('debitCashEntries', updated);
  };

  const addCashEntry = () => {
    onListChange('debitCashEntries', [...debitCashEntries, { amount: '', isRush: false }]);
  };

  const removeCashEntry = (index) => {
    const updated = debitCashEntries.filter((_, i) => i !== index);
    onListChange('debitCashEntries', updated);
  };

  const handleCheckChange = (index, field, value) => {
    const updated = [...debitChecks];
    updated[index][field] = value;
    onListChange('debitChecks', updated);
  };

  const addCheckEntry = () => {
    onListChange('debitChecks', [...debitChecks, { payToOrderOf: '', amount: '', memo: '', isRush: false, saveOption: 'once' }]);
  };

  const removeCheckEntry = (index) => {
    const updated = debitChecks.filter((_, i) => i !== index);
    onListChange('debitChecks', updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Banknote className="h-5 w-5 text-red-400" /> Cash Withdrawals</h4>
        <div className="space-y-3">
          {debitCashEntries.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={entry.amount}
                onChange={(e) => handleCashChange(index, 'amount', e.target.value)}
                className="flex-grow"
              />
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`cash-rush-${index}`}
                  checked={entry.isRush}
                  onCheckedChange={(checked) => handleCashChange(index, 'isRush', checked)}
                />
                <Label htmlFor={`cash-rush-${index}`} className="text-sm">Rush</Label>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeCashEntry(index)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addCashEntry}>
            <Plus className="h-4 w-4 mr-2" /> Add Cash Withdrawal
          </Button>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2"><FileSignature className="h-5 w-5 text-red-400" /> Checks to Issue</h4>
        <div className="space-y-4">
          {debitChecks.map((check, index) => (
            <div key={index} className="bg-secondary/50 p-4 rounded-lg space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-grow space-y-2">
                    <PayeeInput
                        value={check.payToOrderOf}
                        onChange={(value) => handleCheckChange(index, 'payToOrderOf', value)}
                        onSaveOptionChange={(option) => handleCheckChange(index, 'saveOption', option)}
                        customerId={customer.id}
                    />
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={check.amount}
                    onChange={(e) => handleCheckChange(index, 'amount', e.target.value)}
                  />
                  <Textarea
                    placeholder="Memo"
                    value={check.memo}
                    onChange={(e) => handleCheckChange(index, 'memo', e.target.value)}
                    rows={1}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeCheckEntry(index)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`check-rush-${index}`}
                  checked={check.isRush}
                  onCheckedChange={(checked) => handleCheckChange(index, 'isRush', checked)}
                />
                <Label htmlFor={`check-rush-${index}`} className="text-sm">Rush</Label>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addCheckEntry}>
            <Plus className="h-4 w-4 mr-2" /> Add Check to Issue
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DebitForm;
