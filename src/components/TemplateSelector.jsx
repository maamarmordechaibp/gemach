
import React, { useState, useEffect } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
    import { Loader2, FileText, Download } from 'lucide-react';
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
      DialogTrigger,
      DialogFooter,
      DialogDescription,
    } from '@/components/ui/dialog';
    import { toast } from '@/components/ui/use-toast';
    import { saveAs } from 'file-saver';
    import { useData } from '@/contexts/DataContext';

    const TemplateSelector = ({ customerId, children, onSelectTemplate, docType, disabled = false }) => {
      const { settings } = useData();
      const [open, setOpen] = useState(false);
      const [templates, setTemplates] = useState([]);
      const [loading, setLoading] = useState(false);
      const [generating, setGenerating] = useState(false);
      const [selectedTemplateId, setSelectedTemplateId] = useState('');
      
      const today = new Date().toISOString().split('T')[0];
      const [dateRange, setDateRange] = useState({ from: '', to: today });
      const [txType, setTxType] = useState('all');

      const documentType = docType || 'customer_document';

      useEffect(() => {
        if (open) {
          setLoading(true);
          const filteredTemplates = (settings.document_templates || [])
            .filter(t => t.type === documentType);
          setTemplates(filteredTemplates);
          if (filteredTemplates.length > 0) {
            setSelectedTemplateId(String(filteredTemplates[0].id));
          }
          setLoading(false);
        }
      }, [open, documentType, settings.document_templates]);

      const handleGenerate = async () => {
        if (!selectedTemplateId) {
          toast({ title: 'No template selected', description: 'Please select a template.', variant: 'destructive' });
          return;
        }

        if (onSelectTemplate) {
            onSelectTemplate(selectedTemplateId);
            setOpen(false);
            return;
        }

        setGenerating(true);
        try {
          const filters = {
            date_from: dateRange.from,
            date_to: dateRange.to,
            type: txType,
          };

          const { data, error } = await supabase.functions.invoke('generate-customer-document', {
            body: { customerId, templateId: selectedTemplateId, filters },
            responseType: 'blob',
          });
          
          if (error) throw error;
          
          if (data instanceof Blob && data.type !== 'application/json') {
              const templateName = templates.find(t => t.id === selectedTemplateId)?.name || 'document';
              const fileName = `${templateName}.docx`;
              saveAs(data, fileName);
              toast({ title: 'Success', description: 'Document generated and download started.' });
              setOpen(false);
          } else {
            const errorText = await (data.text ? data.text() : "{}");
            const errorJson = JSON.parse(errorText || '{}');
            throw new Error(errorJson.error || "Invalid response from server. Expected a document file.");
          }

        } catch (error) {
          toast({ title: 'Generation Failed', description: `Error: ${error.message}`, variant: 'destructive' });
        } finally {
          setGenerating(false);
        }
      };

      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>{React.cloneElement(children, { disabled })}</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText /> Generate Document</DialogTitle>
              <DialogDescription>
                Select a template and filter options to generate a document.
              </DialogDescription>
            </DialogHeader>
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No templates found for this document type. Please upload one in Settings.</p>
            ) : (
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="template-select">Template</Label>
                  <select
                    id="template-select"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full bg-input border border-input rounded-md p-2 h-10 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                {documentType === 'customer_document' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                          <Label htmlFor="date-from">From</Label>
                          <Input id="date-from" type="date" value={dateRange.from} onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
                      </div>
                      <div>
                          <Label htmlFor="date-to">To</Label>
                          <Input id="date-to" type="date" value={dateRange.to} onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
                      </div>
                    </div>

                    <div>
                      <Label>Transaction Type</Label>
                      <RadioGroup value={txType} onValueChange={setTxType} className="flex items-center gap-4 mt-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all" id="r-all" />
                          <Label htmlFor="r-all">All</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="credit" id="r-credit" />
                          <Label htmlFor="r-credit">Credits Only</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="debit" id="r-debit" />
                          <Label htmlFor="r-debit">Debits Only</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={loading || generating || templates.length === 0}>
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {generating ? 'Generating...' : 'Generate & Download'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    };

    export default TemplateSelector;