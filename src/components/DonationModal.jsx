import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const DonationModal = ({ isOpen, onClose, customer, onDonationSuccess }) => {
    const [amount, setAmount] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDonation = async () => {
        const donationAmount = parseFloat(amount);
        if (isNaN(donationAmount) || donationAmount <= 0) {
            toast({ title: "Invalid Amount", description: "Please enter a valid donation amount.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        try {
            const { error } = await supabase.rpc('add_donation', {
                p_customer_id: customer.id,
                p_amount: donationAmount
            });

            if (error) throw error;

            toast({ title: "Donation Successful!", description: `Thank you for the donation of $${donationAmount.toLocaleString()}.` });
            onDonationSuccess();
            handleClose();
        } catch (error) {
            toast({ title: "Donation Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleClose = () => {
        setAmount('');
        onClose();
    };


    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative bg-card border border-border rounded-xl w-full max-w-md mx-4"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg">
                                    <Gift className="h-5 w-5 text-white" />
                                </div>
                                <h2 className="text-lg font-bold text-foreground">Record a Donation</h2>
                            </div>
                            <Button variant="ghost" size="icon" onClick={handleClose}><X className="h-5 w-5" /></Button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-muted-foreground">
                                Record a donation from <span className="font-bold text-foreground">{customer?.first_name} {customer?.last_name}</span>. This amount will be added to the FEES account.
                            </p>
                            <div>
                                <Label htmlFor="donation-amount">Donation Amount ($)</Label>
                                <Input
                                    id="donation-amount"
                                    type="number"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="text-lg"
                                />
                            </div>
                        </div>
                         <div className="p-4 border-t border-border flex justify-end gap-2">
                             <Button variant="outline" onClick={handleClose}>Cancel</Button>
                             <Button onClick={handleDonation} disabled={isProcessing} className="bg-gradient-to-r from-pink-500 to-rose-500">
                                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
                                {isProcessing ? 'Processing...' : 'Record Donation'}
                             </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default DonationModal;