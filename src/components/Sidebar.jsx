import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Home, Users, ArrowRightLeft, FileText, Landmark, Settings, LogOut, PackagePlus, PackageMinus, Coins as HandCoins, AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
const Sidebar = ({
  isAdmin
}) => {
  const {
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };
  const navItems = [{
    to: '/dashboard',
    icon: Home,
    label: 'Dashboard'
  }, {
    to: '/customers',
    icon: Users,
    label: 'Customers'
  }, {
    to: '/add-transaction',
    icon: ArrowRightLeft,
    label: 'New Transaction'
  }, {
    to: '/transactions',
    icon: FileText,
    label: 'Transactions'
  }, {
    to: '/loans',
    icon: HandCoins,
    label: 'Loans'
  }, {
    to: '/checks-in',
    icon: PackagePlus,
    label: 'Checks In'
  }, {
    to: '/checks-out',
    icon: PackageMinus,
    label: 'Checks Out'
  }, {
    to: '/reports',
    icon: Landmark,
    label: 'Reports'
  }, {
    to: '/alerts',
    icon: AlertTriangle,
    label: 'Alerts'
  }];
  const adminNavItems = [{
    to: '/settings',
    icon: Settings,
    label: 'Settings'
  }];
  const activeLinkClass = 'bg-primary/20 text-primary';
  const inactiveLinkClass = 'hover:bg-muted/50 hover:text-foreground text-muted-foreground';
  return <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/60">
      <div className="flex items-center justify-center h-20 border-b border-border/60">
        <h1 className="text-2xl font-bold text-foreground">גמ"ח קרן מאיר ושרה</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map(item => <NavLink key={item.to} to={item.to} className={({
          isActive
        }) => `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? activeLinkClass : inactiveLinkClass}`}>
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>)}
        </nav>
        
        {isAdmin && <div className="px-4 py-2">
              <h3 className="mb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
              </h3>
              <nav className="flex-1 space-y-2">
              {adminNavItems.map(item => <NavLink key={item.to} to={item.to} className={({
            isActive
          }) => cn('flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors', !isAdmin && 'opacity-50 pointer-events-none', isActive ? activeLinkClass : inactiveLinkClass)} onClick={e => {
            if (!isAdmin) {
              e.preventDefault();
            }
          }}>
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.label}
                  </NavLink>)}
              </nav>
          </div>}

      </div>
      <div className="px-4 py-6 border-t border-border/60">
        <Button onClick={handleSignOut} variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </aside>;
};
export default Sidebar;