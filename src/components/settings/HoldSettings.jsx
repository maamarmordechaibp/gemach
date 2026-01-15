
    import React, { useState, useEffect, useCallback } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { toast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Switch } from '@/components/ui/switch';
    import { Label } from '@/components/ui/label';
    import { Save, Loader2, AlertCircle } from 'lucide-react';
    import { useData } from '@/contexts/DataContext';

    const HoldSettings = () => {
        const { settings, refreshData } = useData();
        const [holdSettings, setHoldSettings] = useState({
            enabled: false,
            bounce_threshold: 3,
            period_days: 90
        });
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            if (settings.hold_settings) {
                setHoldSettings(settings.hold_settings);
            }
        }, [settings.hold_settings]);

        const handleSettingChange = (key, value) => {
            setHoldSettings(prev => ({ ...prev, [key]: value }));
        };

        const handleSave = async () => {
            setLoading(true);
            try {
                const { error } = await supabase
                    .from('system_settings')
                    .upsert({ key: 'hold_settings', value: holdSettings }, { onConflict: 'key' });

                if (error) throw error;
                toast({ title: 'Success', description: 'Hold settings saved successfully.' });
                refreshData();
            } catch (error) {
                toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };

        return (
            <div className="space-y-6">
                <div className="flex items-center space-x-2">
                    <Switch
                        id="hold-enabled"
                        checked={holdSettings.enabled}
                        onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
                    />
                    <Label htmlFor="hold-enabled">Enable Automatic "On Hold" Prompt</Label>
                </div>
                {holdSettings.enabled && (
                    <div className="space-y-4 pl-6 border-l-2 border-border/50 ml-2">
                        <p className="text-sm text-muted-foreground">
                            If a customer has a history of bounced checks, the system will prompt you to place their new checks on hold.
                        </p>
                        <div className="flex items-center gap-4">
                            <div>
                                <Label htmlFor="bounce_threshold">Bounce Threshold</Label>
                                <Input
                                    id="bounce_threshold"
                                    type="number"
                                    value={holdSettings.bounce_threshold}
                                    onChange={(e) => handleSettingChange('bounce_threshold', parseInt(e.target.value, 10))}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="period_days">Time Period (Days)</Label>
                                <Input
                                    id="period_days"
                                    type="number"
                                    value={holdSettings.period_days}
                                    onChange={(e) => handleSettingChange('period_days', parseInt(e.target.value, 10))}
                                    className="mt-1"
                                />
                            </div>
                        </div>
                    </div>
                )}
                <div className="pt-4 flex justify-end">
                    <Button onClick={handleSave} disabled={loading} className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white">
                        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save Hold Settings
                    </Button>
                </div>
            </div>
        );
    };

    export default HoldSettings;
  