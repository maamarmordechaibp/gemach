
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Save, Trash2, FileSignature, Clipboard } from 'lucide-react';

const TemplateManager = () => {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('document_templates').select('*');
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

  const handleSelectTemplate = (template) => {
    setSelectedTemplate({ ...template });
  };

  const handleAddNew = () => {
    setSelectedTemplate({
      id: null,
      name: 'New Template',
      type: 'notification',
      content: '<h1>New Template</h1><p>Start editing here...</p>',
      fields: ['customer_name', 'customer_account_number', 'date', 'current_balance']
    });
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    setIsSaving(true);
    const { id, created_at, updated_at, ...dataToSave } = selectedTemplate;

    let response;
    if (id) {
      response = await supabase.from('document_templates').update(dataToSave).eq('id', id).select().single();
    } else {
      response = await supabase.from('document_templates').insert(dataToSave).select().single();
    }

    if (response.error) {
      toast({ title: 'Error saving template', description: response.error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Template saved successfully.' });
      setSelectedTemplate(response.data);
      fetchTemplates();
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedTemplate || !selectedTemplate.id) return;
    const { error } = await supabase.from('document_templates').delete().eq('id', selectedTemplate.id);
    if (error) {
      toast({ title: 'Error deleting template', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Template deleted.' });
      setSelectedTemplate(null);
      fetchTemplates();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(`{{${text}}}`);
    toast({ title: 'Copied!', description: `{{${text}}} copied to clipboard.` });
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      <div className="md:col-span-1 flex flex-col space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Templates</h2>
          <Button size="sm" onClick={handleAddNew}><Plus className="h-4 w-4 mr-2" /> New</Button>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 space-y-1 overflow-y-auto">
          {templates.map(template => (
            <div
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className={`p-3 rounded-md cursor-pointer transition-colors ${selectedTemplate?.id === template.id ? 'bg-primary/20' : 'hover:bg-accent'}`}
            >
              <p className="font-semibold">{template.name}</p>
              <p className="text-sm text-muted-foreground capitalize">{template.type}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="md:col-span-2 bg-card border border-border rounded-lg p-6 flex flex-col">
        {selectedTemplate ? (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold flex items-center gap-2"><FileSignature /> Editor</h3>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!selectedTemplate.id}><Trash2 className="h-4 w-4 mr-2" /> Delete</Button>
                <Button onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" /> {isSaving ? 'Saving...' : 'Save'}</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input placeholder="Template Name" value={selectedTemplate.name} onChange={e => setSelectedTemplate(p => ({ ...p, name: e.target.value }))} />
              <Input placeholder="Template Type" value={selectedTemplate.type} onChange={e => setSelectedTemplate(p => ({ ...p, type: e.target.value }))} />
            </div>
            <Textarea
              placeholder="Template content (HTML allowed)"
              value={selectedTemplate.content}
              onChange={e => setSelectedTemplate(p => ({ ...p, content: e.target.value }))}
              className="flex-grow font-mono text-sm"
              rows={15}
            />
            <div>
              <h4 className="font-semibold mb-2">Available Placeholders</h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.fields?.map(field => (
                  <Button key={field} variant="outline" size="sm" onClick={() => copyToClipboard(field)}>
                    {`{{${field}}}`} <Clipboard className="h-3 w-3 ml-2" />
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <FileSignature className="h-16 w-16 mb-4" />
            <h3 className="text-xl font-bold">Select a template to edit</h3>
            <p>Or create a new one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateManager;
