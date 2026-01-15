import React from 'react';

const GlobalReport = React.forwardRef(({ title, headers, data, settings, filters }, ref) => {
  const companyInfo = settings?.check_config || {};

  const renderHeader = () => (
    <header className="flex justify-between items-start pb-4 border-b-2 border-black">
      <div>
        <h1 className="text-3xl font-bold text-black">{title || "Report"}</h1>
        {filters?.startDate && filters?.endDate && (
          <p className="text-gray-600">
            Period: {new Date(filters.startDate).toLocaleDateString()} - {new Date(filters.endDate).toLocaleDateString()}
          </p>
        )}
         {filters?.feeStartDate && filters?.feeEndDate && (
          <p className="text-gray-600">
            Period: {new Date(filters.feeStartDate).toLocaleDateString()} - {new Date(filters.feeEndDate).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="text-right">
        {companyInfo.name && <h2 className="text-lg font-bold text-gray-800">{companyInfo.name}</h2>}
        {companyInfo.address1 && <p className="text-gray-600">{companyInfo.address1}</p>}
        {companyInfo.address2 && <p className="text-gray-600">{companyInfo.address2}</p>}
        <p className="text-gray-600 mt-2">Generated on: {new Date().toLocaleDateString()}</p>
      </div>
    </header>
  );

  const renderTable = () => {
    if (!data || data.length === 0) {
      return <p className="text-center my-8">No data to display for this report.</p>;
    }
    
    const formattedHeaders = headers.map(h => h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    
    const totalAmount = headers.includes('amount') ? data.reduce((acc, curr) => {
        return acc + (curr.status !== 'voided' ? parseFloat(curr.amount || 0) : 0);
    }, 0) : null;


    return (
      <section className="my-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              {formattedHeaders.map((h, i) => (
                <th key={i} className="p-2 text-left font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={row.id || rowIndex} className="border-b border-gray-200">
                {headers.map((headerKey, cellIndex) => {
                   let value = row[headerKey];
                   if (headerKey.toLowerCase().includes('date') && value) {
                       value = new Date(value).toLocaleString();
                   }
                   if(headerKey === 'customer') {
                     value = row.customer ? `${row.customer.first_name} ${row.customer.last_name}`: "N/A";
                   }
                   if(headerKey === 'customerName') {
                     value = row.customerName || "N/A";
                   }
                   if(headerKey === 'balance' || headerKey === 'amount') {
                     value = `$${parseFloat(value).toFixed(2)}`;
                   }
                   return <td key={cellIndex} className="p-2">{String(value ?? '')}</td>;
                })}
              </tr>
            ))}
          </tbody>
          {totalAmount !== null && (
            <tfoot>
                <tr className="border-t-2 border-primary mt-4">
                    <td className="px-2 py-4 font-bold text-right text-lg" colSpan={headers.indexOf('amount')}>Total</td>
                    <td className="px-2 py-4 font-bold text-left text-lg">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td colSpan={headers.length - headers.indexOf('amount') - 1}></td>
                </tr>
            </tfoot>
           )}
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
      {renderHeader()}
      {renderTable()}
      <footer className="text-center text-xs text-gray-500 pt-4 border-t border-gray-300 mt-auto">
        This is a computer-generated report.
      </footer>
    </div>
  );
});

export default GlobalReport;