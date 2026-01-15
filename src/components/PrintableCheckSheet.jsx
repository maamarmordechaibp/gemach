import React from 'react';
import { useData } from '@/contexts/DataContext';

const numberToWords = (amount) => {
    if (!amount) return '';
    
    const words = [
        'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const scales = ['Thousand', 'Million', 'Billion', 'Trillion'];

    // Ensure the amount is treated as a string for splitting
    const [whole, fraction] = amount.toString().replace(/,/g, '').split('.'); // Remove commas and split into dollars and cents
    const num = parseInt(whole, 10);
    const cents = parseInt(fraction || '0', 10); // Default to 0 if no fraction part

    if (isNaN(num)) return 'Invalid amount';

    let result = '';
    let scaleIndex = -1;
    let remainder = num;

    // Convert the whole number part to words
    while (remainder > 0) {
        const chunk = remainder % 1000;
        if (chunk > 0) {
            const chunkWords = convertChunkToWords(chunk, words, tens);
            if (scaleIndex >= 0) result = `${chunkWords} ${scales[scaleIndex]} ${result}`.trim();
            else result = `${chunkWords} ${result}`.trim();
        }
        remainder = Math.floor(remainder / 1000);
        scaleIndex++;
    }

    if (result === '') result = 'Zero';
    result = `${result} Dollars`;

    // Add the cents part if it exists, otherwise add ".00/100"
    if (cents > 0) {
        result += ` and ${convertChunkToWords(cents, words, tens)} Cents`;
    } else {
        result += ' and 00/100';
    }

    return result;
};

const convertChunkToWords = (chunk, words, tens) => {
    const hundreds = Math.floor(chunk / 100);
    const remainder = chunk % 100;
    let chunkWords = '';

    if (hundreds > 0) chunkWords += `${words[hundreds]} Hundred`;
    if (remainder > 0) {
        if (chunkWords) chunkWords += ' ';
        if (remainder < 20) {
            chunkWords += words[remainder];
        } else {
            const tensValue = Math.floor(remainder / 10);
            const unitsValue = remainder % 10;
            chunkWords += `${tens[tensValue]}`;
            if (unitsValue > 0) {
                chunkWords += ` ${words[unitsValue]}`;
            }
        }
    }

    return chunkWords.trim();
};

const SingleCheck = ({ check, config }) => {
    if (!check) return <div className="check-container empty"></div>;

    return (
        <div className="check-container">
            {/* Account name and address - top-left corner */}
            <div className="header-left">
                <div className="name">{config.name || 'KEREN MEAIR VESURE'}</div>
                <div>{config.address1 || 'PO Box 265'}</div>
                <div>{config.address2 || 'Monsey NY 10952'}</div>
            </div>

            {/* Check number - top-right, larger and bold */}
            <div className="header-right">
                <div className="check-number">{check.check_number}</div>
                <div className="date-field">
                    <span>Date:</span>
                    <div className="date-value">{new Date(check.date).toLocaleDateString('en-US')}</div>
                </div>
            </div>

            {/* Pay to the Order of and Amount box */}
            <div className="main-body-row">
                <div className="pay-order-line">
                    <span>Pay to the Order of:</span>
                    <div className="payee-value">{check.pay_to_order_of || ''}</div>
                </div>
                <div className="amount-box">
                    <span>$</span>
                    <div className="amount-value">{parseFloat(check.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </div>
            </div>

            {/* Amount in words */}
            <div className="amount-words-line">
                <span className="amount-words-text">{numberToWords(check.amount)}</span>
            </div>

            {/* Bank name */}
            <div className="bank-info">
                <div className="bank-name">NORTHEAST COMMUNITY BANK</div>
            </div>

            {/* Memo */}
            <div className="memo-line">
                <span>Memo:</span>
                <div className="memo-value">{check.memo || ''}</div>
            </div>

            {/* Signature line */}
            <div className="signature-line">
                <div className="line"></div>
            </div>

            {/* MICR line with correct formatting */}
            <div className="micr-line">
                <span className="micr-font">C{check.check_number}C A{config.routing_number || '021300077'}A {config.account_number || '1234567890'}C</span>
            </div>
        </div>
    );
};

const PrintableCheckSheet = React.forwardRef(({ checks }, ref) => {
    const { settings } = useData();
    const checkConfig = settings.check_config || {};

    if (!checks || checks.length === 0) {
        return <div ref={ref}></div>;
    }

    const pages = [];
    for (let i = 0; i < checks.length; i += 3) {
        pages.push(checks.slice(i, i + 3));
    }

    return (
        <div ref={ref}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono&display=swap');
                @font-face {
                    font-family: 'E-13B';
                    src: url('/fonts/E13B.woff2') format('woff2'),
                         url('/fonts/E13B.woff') format('woff');
                    font-weight: normal;
                    font-style: normal;
                }
                
                .print-page {
                    width: 8.5in;
                    height: 11in;
                    margin: 0 auto;
                    background: white;
                    page-break-after: always;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-start;
                    padding: 0.67in 0;
                    gap: 0;
                }

                .check-container {
                    font-family: 'Helvetica', 'Arial', sans-serif;
                    color: #000;
                    width: 8.5in;
                    height: 3.5in;
                    background-color: #fff;
                    padding: 0;
                    margin: 0;
                    box-sizing: border-box;
                    position: relative;
                    overflow: hidden;
                }
                .check-container.empty {
                    border: none;
                }

                /* Account name and address - top-left corner */
                .header-left { 
                    position: absolute; 
                    top: 0.5in; 
                    left: 0.5in; 
                    font-size: 12pt; 
                    line-height: 1.2; 
                }
                .header-left .name { 
                    font-weight: bold; 
                    font-size: 12pt; 
                    margin-bottom: 2pt; 
                }
                .header-left div:not(.name) { 
                    font-size: 9pt; 
                }

                /* Check number - top-right */
                .header-right { 
                    position: absolute; 
                    top: 0.5in; 
                    right: 0.5in; 
                    text-align: right; 
                }
                .check-number { 
                    font-weight: bold; 
                    font-size: 14pt; 
                    margin-bottom: 6pt;
                }
                .date-field { 
                    font-size: 10pt; 
                    display: flex; 
                    align-items: center; 
                    justify-content: flex-end;
                }
                .date-field span { 
                    margin-right: 4px; 
                }

                /* Pay to Order line */
                .main-body-row { 
                    position: absolute; 
                    top: 1.2in; 
                    left: 1in; 
                    right: 0.5in; 
                    height: 0.3in;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .pay-order-line { 
                    display: flex; 
                    align-items: center; 
                    font-size: 10pt; 
                    flex: 1;
                }
                .pay-order-line span { 
                    margin-right: 8px; 
                    white-space: nowrap;
                }
                .payee-value { 
                    flex-grow: 1; 
                    font-weight: bold; 
                    border-bottom: 1px solid #000; 
                    margin-right: 20px;
                    padding-bottom: 2pt;
                    min-height: 14pt;
                }

                /* Amount box */
                .amount-box { 
                    font-size: 14pt; 
                    font-weight: bold; 
                    display: flex; 
                    align-items: center;
                    white-space: nowrap;
                }
                .amount-box span { 
                    margin-right: 3px; 
                }

                /* Amount in words */
                .amount-words-line { 
                    position: absolute; 
                    top: 1.5in; 
                    left: 1in; 
                    right: 0.5in; 
                    font-size: 10pt; 
                    border-bottom: 1px solid #000; 
                    padding-bottom: 2pt;
                    min-height: 14pt;
                }

                /* Bank name */
                .bank-info { 
                    position: absolute; 
                    top: 1.8in; 
                    left: 1in; 
                    font-size: 10pt; 
                }

                /* Memo */
                .memo-line { 
                    position: absolute; 
                    top: 2.3in; 
                    left: 1in; 
                    font-size: 10pt; 
                    display: flex; 
                    align-items: center;
                }
                .memo-line span { 
                    margin-right: 8px; 
                }
                .memo-value { 
                    min-width: 3in;
                }

                /* Signature line */
                .signature-line { 
                    position: absolute; 
                    top: 2.35in; 
                    left: 4.5in; 
                    right: 0.5in; 
                }
                .signature-line .line { 
                    border-bottom: 1px solid #000; 
                    width: 100%; 
                }

                /* MICR line */
                .micr-line { 
                    position: absolute; 
                    bottom: 0.2in; 
                    left: 0.5in; 
                    right: 0.5in; 
                    font-family: 'E-13B', 'Roboto Mono', monospace; 
                    font-size: 16px;
                    font-weight: normal;
                    letter-spacing: 1px;
                    line-height: 1.2;
                }
                .micr-font { 
                    font-family: 'E-13B', 'Roboto Mono', monospace; 
                }

                @media print {
                    body { margin: 0; }
                    .print-page { margin: 0; padding: 0.67in 0; border: none; }
                    .check-container { page-break-inside: avoid; }
                }
            `}</style>
            {pages.map((pageChecks, pageIndex) => (
                <div key={pageIndex} className="print-page">
                    <SingleCheck check={pageChecks[0]} config={checkConfig} />
                    <SingleCheck check={pageChecks[1]} config={checkConfig} />
                    <SingleCheck check={pageChecks[2]} config={checkConfig} />
                </div>
            ))}
        </div>
    );
});

export default PrintableCheckSheet;