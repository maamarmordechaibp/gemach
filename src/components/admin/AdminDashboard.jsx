
import React from 'react';
import { motion } from 'framer-motion';

const AdminDashboard = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8"
    >
      <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
      <p className="text-muted-foreground">
        Welcome to the admin area. More widgets and stats coming soon!
      </p>
      <div className="p-6 bg-card border border-border rounded-lg">
        <p className="text-center text-muted-foreground">
          🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀
        </p>
      </div>
    </motion.div>
  );
};

export default AdminDashboard;
