
    import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
        import { supabase } from '@/lib/customSupabaseClient';
        import { useLog } from '@/contexts/LogContext';

        const DataContext = createContext();

        export const useData = () => useContext(DataContext);

        export const DataProvider = ({ children, session }) => {
          const [customers, setCustomers] = useState([]);
          const [transactions, setTransactions] = useState([]);
          const [checksIn, setChecksIn] = useState([]);
          const [checksOut, setChecksOut] = useState([]);
          const [loans, setLoans] = useState([]);
          const [alerts, setAlerts] = useState([]);
          const [settings, setSettings] = useState({});
          const [loading, setLoading] = useState(true);
          const { addLog } = useLog();

          const fetchData = useCallback(async () => {
            if (!session) {
              setLoading(false);
              return;
            }
            setLoading(true);
            addLog("Starting data fetch...", 'info');

            try {
              const [
                { data: customersData, error: customersError },
                { data: transactionsData, error: transactionsError },
                { data: checksInData, error: checksInError },
                { data: checksOutData, error: checksOutError },
                { data: loansData, error: loansError },
                { data: alertsData, error: alertsError },
                { data: documentTemplatesData, error: documentTemplatesError },
                { data: systemSettingsData, error: systemSettingsError },
              ] = await Promise.all([
                supabase.from('customers').select('*'),
                supabase.from('transactions').select('*'),
                supabase.from('checks_in').select('*'),
                supabase.from('checks_out').select('*'),
                supabase.from('loans').select('*'),
                supabase.from('alerts').select('*'),
                supabase.from('document_templates').select('*'),
                supabase.from('system_settings').select('key, value'),
              ]);

              const errors = { customersError, transactionsError, checksInError, checksOutError, loansError, alertsError, documentTemplatesError, systemSettingsError };
              Object.entries(errors).forEach(([key, error]) => {
                  if (error) {
                      addLog(`Error fetching ${key.replace('Error', '')}: ${error.message}`, 'error', error);
                      throw error;
                  }
              });

              setCustomers(customersData || []);
              setTransactions(transactionsData || []);
              setChecksIn(checksInData || []);
              setChecksOut(checksOutData || []);
              setLoans(loansData || []);
              setAlerts(alertsData || []);
              const combinedSettings = {
                ...(systemSettingsData ? systemSettingsData.reduce((acc, s) => ({...acc, [s.key]: s.value}), {}) : {}),
                document_templates: documentTemplatesData || []
              };
              setSettings(combinedSettings);
              addLog("Data fetch successful.", 'success');

            } catch (error) {
              console.error("Error fetching data:", error.message);
              addLog("A critical error occurred during data fetching. Some data may be missing.", 'error', { message: error.message });
            } finally {
              setLoading(false);
            }
          }, [session, addLog]);

          useEffect(() => {
            if (session) {
              fetchData();
            }
          }, [session, fetchData]);
          
          const refreshData = fetchData;
          
          const getCustomerName = useCallback((accountNumber) => {
            if (!customers) return '...';
            const customer = customers.find(c => c.account_number === accountNumber);
            return customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown';
          }, [customers]);

          const value = {
            customers,
            transactions,
            checksIn,
            checksOut,
            loans,
            alerts,
            settings,
            loading,
            refreshData,
            getCustomerName,
          };

          return (
            <DataContext.Provider value={value}>
              {children}
            </DataContext.Provider>
          );
        };
  