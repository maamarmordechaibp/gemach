import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const AdminPasswordDialog = ({ isOpen, onClose, onConfirm }) => {
  const { isAdmin } = useAuth();
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (isAdmin && isOpen) {
      onClose();
      onConfirm();
    }
  }, [isAdmin, isOpen, onConfirm, onClose]);

  if (isAdmin && isOpen) {
    return null;
  }

  const handleConfirm = async () => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-admin-password', {
        body: JSON.stringify({ password }),
      });

      if (error) throw error;

      if (data.success) {
        onConfirm();
        onClose();
      } else {
        toast({ title: "Verification Failed", description: data.error || "Incorrect admin password.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not verify password. Please try again.", variant: "destructive" });
    } finally {
      setIsVerifying(false);
      setPassword('');
    }
  };

  return (
    <AlertDialog open={isOpen && !isAdmin} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Admin Authorization Required</AlertDialogTitle>
          <AlertDialogDescription>
            Please enter the admin password to proceed with this action.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isVerifying && handleConfirm()}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isVerifying}>
            {isVerifying ? 'Verifying...' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default AdminPasswordDialog;