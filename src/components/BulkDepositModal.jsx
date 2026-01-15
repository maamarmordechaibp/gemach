import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Banknote, CheckSquare, Square, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const BulkDepositModal = ({ isOpen, onClose, checks, onBulkUpdate, tableName = 'checks_in' }) => {
  const [selectedChecks, setSelectedChecks] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleCheck = (checkId) => {
    setSelectedChecks(prev => 
      prev.includes(checkId) 
        ? prev.filter(id => id !== checkId) 
        : [...prev, checkId]
    );
  };
  
  const toggleSelectAll = () => {
    if (selectedChecks.length === checks.length) {
      setSelectedChecks([]);
    } else {
      setSelectedChecks(checks.map(c => c.id));
    }
  };

  const handleBulkDeposit = async () => {
    if (selectedChecks.length === 0) {
      toast({ title: 'No checks selected', description: 'Please select at least one check to deposit.', variant: 'destructive'});
      return;
    }
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from(tableName)
        .update({ status: 'deposited' })
        .in('id', selectedChecks);

      if (error) throw error;
      
      toast({ title: 'Success!', description: `${selectedChecks.length} checks have been marked as deposited.` });
      onBulkUpdate();
      onClose();
      setSelectedChecks([]);

    } catch (error) {
      toast({ title: 'Error processing deposit', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };


  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-card border border-border rounded-xl p-6 w-full max-w-2xl mx-4 flex flex-col"
            style={{ height: '80vh' }}
          >
             <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg">
                  <Banknote className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-foreground">
                  Bulk Check Deposit
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                {checks.length > 0 ? checks.map(check => (
                    <div 
                        key={check.id}
                        onClick={() => toggleCheck(check.id)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${selectedChecks.includes(check.id) ? 'bg-blue-500/20 border-blue-500' : 'bg-secondary/50 hover:bg-secondary'}`}
                    >
                        <div className="flex items-center gap-3">
                            {selectedChecks.includes(check.id) ? <CheckSquare className="h-5 w-5 text-blue-400" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                            <div>
                                <p className="font-bold text-foreground">Check #{check.check_number}</p>
                                <p className="text-sm text-muted-foreground">Acct: {check.account_number}</p>
                            </div>
                        </div>
                        <p className="font-medium text-green-400">${parseFloat(check.amount).toLocaleString()}</p>
                    </div>
                )) : (
                    <div className="text-center text-muted-foreground pt-16">
                        <ThumbsUp className="mx-auto h-12 w-12 text-slate-600 mb-4" />
                        <h3 className="text-lg font-bold text-foreground">All caught up!</h3>
                        <p>There are no pending checks to deposit.</p>
                    </div>
                )}
            </div>
            
            {checks.length > 0 && (
                <div className="pt-4 mt-auto border-t border-border flex justify-between items-center">
                    <Button variant="outline" onClick={toggleSelectAll}>
                        {selectedChecks.length === checks.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <div className="text-right">
                        <p className="text-muted-foreground">{selectedChecks.length} checks selected</p>
                        <p className="text-lg font-bold text-foreground">Total: ${checks.filter(c => selectedChecks.includes(c.id)).reduce((sum, c) => sum + parseFloat(c.amount), 0).toLocaleString()}</p>
                    </div>
                    <Button onClick={handleBulkDeposit} disabled={isProcessing || selectedChecks.length === 0} className="bg-gradient-to-r from-blue-500 to-cyan-500">
                        {isProcessing ? 'Processing...' : 'Deposit Selected Checks'}
                    </Button>
                </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BulkDepositModal;