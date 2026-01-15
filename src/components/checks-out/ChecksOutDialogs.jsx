import React, { useState, useCallback } from 'react';
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
import { Loader2 } from 'lucide-react';

export const useDialogs = () => {
    const [dialogs, setDialogs] = useState({
        printing: { isOpen: false, count: 0 },
    });

    const openDialog = useCallback((dialogName, props) => {
        setDialogs(prev => ({ ...prev, [dialogName]: { isOpen: true, ...props } }));
    }, []);

    const closeDialog = useCallback((dialogName) => {
        setDialogs(prev => ({ ...prev, [dialogName]: { ...prev[dialogName], isOpen: false } }));
    }, []);

    return { dialogs, openDialog, closeDialog };
};


export const ChecksOutDialogs = ({ dialogs, closeDialog }) => {
  return (
    <>
      <AlertDialog open={dialogs.printing.isOpen} onOpenChange={() => closeDialog('printing')}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Printing Checks</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex items-center gap-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Generating {dialogs.printing.count} check(s). Please wait...</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};