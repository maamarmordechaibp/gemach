import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Loader2, ShieldCheck, Server, AlertTriangle } from 'lucide-react';

const InitialSetup = ({ onSetupComplete }) => {
  const [status, setStatus] = useState({
    message: 'Starting initial application setup...',
    error: null,
    details: []
  });

  useEffect(() => {
    const runSetup = async () => {
      try {
        setStatus(prev => ({ ...prev, message: 'Invoking setup function...' }));
        const { data, error } = await supabase.functions.invoke('initial-setup');

        if (error) {
          throw new Error(`Network or function invocation error: ${error.message}`);
        }
        
        if (data.error) {
          throw new Error(`Setup script failed: ${data.error}`);
        }

        setStatus(prev => ({ 
          ...prev, 
          message: 'Setup complete! Redirecting to login...',
          details: [
            { icon: <ShieldCheck className="text-green-400" />, text: data.details.admin },
            { icon: <Server className="text-green-400" />, text: data.details.storage },
            { icon: <Server className="text-green-400" />, text: data.details.cors },
          ]
        }));

        toast({ title: 'Setup Complete', description: 'Your application is now ready to use.' });
        
        setTimeout(() => {
          onSetupComplete();
        }, 2500);

      } catch (err) {
        setStatus({ 
          message: 'A critical error occurred during setup.',
          error: err.message,
          details: [{ icon: <AlertTriangle className="text-red-400" />, text: err.message }]
        });
        toast({ title: 'Setup Failed', description: err.message, variant: 'destructive' });
      }
    };

    runSetup();
  }, [onSetupComplete]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center text-white bg-slate-800/50 border border-slate-700/50 rounded-2xl shadow-2xl p-8 backdrop-blur-lg">
        <div className="flex justify-center mb-4">
          {status.error ? 
            <AlertTriangle className="h-12 w-12 text-red-500" /> : 
            <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
          }
        </div>
        <h1 className="text-2xl font-bold mb-2">{status.error ? 'Setup Failed' : 'Initializing Application'}</h1>
        <p className="text-slate-400 mb-6">{status.message}</p>
        <div className="text-left text-sm space-y-2">
          {status.details.map((detail, index) => (
            <div key={index} className="flex items-center gap-3 p-2 bg-slate-700/50 rounded-md">
              {detail.icon}
              <span className="text-slate-300">{detail.text}</span>
            </div>
          ))}
        </div>
        {status.error && (
          <p className="mt-4 text-xs text-red-400">Please try refreshing the page. If the problem persists, contact support.</p>
        )}
      </div>
    </div>
  );
};

export default InitialSetup;