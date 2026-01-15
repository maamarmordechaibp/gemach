import React from 'react';
import { motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { Bell, AlertTriangle, CheckCircle, Package, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const Alerts = () => {
    const { alerts, refreshData, loading } = useData();

    const handleResolve = async (id) => {
        const { error } = await supabase
            .from('alerts')
            .update({ is_resolved: true })
            .eq('id', id);

        if (error) {
            toast({ title: "Error", description: `Failed to resolve alert: ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Success", description: "Alert has been marked as resolved." });
            refreshData();
        }
    };

    const unresolvedAlerts = alerts.filter(alert => !alert.is_resolved);

    const getIcon = (type) => {
        switch(type) {
            case 'overdue_loan': return <Coins className="h-5 w-5 text-red-400" />;
            case 'stale_check': return <Package className="h-5 w-5 text-yellow-400" />;
            default: return <AlertTriangle className="h-5 w-5 text-gray-400" />;
        }
    }

    if (loading) {
        return <div className="text-center p-10">Loading alerts...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Bell className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Alerts Center</h1>
                    <p className="text-muted-foreground">Review and resolve system-generated alerts.</p>
                </div>
            </div>

            <motion.div
                className="bg-card backdrop-blur-xl border border-border rounded-xl p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                {unresolvedAlerts.length > 0 ? (
                    <div className="space-y-4">
                        {unresolvedAlerts.map((alert) => (
                            <motion.div
                                key={alert.id}
                                className={cn(
                                  "flex items-start justify-between p-4 rounded-lg border-l-4",
                                  alert.type === 'overdue_loan' && 'border-red-500 bg-red-900/20',
                                  alert.type === 'stale_check' && 'border-yellow-500 bg-yellow-900/20'
                                )}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="flex items-start gap-4">
                                    {getIcon(alert.type)}
                                    <div>
                                        <p className="font-semibold text-foreground">{alert.message}</p>
                                        <p className="text-sm text-muted-foreground">
                                            Generated on: {new Date(alert.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResolve(alert.id)}
                                    className="text-green-400 hover:bg-green-500/10 hover:text-green-300"
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Mark as Resolved
                                </Button>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
                        <h2 className="mt-4 text-2xl font-bold text-foreground">All Clear!</h2>
                        <p className="mt-2 text-muted-foreground">You have no unresolved alerts.</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default Alerts;