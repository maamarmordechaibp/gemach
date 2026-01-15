import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const signOut = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Sign out Failed",
        description: error.message || "Something went wrong",
      });
    }
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setLoading(false);
  }, [toast]);

  const handleSession = useCallback((currentSession) => {
    setSession(currentSession);
    const currentUser = currentSession?.user || null;
    setUser(currentUser);
    setIsAdmin(currentUser?.app_metadata?.role === 'admin');
    setLoading(false);
  }, []);
  
  useEffect(() => {
    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (_event === 'INITIAL_SESSION' || _event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
          handleSession(newSession);
        } else if (_event === 'SIGNED_OUT') {
          handleSession(null);
        }
      }
    );
    
    // Initial check in case onAuthStateChange doesn't fire immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [handleSession]);

  const signIn = useCallback(async (email, password) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign in Failed",
        description: error.message || "Something went wrong",
      });
      setLoading(false);
    } else if (data.session) {
       handleSession(data.session);
    } else {
       setLoading(false);
    }

    return { error };
  }, [toast, handleSession]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    isAdmin,
    signIn,
    signOut,
  }), [user, session, loading, isAdmin, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};