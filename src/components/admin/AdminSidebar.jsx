
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Home, Users, ArrowRightLeft, FileText, Landmark, Settings, LogOut, PackagePlus, PackageMinus, Coins, DollarSign, LayoutDashboard, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AdminSidebar = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const userNavItems = [
    { to: '/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/add-transaction', icon: ArrowRightLeft, label: 'New Transaction' },
    { to: '/transactions', icon: FileText, label: 'Transactions' },
    { to: '/loans', icon: Coins, label: 'Loans' },
    { to: '/checks-in', icon: PackagePlus, label: 'Checks In' },
    { to: '/checks-out', icon: PackageMinus, label: 'Checks Out' },
    { to: '/reports', icon: Landmark, label: 'Reports' },
  ];

  const adminNavItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Admin Dashboard' },
    { to: '/admin/fees', icon: DollarSign, label: 'Fee Management' },
    { to: '/admin/templates', icon: FileSignature, label: 'Templates' },
    { to: '/settings', icon: Settings, label: 'System Settings' },
  ];

  const activeLinkClass = 'bg-primary/20 text-primary';
  const inactiveLinkClass = 'hover:bg-muted/50 hover:text-foreground text-muted-foreground';

  const NavGroup = ({ title, items }) => (
    <div>
      <h3 className="px-4 pt-4 pb-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">{title}</h3>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              isActive ? activeLinkClass : inactiveLinkClass
            }`
          }
        >
          <item.icon className="w-5 h-5 mr-3" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );

  return (
    <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/60">
      <div className="flex items-center justify-center h-20 border-b border-border/60">
        <h1 className="text-2xl font-bold text-foreground">FinanceApp</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <nav className="flex-1 px-4 py-6 space-y-4">
          <NavGroup title="Main Menu" items={userNavItems} />
          <NavGroup title="Admin" items={adminNavItems} />
        </nav>
      </div>
      <div className="px-4 py-6 border-t border-border/60">
        <Button onClick={handleSignOut} variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
