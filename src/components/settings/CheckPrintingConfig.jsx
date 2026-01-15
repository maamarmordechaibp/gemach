
        import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Loader2, Upload, FileType, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const CheckPrintingConfig = () => {
    const [checkConfig, setCheckConfig] = useState({
        name: '',
        address1: '',
        address2: '',
        bank_name: '',
        bank_address1: '',
        bank_address2: '',
        routing_number: '',
        account_number: '',
        logo_url: '',
        font_url: '',
        reprint_fee_enabled: false,
    });
    const [nextCheckNumber, setNextCheckNumber] = useState('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const fetchCheckSettings = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('system_settings').select('key, value');
            if (error) throw error;

            const settingsMap = data.reduce((acc, setting) => {
                acc[setting.key] = setting.value;
                return acc;
            }, {});

            setCheckConfig(settingsMap.check_config || {
                name: '', address1: '', address2: '', bank_name: '', bank_address1: '',
                bank_address2: '', routing_number: '', account_number: '', logo_url: '',
                font_url: '', reprint_fee_enabled: false,
            });
            setNextCheckNumber(settingsMap.check_number?.next || '101');
        } catch (error) {
            toast({ title: 'Error fetching check settings', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCheckSettings();
    }, [fetchCheckSettings]);

    const handleConfigChange = (e) => {
        const { name, value } = e.target;
        setCheckConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleSwitchChange = (checked) => {
        setCheckConfig(prev => ({...prev, reprint_fee_enabled: checked}));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const updates = [
                supabase.from('system_settings').upsert({ key: 'check_config', value: checkConfig }, { onConflict: 'key' }),
                supabase.from('system_settings').upsert({ key: 'check_number', value: { next: parseInt(nextCheckNumber, 10) } }, { onConflict: 'key' })
            ];
            const results = await Promise.all(updates);
            results.forEach(res => { if (res.error) throw res.error; });
            toast({ title: 'Success', description: 'Check settings saved successfully.' });
        } catch (error) {
            toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleFontUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
    
        const allowedExtensions = ['.woff', '.woff2'];
        const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    
        if (!allowedExtensions.includes(fileExtension)) {
            toast({ title: 'Invalid File Type', description: 'Please upload a .woff or .woff2 file.', variant: 'destructive'});
            return;
        }
    
        setUploading(true);
        try {
            const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`;
            const filePath = `fonts/${uniqueFileName}`;
            
            // Try removing if a file with the same name exists (unlikely with UUID but good practice)
            await supabase.storage.from('templates').remove([filePath]).catch(() => {});
            
            const { error: uploadError } = await supabase.storage.from('templates').upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            });
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = supabase.storage.from('templates').getPublicUrl(filePath);
    
            setCheckConfig(prev => ({...prev, font_url: publicUrl }));
            toast({title: "Font uploaded", description: "Remember to save your settings."});
    
        } catch (error) {
            toast({ title: 'Font Upload Failed', description: error.message, variant: 'destructive'});
        } finally {
            setUploading(false);
            if(fileInputRef.current) fileInputRef.current.value = "";
        }
    };
    
    const removeFont = () => {
        setCheckConfig(prev => ({...prev, font_url: ''}));
        toast({title: 'Font removed', description: 'The custom font link has been cleared. Save settings to apply.'});
    };

    if (loading) {
        return <div className="flex justify-center items-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Your Company Name</label><Input name="name" value={checkConfig.name || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Your Address Line 1</label><Input name="address1" value={checkConfig.address1 || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Your Address Line 2 (City, State, Zip)</label><Input name="address2" value={checkConfig.address2 || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Bank Name</label><Input name="bank_name" value={checkConfig.bank_name || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Bank Address Line 1</label><Input name="bank_address1" value={checkConfig.bank_address1 || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Bank Address Line 2 (City, State, Zip)</label><Input name="bank_address2" value={checkConfig.bank_address2 || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Routing Number (MICR)</label><Input name="routing_number" value={checkConfig.routing_number || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Bank Account Number (MICR)</label><Input name="account_number" value={checkConfig.account_number || ''} onChange={handleConfigChange} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Next Check Number</label><Input type="number" value={nextCheckNumber} onChange={(e) => setNextCheckNumber(e.target.value)} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Bank Logo URL (Optional)</label><Input name="logo_url" value={checkConfig.logo_url || ''} onChange={handleConfigChange} /></div>
             </div>

            <div className="space-y-4">
                <h4 className="text-lg font-semibold">Check Font</h4>
                {checkConfig.font_url ? (
                    <div className="flex items-center gap-4 p-3 bg-secondary rounded-lg">
                        <FileType className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium truncate flex-1">{checkConfig.font_url.split('/').pop()}</span>
                        <Button variant="ghost" size="icon" onClick={removeFont}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-4">
                        <Button asChild variant="outline">
                            <label htmlFor="font-upload">
                                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Upload Font
                            </label>
                        </Button>
                         <input ref={fileInputRef} id="font-upload" type="file" className="hidden" onChange={handleFontUpload} accept=".woff,.woff2"/>
                        <p className="text-sm text-muted-foreground">Upload a .woff or .woff2 file.</p>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <h4 className="text-lg font-semibold">Reprint Fee</h4>
                <div className="flex items-center space-x-2">
                    <Switch
                        id="reprint-fee"
                        checked={checkConfig.reprint_fee_enabled}
                        onCheckedChange={handleSwitchChange}
                    />
                    <Label htmlFor="reprint-fee">Enable fee for reprinting a check</Label>
                </div>
                <p className="text-sm text-muted-foreground">If enabled, the standard transaction fee will be applied when a check is reprinted.</p>
            </div>


            <div className="pt-6 flex justify-end">
                <Button onClick={handleSave} disabled={loading || uploading} className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white">
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? 'Saving...' : 'Save All Settings'}
                </Button>
            </div>
        </div>
    );
};

export default CheckPrintingConfig;
      