import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, PackagePlus, Bell, BellOff, Save } from 'lucide-react';

const CheckInventory = () => {
    const [checkInventory, setCheckInventory] = useState({ count: 0 });
    const [addStockAmount, setAddStockAmount] = useState('');
    const [inventoryAlert, setInventoryAlert] = useState({ enabled: false, threshold: 20 });
    const [loading, setLoading] = useState(true);

    const fetchInventorySettings = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('system_settings').select('key, value');
            if (error) throw error;

            const settingsMap = data.reduce((acc, setting) => {
                acc[setting.key] = setting.value;
                return acc;
            }, {});

            setCheckInventory(settingsMap.check_inventory || { count: 0 });
            setInventoryAlert(settingsMap.check_inventory_alert || { enabled: false, threshold: 20 });
        } catch (error) {
            toast({ title: 'Error fetching inventory settings', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInventorySettings();
    }, [fetchInventorySettings]);

    const handleInventoryAlertChange = (field, value) => {
        setInventoryAlert(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveAlertSettings = async () => {
        try {
            const { error } = await supabase.from('system_settings').upsert({ key: 'check_inventory_alert', value: inventoryAlert }, { onConflict: 'key' });
            if (error) throw error;
            toast({ title: 'Success', description: 'Alert settings saved.' });
        } catch (error) {
            toast({ title: 'Error saving alert settings', description: error.message, variant: 'destructive' });
        }
    };

    const handleAddStock = async () => {
        const amount = parseInt(addStockAmount, 10);
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'Invalid Amount', description: 'Please enter a positive number.', variant: 'destructive' });
            return;
        }
        const newCount = (checkInventory.count || 0) + amount;
        try {
            const { error } = await supabase.from('system_settings').upsert({ key: 'check_inventory', value: { count: newCount } }, { onConflict: 'key' });
            if (error) throw error;
            setCheckInventory({ count: newCount });
            setAddStockAmount('');
            toast({ title: 'Success', description: 'Check paper stock updated.' });
        } catch (error) {
            toast({ title: 'Error updating stock', description: error.message, variant: 'destructive' });
        }
    };

    if (loading) {
        return <p>Loading inventory settings...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                    <Package className="h-6 w-6 text-cyan-400" />
                    <p className="text-muted-foreground">Check papers remaining:</p>
                    <p className="text-2xl font-bold text-foreground">{checkInventory.count || 0}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input type="number" placeholder="Amount to add" value={addStockAmount} onChange={(e) => setAddStockAmount(e.target.value)} className="bg-input border-border w-32" />
                    <Button onClick={handleAddStock} className="bg-gradient-to-r from-cyan-500 to-blue-500">
                        <PackagePlus className="h-4 w-4 mr-2" />
                        Add Stock
                    </Button>
                </div>
            </div>
            <div className="pt-4 border-t border-border mt-6">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-3">
                    <Bell className="h-5 w-5 text-primary" /> Low Stock Alert
                </h3>
                <div className='flex items-center gap-4'>
                    <Button
                        onClick={() => handleInventoryAlertChange('enabled', !inventoryAlert.enabled)}
                        variant={inventoryAlert.enabled ? "default" : "outline"}
                        className="w-24"
                    >
                        {inventoryAlert.enabled ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
                        {inventoryAlert.enabled ? "On" : "Off"}
                    </Button>
                    {inventoryAlert.enabled && (
                        <div className='flex items-center gap-2'>
                            <label className="text-muted-foreground">Alert at:</label>
                            <Input
                                type="number"
                                value={inventoryAlert.threshold}
                                onChange={(e) => handleInventoryAlertChange('threshold', parseInt(e.target.value, 10))}
                                className="w-24 bg-input border-border"
                            />
                        </div>
                    )}
                    <Button onClick={handleSaveAlertSettings} size="sm">
                        <Save className="h-4 w-4 mr-2" />
                        Save Alert Setting
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CheckInventory;