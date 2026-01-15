
    import React from 'react';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { DataProvider } from '@/contexts/DataContext';
    import { ThemeProvider } from '@/contexts/ThemeContext';
    import MainLayout from '@/components/MainLayout';
    import Login from '@/components/Login';
    import { Helmet } from 'react-helmet';
    import { Loader2 } from 'lucide-react';
    import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
    import { HoldProvider } from '@/contexts/HoldContext';

    const AppContent = () => {
      const { session, isAdmin } = useAuth();

      return (
        <Router>
          <DataProvider session={session}>
            <HoldProvider>
              <Routes>
                <Route path="/*" element={session ? <MainLayout isAdmin={isAdmin} /> : <Navigate to="/login" />} />
                <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
              </Routes>
            </HoldProvider>
          </DataProvider>
        </Router>
      );
    };

    function App() {
      const { loading: authLoading } = useAuth();

      return (
        <>
          <Helmet>
            <title>Check Cashing Service</title>
            <meta name="description" content="A comprehensive check cashing and financial services application." />
            <meta property="og:title" content="Check Cashing Service" />
            <meta property="og:description" content="A comprehensive check cashing and financial services application." />
          </Helmet>
          <ThemeProvider>
            {authLoading ? (
              <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <AppContent />
            )}
          </ThemeProvider>
        </>
      );
    }

    export default App;
  