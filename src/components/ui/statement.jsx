import React, { useMemo } from 'react';

const Statement = React.forwardRef(({ title, customer, subAccounts, transactions, settings, filters }, ref) => {
    const totals = useMemo(() => {
        if (!transactions) return { credit: 0, debit: 0 };
        return transactions.reduce((acc, tx) => {
            if (tx.status !== 'voided') {
                if (tx.type === 'credit') {
                    acc.credit += parseFloat(tx.amount);
                } else if (tx.type === 'debit' || tx.type === 'fee') {
                    acc.debit += parseFloat(tx.amount);
                }
            }
            return acc;
        }, { credit: 0, debit: 0 });
    }, [transactions]);
    
    const companyInfo = settings?.check_config || {};

    const renderCustomerInfo = () => {
        if (!customer) return null;
        return (
            <div>
                <h1 className="text-3xl font-bold text-black">{customer.first_name} {customer.last_name}</h1>
                <p className="text-gray-600">Account: {customer.account_number}</p>
                {customer.phone_number && <p className="text-gray-600">Phone: {customer.phone_number}</p>}
                 {subAccounts && subAccounts.length > 0 && (
                    <div className="text-xs mt-2">
                        <p className="font-bold">Sub-Accounts Included:</p>
                        <ul className="list-disc pl-4">
                            {subAccounts.map(sa => <li key={sa.id}>{sa.first_name} {sa.last_name} ({sa.account_number})</li>)}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    const renderReportHeader = () => (
        <div>
            <h1 className="text-3xl font-bold text-black">{title || "Report"}</h1>
            {filters?.startDate && filters?.endDate && (
                <p className="text-gray-600">
                    Period: {new Date(filters.startDate).toLocaleDateString()} - {new Date(filters.endDate).toLocaleDateString()}
                </p>
            )}
        </div>
    );
    
    const renderSummary = () => {
        if (!customer) return null; // Only show summary for single customer statements
        return (
             <section className="my-8">
                <h3 className="text-xl font-semibold mb-4 border-b border-gray-400 pb-2 text-black">Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-gray-100 p-4 rounded">
                        <p className="text-sm text-gray-600">Total Credits</p>
                        <p className="text-xl font-bold text-green-600">${totals.credit.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-100 p-4 rounded">
                        <p className="text-sm text-gray-600">Total Debits & Fees</p>
                        <p className="text-xl font-bold text-red-600">${totals.debit.toFixed(2)}</p>
                    </div>
                     <div className="bg-blue-100 p-4 rounded">
                        <p className="text-sm text-gray-600">Current Balance</p>
                        <p className="text-xl font-bold text-blue-700">${parseFloat(customer.balance).toFixed(2)}</p>
                    </div>
                </div>
            </section>
        )
    };

    const renderTransactionsTable = () => {
        if (!transactions || transactions.length === 0) {
            return <p className="text-center my-8">No transactions to display for this period.</p>;
        }

        // Determine if we need to show customer names in the table (for general reports)
        const showCustomerColumn = !customer;

        return (
            <section className="my-8">
                <h3 className="text-xl font-semibold mb-4 border-b border-gray-400 pb-2 text-black">Transaction History</h3>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b-2 border-black">
                            <th className="p-2 text-left">Date</th>
                            {showCustomerColumn && <th className="p-2 text-left">Customer</th>}
                            <th className="p-2 text-left">Type</th>
                            <th className="p-2 text-left">Memo</th>
                            <th className="p-2 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(tx => (
                            <tr key={tx.id} className={`border-b border-gray-200 ${tx.status === 'voided' ? 'opacity-50' : ''}`}>
                                <td className="p-2">{new Date(tx.date).toLocaleDateString()}</td>
                                {showCustomerColumn && <td className="p-2">{tx.customer?.first_name} {tx.customer?.last_name || tx.customerName || ''}</td>}
                                <td className="p-2 capitalize">{tx.type}</td>
                                <td className="p-2">{tx.memo || tx.reason} {tx.status === 'voided' && '(VOIDED)'}</td>
                                <td className={`p-2 text-right font-mono ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                    {tx.type === 'credit' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        );
    };

    return (
        <div ref={ref} className="print-page bg-white text-black p-8 font-sans">
            <style>{`
                @media print {
                    .print-page { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>
            <header className="flex justify-between items-start pb-4 border-b-2 border-black">
                {customer ? renderCustomerInfo() : renderReportHeader()}
                <div className="text-right">
                    {companyInfo.name && <h2 className="text-lg font-bold text-gray-800">{companyInfo.name}</h2>}
                    {companyInfo.address1 && <p className="text-gray-600">{companyInfo.address1}</p>}
                    {companyInfo.address2 && <p className="text-gray-600">{companyInfo.address2}</p>}
                    <p className="text-gray-600 mt-2">Date: {new Date().toLocaleDateString()}</p>
                </div>
            </header>

            {renderSummary()}
            {renderTransactionsTable()}

            <footer className="text-center text-xs text-gray-500 pt-4 border-t border-gray-300 mt-auto">
                Thank you for your business.
            </footer>
        </div>
    );
});

export default Statement;