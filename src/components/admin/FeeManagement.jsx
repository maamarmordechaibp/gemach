
import React from 'react';
import { motion } from 'framer-motion';
import TransactionFees from '@/components/settings/TransactionFees';

const FeeManagement = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8"
    >
      <h1 className="text-3xl font-bold text-foreground">Fee Management</h1>
      <p className="text-muted-foreground">
        Configure all transaction-related fees for the system.
      </p>
      <div className="p-6 bg-card border border-border rounded-lg">
        <TransactionFees />
      </div>
    </motion.div>
  );
};

export default FeeManagement;
