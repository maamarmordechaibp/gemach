
import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import Dashboard from '@/components/Dashboard';
import Customers from '@/components/Customers';
import CustomerDetail from '@/components/CustomerDetail';
import Transactions from '@/components/Transactions';
import AddTransaction from '@/components/AddTransaction';
import Reports from '@/components/Reports';
import GlobalReport from '@/components/GlobalReport';
import Settings from '@/components/Settings';
import Loans from '@/components/Loans';
import ChecksIn from '@/components/ChecksIn';
import ChecksOut from '@/components/ChecksOut';
import Alerts from '@/components/Alerts';

const MainLayout = ({ isAdmin }) => {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <MobileNav isAdmin={isAdmin} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/add-transaction" element={<AddTransaction />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/checks-in" element={<ChecksIn />} />
            <Route path="/checks-out" element={<ChecksOut />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/global-report" element={<GlobalReport />} />
            <Route path="/alerts" element={<Alerts />} />
            
            {isAdmin && (
              <>
                <Route path="/settings" element={<Settings />} />
              </>
            )}

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
