import React from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronsUpDown, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied!", description: `"${text}" copied to clipboard.` });
};

const PlaceholderItem = ({ placeholder, description }) => (
  <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
    <div>
      <p className="font-mono text-primary text-sm">{placeholder}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(placeholder)}>
      <Copy className="h-4 w-4" />
    </Button>
  </div>
);

const PlaceholderList = () => {
  const checkPlaceholders = [
    { ph: "{{pay_to_order_of}}", desc: "The name of the person or company being paid." },
    { ph: "{{date}}", desc: "The date the check is issued." },
    { ph: "{{amount}}", desc: "The numeric value of the check (e.g., 123.45)." },
    { ph: "{{amount_in_words}}", desc: "The amount written out in words." },
    { ph: "{{check_number}}", desc: "The unique number of the check." },
    { ph: "{{memo}}", desc: "Optional note or reference for the check." },
  ];

  const companyPlaceholders = [
    { ph: "{{company_name}}", desc: "Your company's name, from settings." },
    { ph: "{{company_address1}}", desc: "Your company's address line 1." },
    { ph: "{{company_address2}}", desc: "Your company's address line 2." },
    { ph: "{{company_bank_name}}", desc: "Your company's bank name." },
    { ph: "{{company_routing_number}}", desc: "Your company's bank routing number." },
    { ph: "{{company_account_number}}", desc: "Your company's bank account number for checks." },
  ];
  
  const customerPlaceholders = [
    { ph: "{{customer_full_name}}", desc: "The customer's full name (first and last)." },
    { ph: "{{customer_first_name}}", desc: "The customer's first name." },
    { ph: "{{customer_last_name}}", desc: "The customer's last name." },
    { ph: "{{customer_account_number}}", desc: "The customer's account number." },
    { ph: "{{customer_phone_number}}", desc: "The customer's phone number." },
    { ph: "{{customer_balance}}", desc: "The customer's current account balance." },
  ];

  return (
    <div className="space-y-2 mt-6">
       <Collapsible>
        <CollapsibleTrigger className="flex justify-between items-center w-full text-lg font-semibold text-foreground p-3 bg-muted rounded-md">
          Available Template Placeholders
          <ChevronsUpDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="p-2 space-y-4">
            <div>
              <h4 className="font-semibold text-md mb-2 mt-4">Check Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {checkPlaceholders.map(p => <PlaceholderItem key={p.ph} placeholder={p.ph} description={p.desc} />)}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-md mb-2">Your Company Details</h4>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {companyPlaceholders.map(p => <PlaceholderItem key={p.ph} placeholder={p.ph} description={p.desc} />)}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-md mb-2">Customer Details (From whom the check is drawn)</h4>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {customerPlaceholders.map(p => <PlaceholderItem key={p.ph} placeholder={p.ph} description={p.desc} />)}
              </div>
            </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default PlaceholderList;
