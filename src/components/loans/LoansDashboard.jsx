import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { DollarSign, TrendingUp, AlertTriangle, CalendarClock } from 'lucide-react';

const StatCard = ({ icon, title, value, color }) => (
  <motion.div
    className="bg-card/50 border border-border rounded-xl p-6 flex items-center gap-4"
    whileHover={{ scale: 1.03 }}
  >
    <div className={`p-3 rounded-lg bg-gradient-to-br ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-muted-foreground text-sm font-medium">{title}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  </motion.div>
);

const LoansDashboard = () => {
  const { loans, loading } = useData();

  const stats = useMemo(() => {
    if (loading || !loans) return { totalOut: 0, overdueCount: 0, dueNextWeek: 0, dueNextMonth: 0 };

    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
    const nextMonth = new Date();
    nextMonth.setMonth(now.getMonth() + 1);

    const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'overdue');

    const totalOut = activeLoans.reduce((sum, loan) => sum + parseFloat(loan.amount), 0);
    const overdueCount = loans.filter(l => l.status === 'overdue').length;
    const dueNextWeek = activeLoans.filter(l => {
      const dueDate = new Date(l.due_date);
      return dueDate > now && dueDate <= nextWeek;
    }).length;
    const dueNextMonth = activeLoans.filter(l => {
      const dueDate = new Date(l.due_date);
      return dueDate > now && dueDate <= nextMonth;
    }).length;

    return { totalOut, overdueCount, dueNextWeek, dueNextMonth };
  }, [loans, loading]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Loan Portfolio Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<DollarSign className="h-6 w-6 text-white" />}
          title="Total Money Out"
          value={`$${stats.totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="from-green-500 to-teal-500"
        />
        <StatCard
          icon={<AlertTriangle className="h-6 w-6 text-white" />}
          title="Overdue Loans"
          value={stats.overdueCount}
          color="from-red-500 to-orange-500"
        />
        <StatCard
          icon={<CalendarClock className="h-6 w-6 text-white" />}
          title="Due Next 7 Days"
          value={stats.dueNextWeek}
          color="from-yellow-500 to-amber-500"
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6 text-white" />}
          title="Due Next 30 Days"
          value={stats.dueNextMonth}
          color="from-blue-500 to-indigo-500"
        />
      </div>
    </div>
  );
};

export default LoansDashboard;