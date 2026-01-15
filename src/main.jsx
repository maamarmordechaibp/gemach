
    import React from 'react';
    import ReactDOM from 'react-dom/client';
    import App from '@/App';
    import '@/index.css';
    import { Toaster } from '@/components/ui/toaster';
    import { AuthProvider } from '@/contexts/SupabaseAuthContext';
    import { LogProvider } from '@/contexts/LogContext';
    import { supabase } from '@/lib/customSupabaseClient';

    // Expose Supabase client globally for testing
    window.supabase = supabase;

    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <AuthProvider>
          <LogProvider>
              <App />
          </LogProvider>
        </AuthProvider>
        <Toaster />
      </React.StrictMode>
    );
  