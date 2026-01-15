

    import React from 'react';
    import { useData } from '@/contexts/DataContext';

    const CheckDocument = React.forwardRef(({ checks, config }, ref) => {
        const { customers } = useData();
        const fontUrl = config?.font_url;
        // Use the same font for MICR since there's only one font upload in settings
        const micrFontUrl = config?.font_url;
        
        // Debug: Log what data CheckDocument receives
        console.log('CheckDocument received checks:', checks);
        console.log('CheckDocument received config:', config);
        console.log('CheckDocument checks payee data:', checks?.map(c => ({ 
            id: c.id, 
            check_number: c.check_number, 
            pay_to_order_of: c.pay_to_order_of,
            amount: c.amount 
        })));

        // Number to words for check amount
        const numberToWords = (numStr) => {
            const num = parseFloat(numStr);
            if (isNaN(num)) return '';
            const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
                'seventeen', 'eighteen', 'nineteen'];
            const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
            function convertGroup(n) {
                let result = '';
                if (n >= 100) {
                    result += ones[Math.floor(n / 100)] + ' hundred ';
                    n %= 100;
                }
                if (n >= 20) {
                    result += tens[Math.floor(n / 10)];
                    if (n % 10 > 0) result += '-' + ones[n % 10];
                } else if (n > 0) {
                    result += ones[n];
                }
                return result.trim();
            }
            let dollars = Math.floor(num);
            let cents = Math.round((num - dollars) * 100);
            let result = '';
            if (dollars >= 1000000) {
                result += convertGroup(Math.floor(dollars / 1000000)) + ' million ';
                dollars %= 1000000;
            }
            if (dollars >= 1000) {
                result += convertGroup(Math.floor(dollars / 1000)) + ' thousand ';
                dollars %= 1000;
            }
            if (dollars > 0) {
                result += convertGroup(dollars);
            }
            if (result === '') result = 'zero';
            result += ' and ' + cents.toString().padStart(2, '0') + '/100';
            return result.charAt(0).toUpperCase() + result.slice(1);
        };

        // Render a single check using the template layout
        const renderCheck = (checkData, idx) => {
            if (!checkData) return null;
            
            // Use settings name for account name
            const accountName = config?.name || 'ACCOUNT NAME';
            // Get customer info - use account_number instead of customer_id for lookup
            const accountNumber = checkData.account_number || '';
            const customer = customers.find(c => c.account_number === accountNumber);
            
            // Ensure payee name is properly displayed
            const payToOrderOf = checkData.pay_to_order_of && checkData.pay_to_order_of.trim() !== '' 
                ? checkData.pay_to_order_of 
                : '';
            // Memo is just the account number
            const memoText = accountNumber;
            const amount = parseFloat(checkData.amount || 0).toFixed(2);
            const amountInWords = numberToWords(checkData.amount || 0);
            const checkNumber = String(checkData.check_number || '0000').padStart(4, '0');
            const date = new Date(checkData.date).toLocaleDateString();
            
            // Debug log for print rendering
            console.log(`CheckDocument rendering check ${checkNumber}:`, {
                payToOrderOf,
                amount,
                amountInWords,
                accountNumber,
                memoText,
                date,
                customer,
                checkData
            });
            // MICR line: use config for routing/account, check number from data
            const micrRouting = config?.routing_number || '123456789';
            const micrAccount = config?.account_number || '1122334455';
            
            // Format MICR line with proper E-13B characters
            // Transit symbol: ⑆ (U+2446) for routing number delimiters
            // On-Us symbol: ⑈ (U+2448) for account/check delimiters
            // MICR format: ⑆routing⑆ ⑈account⑈ ⑈check⑈
            const micrLine = `⑆${micrRouting}⑆ ⑈${micrAccount}⑈ ⑈${checkNumber}⑈`;
            
            return (
                <div className="check-container" key={idx}>
                    <div className="account-name">{accountName}</div>
                    <div className="phone-number">{config?.phone_number || ''}</div>
                    <div className="check-number">No. {checkNumber}</div>
                    <div className="account-address">{config?.address1}<br />{config?.address2}</div>
                    <div className="date-line">Date <span>{date}</span></div>
                    <div className="payee-line">
                        <span className="payee-label">Pay to the order of</span>
                        <span className="payee-input">{payToOrderOf}</span>
                    </div>
                    <div className="amount-box">${amount}</div>
                    <div className="amount-words">
                        <span className="amount-text">{amountInWords}</span>
                        <span className="dollars-text">DOLLARS</span>
                    </div>
                    <div className="bank-info">
                        <div className="bank-name">{config?.bank_name}</div>
                        <div className="bank-address">{config?.bank_address}</div>
                    </div>
                    <div className="memo-signature">
                        <div className="memo">
                            <span className="memo-label">Memo</span> 
                            <span className="memo-input">{memoText}</span>
                        </div>
                        <div className="signature">
                            <div className="signature-line"></div>
                            <div className="signature-label">Authorized Signature</div>
                        </div>
                    </div>
                    <div className="micr-line">
                        {micrLine}
                    </div>
                </div>
            );
        };

        return (
            <div ref={ref} style={{ padding: 0, margin: 0 }}>
                {/* Print-only styles for check layout */}
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap');
                    ${fontUrl ? `
                        @font-face { 
                            font-family: 'customCheckFont'; 
                            src: url('${fontUrl}') format('woff2'), url('${fontUrl}') format('woff'); 
                            font-display: swap; 
                        }
                    ` : ''}
                    ${micrFontUrl ? `
                        @font-face { 
                            font-family: 'customMicrFont'; 
                            src: url('${micrFontUrl}') format('woff2'), url('${micrFontUrl}') format('woff');
                            font-display: swap;
                        }
                    ` : ''}
                    
                    * {
                        box-sizing: border-box;
                    }
                    
                    .check-container {
                        width: 8.5in;
                        height: 3.5in;
                        background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%);
                        border: 1px solid #2c5f8d;
                        border-radius: 0;
                        padding: 0.35in 0.4in 0.25in 0.4in;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                        position: relative;
                        margin-bottom: 0.3in;
                        page-break-inside: avoid;
                        font-family: 'Roboto', Arial, sans-serif;
                    }
                    
                    .check-container::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 4px;
                        background: linear-gradient(90deg, #1e4d72 0%, #2c5f8d 50%, #1e4d72 100%);
                    }
                    
                    /* Header Section */
                    .account-name { 
                        position: absolute;
                        top: 0.45in;
                        left: 0.4in;
                        font-size: 15pt; 
                        font-weight: 700; 
                        color: #1a1a1a;
                        letter-spacing: 0.3px;
                        text-transform: uppercase;
                    }
                    
                    .phone-number { 
                        position: absolute;
                        top: 0.7in;
                        left: 0.4in;
                        font-size: 9pt; 
                        color: #444;
                        font-weight: 400;
                    }
                    
                    .check-number { 
                        position: absolute;
                        top: 0.42in;
                        right: 0.4in;
                        text-align: right; 
                        font-size: 18pt; 
                        font-weight: 700; 
                        color: #1e4d72;
                        letter-spacing: 1px;
                    }
                    
                    .account-address { 
                        position: absolute;
                        top: 0.9in;
                        left: 0.4in;
                        font-size: 9pt; 
                        color: #444; 
                        line-height: 1.4;
                        font-weight: 400;
                    }
                    
                    .date-line { 
                        position: absolute;
                        top: 0.68in;
                        right: 0.4in;
                        text-align: right; 
                        font-size: 10pt;
                        color: #1a1a1a;
                        font-weight: 500;
                    }
                    
                    .date-line span {
                        display: inline-block;
                        min-width: 1.2in;
                        border-bottom: 1px solid #333;
                        padding: 0 4px 2px 4px;
                        margin-left: 6px;
                    }
                    
                    /* Payee Section */
                    .payee-line { 
                        position: absolute;
                        top: 1.35in;
                        left: 0.4in;
                        right: 1.6in;
                        display: flex; 
                        align-items: baseline;
                        font-size: 11pt;
                    }
                    
                    .payee-label { 
                        font-weight: 600; 
                        color: #1a1a1a;
                        white-space: nowrap;
                        margin-right: 8px;
                        font-size: 10pt;
                    }
                    
                    .payee-input { 
                        flex: 1;
                        border: none;
                        border-bottom: 1px solid #333;
                        font-size: 12pt;
                        color: #000 !important;
                        font-weight: 500;
                        padding: 0 4px 3px 4px;
                        background: transparent;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    
                    /* Amount Box */
                    .amount-box { 
                        position: absolute;
                        top: 1.32in;
                        right: 0.4in;
                        width: 1.35in;
                        height: 0.32in;
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                        border: 2px solid #1e4d72;
                        background: #f8f9fa;
                        padding: 0 10px;
                        font-size: 15pt;
                        font-weight: 700;
                        color: #000;
                        font-family: 'Roboto Mono', monospace;
                    }
                    
                    /* Amount in Words */
                    .amount-words { 
                        position: absolute;
                        top: 1.75in;
                        left: 0.4in;
                        right: 0.4in;
                        font-size: 10pt;
                        border-bottom: 1px solid #333;
                        min-height: 0.25in;
                        display: flex;
                        align-items: flex-end;
                        justify-content: space-between;
                        padding: 0 4px 3px 4px;
                        color: #000 !important;
                    }
                    
                    .amount-text { 
                        flex: 1; 
                        color: #000 !important;
                        font-weight: 500;
                        text-transform: capitalize;
                    }
                    
                    .dollars-text { 
                        font-weight: 700; 
                        color: #000;
                        font-size: 10pt;
                        margin-left: 8px;
                    }
                    
                    /* Bank Info Section */
                    .bank-info { 
                        position: absolute;
                        top: 2.15in;
                        left: 0.4in;
                        right: 3.5in;
                        font-size: 10pt;
                        color: #1a1a1a;
                        line-height: 1.5;
                    }
                    
                    .bank-name { 
                        font-weight: 700;
                        font-size: 11pt;
                        color: #1e4d72;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                    }
                    
                    .bank-address { 
                        font-size: 9pt;
                        margin-top: 2px;
                        color: #444;
                        font-weight: 400;
                    }
                    
                    /* Memo and Signature */
                    .memo-signature { 
                        position: absolute;
                        top: 2.15in;
                        left: 0.4in;
                        right: 0.4in;
                        display: grid;
                        grid-template-columns: 2.2in 1fr;
                        gap: 0.5in;
                    }
                    
                    .memo { 
                        display: flex;
                        align-items: baseline;
                        font-size: 9pt;
                    }
                    
                    .memo-label { 
                        font-weight: 600;
                        color: #1a1a1a;
                        margin-right: 6px;
                    }
                    
                    .memo-input { 
                        flex: 1;
                        border-bottom: 1px solid #333;
                        font-size: 9pt;
                        padding: 0 4px 2px 4px;
                        color: #000;
                        max-width: 2in;
                    }
                    
                    .signature { 
                        display: flex;
                        flex-direction: column;
                        align-items: flex-end;
                        justify-content: flex-end;
                    }
                    
                    .signature-line { 
                        border-bottom: 1.5px solid #333;
                        width: 100%;
                        max-width: 2.8in;
                        height: 0.35in;
                        margin-bottom: 2px;
                    }
                    
                    .signature-label { 
                        font-size: 8pt;
                        color: #666;
                        font-weight: 400;
                        text-align: right;
                        width: 100%;
                        max-width: 2.8in;
                    }
                    
                    /* MICR Line */
                    .micr-line { 
                        position: absolute;
                        bottom: 0.2in;
                        left: 0.6in;
                        right: 0.4in;
                        font-family: ${micrFontUrl ? "'customMicrFont'" : "'MICR E13B', 'Roboto Mono'"}, monospace;
                        font-size: 13pt;
                        font-weight: 400;
                        letter-spacing: 1.5px;
                        color: #000;
                        line-height: 1;
                    }
                    
                    @media print {
                        body { 
                            background: white; 
                            margin: 0; 
                            padding: 0.25in;
                        }
                        
                        .check-container { 
                            box-shadow: none; 
                            border: 1px solid #2c5f8d;
                            page-break-inside: avoid;
                            margin-bottom: 0.2in;
                            background: white;
                        }
                        
                        .payee-input,
                        .amount-text,
                        .amount-box,
                        .micr-line,
                        .memo-input { 
                            color: #000 !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        
                        * { 
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    }
                `}</style>
                {checks && checks.map((check, idx) => renderCheck(check, idx))}
            </div>
        );
    });

    export default CheckDocument;
  