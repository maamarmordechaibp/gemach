import React, { useState, useMemo } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Plus, Search, Edit, Trash2, User, ArrowRight, Banknote, Users, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { toast } from '@/components/ui/use-toast';
    import CustomerModal from '@/components/CustomerModal';
    import { useData } from '@/contexts/DataContext';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useNavigate } from 'react-router-dom';

    const CustomerRow = ({ customer, level = 0, expandedRows, toggleRow, onSelect, onEdit, onDelete }) => {
      const isExpanded = expandedRows[customer.id];
      const hasSubAccounts = customer.sub_accounts && customer.sub_accounts.length > 0;
      
      return (
        <>
          <motion.tr 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="hover:bg-accent transition-colors"
          >
            <td className="px-6 py-4 text-foreground font-medium" style={{ paddingLeft: `${level * 24 + 24}px` }}>
              {customer.account_number}
            </td>
            <td className="px-6 py-4">
              <div className="flex items-center space-x-3">
                {hasSubAccounts ? (
                  <button onClick={() => toggleRow(customer.id)} className="p-1 rounded-full hover:bg-gray-600">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                ) : (
                  <span className="w-8"></span>
                )}
                <div className={`p-2 bg-gradient-to-r ${level > 0 ? 'from-teal-500 to-cyan-500' : 'from-purple-500 to-indigo-500'} rounded-full`}>
                  <User className="h-4 w-4 text-white" />
                </div>
                <span className="text-foreground">{customer.first_name} {customer.last_name}</span>
                {hasSubAccounts && (
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full flex items-center gap-1">
                    <Users size={12} /> {customer.sub_accounts.length}
                  </span>
                )}
              </div>
            </td>
            <td className="px-6 py-4 text-muted-foreground">{customer.phone_number || 'N/A'}</td>
            <td className="px-6 py-4">
              <span className={`font-medium ${customer.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${parseFloat(customer.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </td>
            <td className="px-6 py-4 text-right">
              <div className="flex items-center justify-end space-x-2">
                <Button variant="ghost" size="sm" onClick={() => onSelect(customer.id)} className="text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onEdit(customer)} className="text-muted-foreground hover:text-foreground"><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(customer.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </td>
          </motion.tr>
          <AnimatePresence>
            {isExpanded && hasSubAccounts && customer.sub_accounts.map(sub => (
              <CustomerRow 
                key={sub.id} 
                customer={{...sub, sub_accounts: []}} 
                level={level + 1}
                expandedRows={expandedRows}
                toggleRow={toggleRow}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </>
      );
    };

    const Customers = () => {
        const { customers, loading, refreshData } = useData();
        const navigate = useNavigate();
        const [searchTerm, setSearchTerm] = useState('');
        const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
        const [editingCustomer, setEditingCustomer] = useState(null);
        const [expandedRows, setExpandedRows] = useState({});

        const handleAddCustomer = () => {
            setEditingCustomer(null);
            setIsCustomerModalOpen(true);
        };

        const handleEditCustomer = (customer) => {
            setEditingCustomer(customer);
            setIsCustomerModalOpen(true);
        };

        const handleDeleteCustomer = async (customerId) => {
            const { error } = await supabase.from('customers').delete().eq('id', customerId);
            if (error) {
                toast({ title: "Error deleting customer", description: error.message, variant: "destructive" });
            } else {
                toast({ title: "Customer deleted", description: "The customer has been successfully removed." });
                refreshData();
            }
        };

        const handleSaveCustomer = async (customerData) => {
            const { id, ...dataToSave } = customerData;
            let error;

            if (id) {
                const { error: updateError } = await supabase.from('customers').update(dataToSave).eq('id', id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase.from('customers').insert(dataToSave);
                error = insertError;
            }

            if (error) {
                toast({ title: "Error saving customer", description: error.message, variant: "destructive" });
            } else {
                toast({ title: "Success", description: `Customer ${id ? 'updated' : 'added'} successfully.` });
                refreshData();
            }
            setIsCustomerModalOpen(false);
        };

        const handleCustomerSelect = (customerId) => {
            navigate(`/customers/${customerId}`);
        };

        const customersWithSubAccounts = useMemo(() => {
            if (!customers || customers.length === 0) return [];
            const customerMap = new Map(customers.map(c => [c.account_number, { ...c, sub_accounts: [] }]));
            
            customers.forEach(c => {
                if (c.parent_account_id && customerMap.has(c.parent_account_id)) {
                    const parent = customerMap.get(c.parent_account_id);
                    if (parent) {
                      parent.sub_accounts.push(c);
                    }
                }
            });
            return Array.from(customerMap.values()).filter(c => !c.parent_account_id);
        }, [customers]);

        const filteredCustomers = useMemo(() => {
            if (!customersWithSubAccounts) return [];
            const searchLower = searchTerm.toLowerCase();
            return customersWithSubAccounts.filter(customer =>
                (customer.first_name?.toLowerCase() || '').includes(searchLower) ||
                (customer.last_name?.toLowerCase() || '').includes(searchLower) ||
                (customer.account_number?.toString() || '').includes(searchTerm) ||
                (customer.phone_number && customer.phone_number.includes(searchTerm)) ||
                (customer.sub_accounts && customer.sub_accounts.some(sub =>
                    (sub.first_name?.toLowerCase() || '').includes(searchLower) ||
                    (sub.last_name?.toLowerCase() || '').includes(searchLower) ||
                    (sub.account_number?.toString() || '').includes(searchTerm)
                ))
            );
        }, [customersWithSubAccounts, searchTerm]);

        const toggleRow = (id) => {
            setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
        };

        const exportToCSV = () => {
            const headers = ['account_number', 'first_name', 'last_name', 'phone_number', 'balance', 'parent_account_id'];
            const csvRows = [headers.join(',')];
            const allCustomersToExport = [];

            const collectCustomers = (customerList) => {
                customerList.forEach(c => {
                    allCustomersToExport.push(c);
                    if(c.sub_accounts && c.sub_accounts.length > 0) {
                        collectCustomers(c.sub_accounts);
                    }
                });
            }
            collectCustomers(filteredCustomers);

            const processedCustomers = allCustomersToExport.map(customer => {
                const values = headers.map(header => {
                    let val = customer[header];
                    if (val === null || val === undefined) val = '';
                    if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
                    return val;
                });
                return values.join(',');
            });
            csvRows.push(...processedCustomers);

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'customers.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground mb-2">Customers</h1>
                        <p className="text-muted-foreground">Manage all customer accounts and sub-accounts.</p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={exportToCSV} variant="outline"><Download className="h-4 w-4 mr-2" />Export CSV</Button>
                        <Button onClick={() => navigate('/add-transaction')} className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"><Banknote className="h-4 w-4 mr-2" />Add Transaction</Button>
                        <Button onClick={handleAddCustomer} className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search customers by name, account #, or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="bg-card/50 backdrop-blur-xl border border-border rounded-xl overflow-hidden"
                    >
                        {filteredCustomers.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-secondary/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Account #</th>
                                            <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Name</th>
                                            <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Phone</th>
                                            <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Balance</th>
                                            <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {filteredCustomers.map(customer => (
                                            <CustomerRow 
                                                key={customer.id} 
                                                customer={customer} 
                                                expandedRows={expandedRows}
                                                toggleRow={toggleRow}
                                                onSelect={handleCustomerSelect}
                                                onEdit={handleEditCustomer}
                                                onDelete={handleDeleteCustomer}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <User className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-foreground mb-2">No customers found</h3>
                                <p className="text-muted-foreground mb-4">Add a new customer to get started.</p>
                                <Button onClick={handleAddCustomer} className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
                            </div>
                        )}
                    </motion.div>
                )}

                <CustomerModal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} onSave={handleSaveCustomer} customer={editingCustomer} />
            </div>
        );
    };

    export default Customers;