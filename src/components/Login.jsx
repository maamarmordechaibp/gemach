
    import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Login = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    await signIn(email, password);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl shadow-2xl p-8 backdrop-blur-lg">
          <div className="text-center mb-8">
            <div className="inline-block p-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl mb-4">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">Check Cashing Services</h1>
            <p className="text-slate-400 mt-2">Please sign in to access your account.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-slate-700 border-slate-600"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-slate-700 border-slate-600"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-lg py-6"
            >
              {loading ? 'Signing In...' : 'Sign In'}
              {!loading && <LogIn className="h-5 w-5 ml-2" />}
            </Button>
          </form>
          
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
  