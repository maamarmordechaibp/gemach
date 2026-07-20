import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, X, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';

const fmt = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Lightweight searchable account picker consistent with the app's inline search UX.
const AccountPicker = ({ label, customers, selected, onSelect, excludeAccount }) => {
  const [term, setTerm] = useState('');

  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    return (customers || [])
      .filter(c => c.account_number !== excludeAccount)
      .filter(c =>
        (c.first_name || '').toLowerCase().includes(t) ||
        (c.last_name || '').toLowerCase().includes(t) ||
        (c.account_number || '').toLowerCase().includes(t)
      )
      .slice(0, 6);
  }, [term, customers, excludeAccount]);

  return (
    <div>
      <Label className="text-sm font-medium text-muted-foreground">{label}</Label>
      {selected ? (
        <div className="flex items-center justify-between p-3 mt-1 bg-secondary/50 border border-border rounded-lg">
          <div>
            <p className="font-semibold text-foreground">{selected.first_name} {selected.last_name}</p>
            <p className="text-xs text-muted-foreground">Acc: {selected.account_number} · Balance ${fmt(selected.balance)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => { onSelect(null); setTerm(''); }}>Change</Button>
        </div>
      ) : (
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search account number or name..."
            className="w-full pl-10 pr-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {term && (
            <div className="absolute w-full bg-card border border-border rounded-lg mt-1 overflow-y-auto max-h-48 z-20 shadow-2xl">
              {results.length > 0 ? results.map(c => (
                <div key={c.id} onClick={() => { onSelect(c); setTerm(''); }} className="p-3 hover:bg-accent cursor-pointer">
                  <p className="text-foreground font-semibold">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-muted-foreground">Acc: {c.account_number} · Balance ${fmt(c.balance)}</p>
                </div>
              )) : (
                <p className="p-3 text-center text-muted-foreground text-sm">No matching accounts</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AddTransferModal = ({ isOpen, onClose }) => {
  const { customers, refreshData } = useData();
  const [fromAccount, setFromAccount] = useState(null);
  const [toAccount, setToAccount] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const available = fromAccount
    ? (parseFloat(fromAccount.balance) || 0) + (parseFloat(fromAccount.overdraft_limit) || 0)
    : 0;

  const reset = () => {
    setFromAccount(null);
    setToAccount(null);
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setIsProcessing(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!fromAccount) { toast({ title: 'Select a source account', variant: 'destructive' }); return; }
    if (!toAccount) { toast({ title: 'Select a destination account', variant: 'destructive' }); return; }
    if (fromAccount.account_number === toAccount.account_number) {
      toast({ title: 'Invalid Transfer', description: 'Cannot transfer to the same account.', variant: 'destructive' });
      return;
    }
    if (amountNum <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    if (amountNum > available) {
      toast({ title: 'Insufficient funds', description: `Available balance is $${fmt(available)}.`, variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const isoDate = new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
      const { error } = await supabase.rpc('process_transfer', {
        p_from_account: fromAccount.account_number,
        p_to_account: toAccount.account_number,
        p_amount: amountNum,
        p_date: isoDate,
        p_note: note.trim() || null,
      });
      if (error) throw error;

      toast({ title: 'Transfer complete', description: `$${fmt(amountNum)} moved from ${fromAccount.account_number} to ${toAccount.account_number}.` });
      refreshData();
      handleClose();
    } catch (error) {
      toast({ title: 'Transfer failed', description: error.message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-card border border-border rounded-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg"><ArrowRightLeft className="h-5 w-5 text-white" /></div>
                <h2 className="text-xl font-bold text-foreground">Add Transfer</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose}><X className="h-5 w-5" /></Button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <AccountPicker label="From Account" customers={customers} selected={fromAccount} onSelect={setFromAccount} excludeAccount={toAccount?.account_number} />
              <AccountPicker label="To Account" customers={customers} selected={toAccount} onSelect={setToAccount} excludeAccount={fromAccount?.account_number} />

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Amount</Label>
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
                {fromAccount && (
                  <p className={`text-xs mt-1 ${amountNum > available ? 'text-red-400' : 'text-muted-foreground'}`}>
                    Available: ${fmt(available)}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Note / Description (optional)</Label>
                <Input type="text" placeholder="Reason for transfer..." value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={isProcessing} className="bg-gradient-to-r from-blue-500 to-indigo-500">
                {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer</>}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AddTransferModal;
