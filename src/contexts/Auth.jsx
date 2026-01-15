import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const storedSession = JSON.parse(localStorage.getItem('session'));
      if (storedSession) {
        setSession(storedSession);
        setUser(storedSession.user);
        setIsAdmin(storedSession.user.role === 'admin');
      }
    } catch (error) {
      console.error("Failed to parse session from localStorage", error);
      localStorage.removeItem('session');
    }
    setLoading(false);
  }, []);

  const proxySignIn = async (email, password) => {
    // This is a mock sign-in for local development.
    // In a real scenario without Supabase, you'd have a different auth system.
    if (email === 'admin@example.com' && password === 'password') {
      const mockUser = { id: 'local-admin-user', email: 'admin@example.com', role: 'admin' };
      const mockSession = { user: mockUser };
      localStorage.setItem('session', JSON.stringify(mockSession));
      setSession(mockSession);
      setUser(mockUser);
      setIsAdmin(true);
      toast({ title: 'Signed in as Admin' });
    } else if (email === 'user@example.com' && password === 'password') {
       const mockUser = { id: 'local-user', email: 'user@example.com', role: 'user' };
       const mockSession = { user: mockUser };
       localStorage.setItem('session', JSON.stringify(mockSession));
       setSession(mockSession);
       setUser(mockUser);
       setIsAdmin(false);
       toast({ title: 'Signed in as User' });
    } else {
      toast({
        variant: "destructive",
        title: "Sign in Failed",
        description: "Invalid credentials for local mode. Use admin@example.com or user@example.com with password 'password'.",
      });
    }
  };
  
  const signOut = useCallback(async () => {
    localStorage.removeItem('session');
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    toast({ title: "Signed out successfully" });
  }, [toast]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    isAdmin,
    proxySignIn,
    signOut,
  }), [user, session, loading, isAdmin, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};