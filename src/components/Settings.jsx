
    import React, { useState, useEffect } from 'react';
        import { motion } from 'framer-motion';
        import { Settings as SettingsIcon, Palette, Users, FileText, Package, DollarSign, FileSignature, AlertCircle } from 'lucide-react';
        import { useAuth } from '@/contexts/SupabaseAuthContext';
        import ThemeSettings from '@/components/settings/ThemeSettings';
        import UserManagement from '@/components/settings/UserManagement';
        import CheckPrintingConfig from '@/components/settings/CheckPrintingConfig';
        import CheckInventory from '@/components/settings/CheckInventory';
        import TransactionFees from '@/components/settings/TransactionFees';
        import TemplateManager from '@/components/settings/TemplateManager';
        import HoldSettings from '@/components/settings/HoldSettings';
        import { Loader2 } from 'lucide-react';

        const Settings = () => {
          const { isAdmin, loading: authLoading } = useAuth();
          const [isReady, setIsReady] = useState(false);

          useEffect(() => {
            if (!authLoading) {
              setIsReady(true);
            }
          }, [authLoading]);

          if (!isReady) {
            return (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            );
          }

          return (
            <div className="space-y-8 max-w-4xl mx-auto">
              <div className="flex items-center gap-4">
                <SettingsIcon className="h-8 w-8 text-primary" />
                <div>
                  <h1 className="text-3xl font-bold text-foreground">System Settings</h1>
                  <p className="text-muted-foreground">Manage application-wide configurations.</p>
                </div>
              </div>
              
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-8 space-y-6">
                <h2 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" /> Theme Customization
                </h2>
                <ThemeSettings />
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-8 space-y-6">
                <h2 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> User Management
                </h2>
                <UserManagement />
              </motion.div>
              
              {isAdmin && (
                <>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-8 space-y-6">
                    <h2 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-primary" /> Transaction Fees
                    </h2>
                    <TransactionFees />
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-8 space-y-6">
                    <h2 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" /> Check Printing Configuration
                    </h2>
                    <CheckPrintingConfig />
                  </motion.div>
                  
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-8 space-y-6">
                    <h2 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" /> Check Inventory
                    </h2>
                    <CheckInventory />
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-8 space-y-6">
                      <h2 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-primary" /> Hold Settings
                      </h2>
                      <HoldSettings />
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-8 space-y-6">
                    <h2 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                        <FileSignature className="h-5 w-5 text-primary" /> Document Templates
                    </h2>
                    <TemplateManager />
                  </motion.div>
                </>
              )}
            </div>
          );
        };

        export default Settings;
  