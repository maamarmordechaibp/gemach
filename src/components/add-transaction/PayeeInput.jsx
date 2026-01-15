import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Globe, User, History, Save, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from '@/components/ui/use-toast';

const PayeeInput = ({ value, onChange, onSaveOptionChange, customerId }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [isNewPayee, setIsNewPayee] = useState(false);

  const fetchSuggestions = useCallback(async (searchTerm) => {
    if (searchTerm.length < 2) {
      setSuggestions([]);
      return;
    }
    const { data, error } = await supabase.rpc('get_payee_suggestions', {
      p_customer_id: customerId,
      p_search_term: searchTerm,
    });
    if (error) {
      console.error('Error fetching payee suggestions:', error);
      setSuggestions([]);
    } else {
      setSuggestions(data);
      const exactMatch = data.some(s => s.payee_name.toLowerCase() === searchTerm.toLowerCase());
      setIsNewPayee(!exactMatch);
      setShowSaveOptions(!exactMatch);
    }
  }, [customerId]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (value) {
        fetchSuggestions(value);
      } else {
        setSuggestions([]);
        setShowSaveOptions(false);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [value, fetchSuggestions]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (suggestion) => {
    onChange(suggestion.payee_name);
    setSuggestions([]);
    setShowSuggestions(false);
    setShowSaveOptions(false);
    onSaveOptionChange('once'); // It exists, so default to one-time use
  };
  
  const handleSaveSelection = async (saveOption) => {
    onSaveOptionChange(saveOption);

    if (saveOption === 'public' || saveOption === 'private') {
      try {
        const { error } = await supabase.functions.invoke('save-payee', {
          body: {
            payeeName: value,
            isPublic: saveOption === 'public',
            customerId: customerId,
          }
        });
        if (error) throw error;
        toast({ title: "Payee Saved", description: `"${value}" saved to ${saveOption} dictionary.` });
      } catch (error) {
        toast({ title: "Error", description: `Could not save payee: ${error.message}`, variant: 'destructive' });
      }
    }
    setShowSaveOptions(false);
  };


  return (
    <div className="relative">
      <Input
        type="text"
        placeholder="Pay to the order of"
        value={value}
        onChange={handleInputChange}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        className="pr-24"
      />

      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-10 w-full mt-1 bg-secondary border border-border rounded-md shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-4 py-2 hover:bg-accent cursor-pointer flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  {suggestion.is_public ? <Globe className="h-4 w-4 text-blue-400" /> : <User className="h-4 w-4 text-green-400" />}
                  {suggestion.payee_name}
                </span>
                <span className="text-xs text-muted-foreground">{suggestion.is_public ? 'Public' : 'Private'}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
      {showSaveOptions && isNewPayee && value.length > 2 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute right-1 top-1/2 -translate-y-1/2"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8">
                <Save className="h-4 w-4 mr-2" /> Save
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleSaveSelection('public')}>
                <Globe className="h-4 w-4 mr-2 text-blue-400" />
                Save to Public
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSaveSelection('private')}>
                <User className="h-4 w-4 mr-2 text-green-400" />
                Save for Myself
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSaveSelection('once')}>
                <Send className="h-4 w-4 mr-2 text-muted-foreground" />
                Use Once
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default PayeeInput;