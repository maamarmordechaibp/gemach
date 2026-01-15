
    import React from 'react';
    import { Printer, Search, Loader2, FileDown } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';

    const ChecksOutHeader = ({ searchTerm, setSearchTerm, onPrint, selectedCount, isPrinting }) => {
      return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-card border border-border rounded-lg">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground">Checks Out</h1>
            <p className="text-sm text-muted-foreground">Manage, print, and track outgoing checks.</p>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative flex-grow sm:flex-grow-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                placeholder="Search unprinted checks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-64"
              />
            </div>
            <Button onClick={onPrint} disabled={selectedCount === 0 || isPrinting} className="w-full sm:w-auto">
              {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              {isPrinting ? `Generating...` : `Generate Doc (${selectedCount})`}
            </Button>
          </div>
        </div>
      );
    };

    export default ChecksOutHeader;
  