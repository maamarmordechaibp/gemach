import React, { useState, useEffect, useCallback, useRef } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { toast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Plus, Upload, Trash2, FileText, Loader2, FileType, CheckCircle } from 'lucide-react';
    import { Input } from '@/components/ui/input';
    import PlaceholderList from './PlaceholderList';

    const TemplateManager = () => {
        const [templates, setTemplates] = useState([]);
        const [loading, setLoading] = useState(true);
        const [uploading, setUploading] = useState(false);
        const [newTemplate, setNewTemplate] = useState({ name: '', type: 'check', file: null });
        const fileInputRef = useRef(null);

        const fetchTemplates = useCallback(async () => {
            setLoading(true);
            const { data, error } = await supabase.from('document_templates').select('*').order('created_at', { ascending: false });
            if (error) {
                toast({ title: 'Error fetching templates', description: error.message, variant: 'destructive' });
            } else {
                setTemplates(data);
            }
            setLoading(false);
        }, []);

        useEffect(() => {
            fetchTemplates();
        }, [fetchTemplates]);
        
        const handleFileChange = (e) => {
            const file = e.target.files[0];
            if (file && file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                setNewTemplate(prev => ({ ...prev, file }));
            } else if (file) {
                toast({ title: 'Invalid File Type', description: 'Please select a .docx file.', variant: 'destructive' });
                e.target.value = null;
            }
        };

        const handleUpload = async (e) => {
            e.preventDefault();
            if (!newTemplate.file || !newTemplate.name || !newTemplate.type) {
                toast({ title: 'Missing Information', description: 'Please provide a name, type, and file for the template.', variant: 'destructive' });
                return;
            }

            setUploading(true);
            try {
                const fileExt = newTemplate.file.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`;
                const filePath = `${newTemplate.type}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('templates')
                    .upload(filePath, newTemplate.file);

                if (uploadError) {
                    throw new Error(`Storage upload failed: ${uploadError.message}`);
                }

                const { data: { publicUrl } } = supabase.storage.from('templates').getPublicUrl(filePath);

                if (!publicUrl) {
                    throw new Error('Could not get public URL for the uploaded file.');
                }

                const { error: dbError } = await supabase
                    .from('document_templates')
                    .insert({
                        name: newTemplate.name,
                        type: newTemplate.type,
                        template_url: publicUrl
                    });

                if (dbError) {
                    await supabase.storage.from('templates').remove([filePath]);
                    throw new Error(`Database insert failed: ${dbError.message}`);
                }

                toast({ title: 'Success', description: 'Template uploaded successfully.' });
                fetchTemplates();
                setNewTemplate({ name: '', type: 'check', file: null });
                if(fileInputRef.current) fileInputRef.current.value = "";
            } catch (error) {
                toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
            } finally {
                setUploading(false);
            }
        };

        const handleDelete = async (templateId, templateUrl) => {
            if (!templateUrl) {
                toast({ title: 'Error', description: 'Template URL is missing, cannot delete from storage.', variant: 'destructive' });
                return;
            }

            try {
                const filePath = new URL(templateUrl).pathname.split('/templates/')[1];
                if (filePath) {
                    const { error: storageError } = await supabase.storage.from('templates').remove([filePath]);
                    if (storageError) {
                        throw new Error(`Storage deletion failed: ${storageError.message}`);
                    }
                }

                const { error: dbError } = await supabase.from('document_templates').delete().eq('id', templateId);
                if (dbError) {
                    throw new Error(`Database deletion failed: ${dbError.message}`);
                }
                
                toast({ title: 'Success', description: 'Template deleted.' });
                fetchTemplates();
            } catch (error) {
                toast({ title: 'Deletion Failed', description: error.message, variant: 'destructive' });
            }
        };


        return (
            <div className="space-y-6">
                <div className="bg-card/50 border border-border p-6 rounded-lg">
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-4"><Plus /> Add New Template</h3>
                    <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-1">
                            <label htmlFor="template-name" className="block text-sm font-medium text-muted-foreground mb-1">Template Name</label>
                            <Input id="template-name" type="text" value={newTemplate.name} onChange={e => setNewTemplate(prev => ({ ...prev, name: e.target.value }))} required />
                        </div>
                        <div className="md:col-span-1">
                            <label htmlFor="template-type" className="block text-sm font-medium text-muted-foreground mb-1">Type</label>
                            <select id="template-type" value={newTemplate.type} onChange={e => setNewTemplate(prev => ({ ...prev, type: e.target.value }))} className="w-full bg-input border border-input rounded-md p-2 h-10">
                                <option value="check">Check Template</option>
                                <option value="customer_document">Customer Document</option>
                            </select>
                        </div>
                         <div className="md:col-span-1 flex items-center">
                            <label htmlFor="template-file" className="w-full cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 rounded-md p-2 text-center flex items-center justify-center gap-2">
                                <Upload className="h-4 w-4" />
                                {newTemplate.file ? 'File Selected' : 'Choose .docx File'}
                            </label>
                            <input id="template-file" ref={fileInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileChange} className="hidden" />
                        </div>
                        <Button type="submit" disabled={uploading || !newTemplate.file} className="w-full">
                            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : <> <CheckCircle className="mr-2 h-4 w-4"/> Upload Template</>}
                        </Button>
                    </form>
                    {newTemplate.file && <p className="text-sm text-muted-foreground mt-2">Selected: {newTemplate.file.name}</p>}
                </div>

                 <PlaceholderList />

                <div>
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-4"><FileText /> Existing Templates</h3>
                    {loading ? (
                        <div className="flex justify-center items-center h-32">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {templates.length > 0 ? templates.map(template => (
                                <div key={template.id} className="bg-card/50 border border-border p-4 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <FileType className="h-6 w-6 text-primary" />
                                        <div>
                                            <p className="font-bold">{template.name}</p>
                                            <p className="text-sm text-muted-foreground capitalize">{template.type.replace(/_/g, ' ')}</p>
                                        </div>
                                    </div>
                                    <Button variant="destructive" size="sm" onClick={() => handleDelete(template.id, template.template_url)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            )) : (
                               <p className="text-center text-muted-foreground py-8">No templates found.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    export default TemplateManager;