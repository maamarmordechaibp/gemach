import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { Users, ArrowLeftRight } from 'lucide-react';
import LoansDashboard from './loans/LoansDashboard';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ title, value, icon, color, onClick }) => (
  <motion.div
    whileHover={{ scale: 1.03 }}
    className="bg-card/50 border border-border rounded-xl p-6 flex flex-col justify-between gap-4 cursor-pointer"
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div className={`p-3 rounded-lg bg-gradient-to-br ${color}`}>
        {icon}
      </div>
    </div>
    <div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-muted-foreground text-sm font-medium">{title}</p>
    </div>
  </motion.div>
);

const Dashboard = () => {
  const { customers, checksIn, checksOut, loading } = useData();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    if (loading || !customers || !checksIn || !checksOut) return { customers: 0, pendingChecksIn: 0, pendingChecksOut: 0 };
    return {
      customers: customers.length,
      pendingChecksIn: checksIn.filter(c => c.status === 'pending').length,
      pendingChecksOut: checksOut.filter(c => c.status === 'pending').length,
    };
  }, [customers, checksIn, checksOut, loading]);
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's a summary of your activities.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          title="Total Customers" 
          value={stats.customers} 
          icon={<Users className="h-6 w-6 text-white" />}
          color="from-purple-500 to-indigo-500"
          onClick={() => navigate('/customers')}
        />
        <StatCard 
          title="Pending Checks In" 
          value={stats.pendingChecksIn} 
          icon={<ArrowLeftRight size={24} className="transform -rotate-45 text-white"/>}
          color="from-green-500 to-teal-500"
          onClick={() => navigate('/checks-in')}
        />
        <StatCard 
          title="Pending Checks Out" 
          value={stats.pendingChecksOut} 
          icon={<ArrowLeftRight size={24} className="transform rotate-[135deg] text-white"/>}
          color="from-red-500 to-orange-500"
          onClick={() => navigate('/checks-out')}
        />
      </div>
      
      <LoansDashboard />

    </div>
  );
};

export default Dashboard;