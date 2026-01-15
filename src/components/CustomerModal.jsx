import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, DollarSign, Phone, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useData } from '@/contexts/DataContext';

const CustomerModal = ({ isOpen, onClose, onSave, customer, initialData }) => {
  const { customers } = useData();
  const [formData, setFormData] = useState({});
  
  const getInitialFormData = () => ({
    account_number: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    balance: 0,
    parent_account_id: null,
    ...initialData
  });

  const fetchNextId = async (parentId) => {
    let rpcCall;
    if (parentId) {
      rpcCall = supabase.rpc('generate_next_sub_account_id', { parent_id: parentId });
    } else {
      rpcCall = supabase.rpc('generate_next_customer_id');
    }
    
    const { data, error } = await rpcCall;
    if (!error && data) {
        setFormData(prev => ({ ...prev, account_number: data }));
    } else if (error) {
        console.error("Error generating account ID:", error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setFormData({
          id: customer.id,
          account_number: customer.account_number || '',
          first_name: customer.first_name || '',
          last_name: customer.last_name || '',
          phone_number: customer.phone_number || '',
          balance: customer.balance || 0,
          parent_account_id: customer.parent_account_id || null
        });
      } else {
        const initialFormState = getInitialFormData();
        setFormData(initialFormState);
        if (!initialFormState.parent_account_id) {
            fetchNextId(null);
        }
      }
    }
  }, [customer, isOpen, initialData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, balance: parseFloat(formData.balance) || 0 });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
        const newState = { ...prev, [name]: value };
        if (name === 'parent_account_id' && !customer) {
            fetchNextId(value || null);
        }
        return newState;
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg">
                  <User className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">
                  {customer ? 'Edit Customer' : 'Add New Customer'}
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Sub-account of</label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <select
                      name="parent_account_id"
                      value={formData.parent_account_id || ''}
                      onChange={handleChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={!!customer}
                    >
                      <option value="">None (Main Account)</option>
                      {customers.filter(c => !c.parent_account_id && c.account_number !== formData.account_number).map(p => (
                        <option key={p.id} value={p.account_number}>
                          {p.first_name} {p.last_name} ({p.account_number})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Account Number</label>
                <input
                  type="text"
                  name="account_number"
                  value={formData.account_number}
                  onChange={handleChange}
                  required
                  disabled
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  placeholder="Generating..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter last name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleChange}
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter phone number"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Initial Balance</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="number"
                    name="balance"
                    value={formData.balance}
                    onChange={handleChange}
                    step="0.01"
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="0.00"
                    disabled={!!customer}
                  />
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600">
                  {customer ? 'Update' : 'Add'} Customer
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CustomerModal;