import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Menu, X, Home, Users, ArrowRightLeft, FileText, Landmark, Settings, LogOut, PackagePlus, PackageMinus, Coins as HandCoins, AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const MobileNav = ({ isAdmin }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/add-transaction', icon: ArrowRightLeft, label: 'New Transaction' },
    { to: '/transactions', icon: FileText, label: 'Transactions' },
    { to: '/loans', icon: HandCoins, label: 'Loans' },
    { to: '/checks-in', icon: PackagePlus, label: 'Checks In' },
    { to: '/checks-out', icon: PackageMinus, label: 'Checks Out' },
    { to: '/reports', icon: Landmark, label: 'Reports' },
    { to: '/alerts', icon: AlertTriangle, label: 'Alerts' },
  ];

  const adminNavItems = [
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const activeLinkClass = 'bg-primary/20 text-primary';
  const inactiveLinkClass = 'hover:bg-muted/50 hover:text-foreground text-muted-foreground';

  const NavLinkItem = ({ to, icon: Icon, label, onClick }) => (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center px-4 py-3 rounded-lg text-base font-medium transition-colors ${
          isActive ? activeLinkClass : inactiveLinkClass
        }`
      }
    >
      <Icon className="w-5 h-5 mr-4" />
      {label}
    </NavLink>
  );

  return (
    <>
      <header className="md:hidden flex items-center justify-between h-16 px-4 bg-card border-b border-border/60">
        <h1 className="text-xl font-bold text-foreground">FinanceApp</h1>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
      </header>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 flex flex-col bg-card"
          >
            <div className="flex items-center justify-between h-20 px-4 border-b border-border/60">
              <h1 className="text-2xl font-bold text-foreground">Menu</h1>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <nav className="flex-1 px-4 py-6 space-y-2">
                {navItems.map((item) => (
                  <NavLinkItem key={item.to} {...item} onClick={() => setIsOpen(false)} />
                ))}
              </nav>
              {isAdmin && (
                <div className="px-4 py-2">
                  <h3 className="mb-2 px-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
                    <Shield className="w-4 h-4 mr-2" />
                    Admin Panel
                  </h3>
                  <nav className="flex-1 space-y-2">
                    {adminNavItems.map((item) => (
                      <NavLinkItem key={item.to} {...item} onClick={() => setIsOpen(false)} />
                    ))}
                  </nav>
                </div>
              )}
            </div>
            <div className="px-4 py-6 border-t border-border/60">
              <Button onClick={handleSignOut} variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="w-5 h-5 mr-3" />
                Sign Out
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default MobileNav;