
import React from 'react';
import { useData } from '@/contexts/DataContext';
import { MICRProvider, MICR } from '@/lib/micrFont.jsx';

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


const PrintableCheck = React.forwardRef(({ checks }, ref) => {
    const { settings } = useData();
    const checkConfig = settings.check_config || {};

    if (!checks || checks.length === 0) {
        return <div ref={ref}></div>;
    }

    return (
        <div ref={ref}>
            <MICRProvider>
                {checks.map((check) => (
                    <div key={check.id} className="w-[8.5in] h-[3.5in] text-black bg-white relative print:break-after-always" style={{ pageBreakAfter: 'always' }}>
                        
                        {/* Account name and address - top-left corner */}
                        <div className="absolute" style={{ top: '0.5in', left: '0.5in' }}>
                            <p className="font-bold text-sm" style={{ fontFamily: 'helvetica', fontSize: '12pt' }}>{checkConfig.name || 'KEREN MEAIR VESURE'}</p>
                            <p className="text-xs" style={{ fontFamily: 'helvetica', fontSize: '9pt' }}>{checkConfig.address1 || 'PO Box 265'}</p>
                            <p className="text-xs" style={{ fontFamily: 'helvetica', fontSize: '9pt' }}>{checkConfig.address2 || 'Monsey NY 10952'}</p>
                        </div>

                        {/* Check number - top-right, aligned 0.5 inch from right */}
                        <div className="absolute text-right" style={{ top: '0.5in', right: '0.5in' }}>
                            <p className="font-bold" style={{ fontFamily: 'helvetica', fontSize: '14pt' }}>{check.check_number}</p>
                        </div>

                        {/* Date - below check number */}
                        <div className="absolute text-right" style={{ top: '0.9in', right: '0.5in' }}>
                            <p style={{ fontFamily: 'helvetica', fontSize: '10pt' }}>Date: {new Date(check.date).toLocaleDateString('en-US')}</p>
                        </div>

                        {/* Pay to the Order of line */}
                        <div className="absolute" style={{ top: '1.2in', left: '1in' }}>
                            <p style={{ fontFamily: 'helvetica', fontSize: '10pt' }}>Pay to the Order of: 
                                <span className="font-bold ml-1">{check.pay_to_order_of || ''}</span>
                            </p>
                            <div className="border-b border-black" style={{ width: '5.7in', marginTop: '2pt' }}></div>
                        </div>

                        {/* Amount box - parallel to Pay to Order of */}
                        <div className="absolute text-right" style={{ top: '1.2in', right: '0.5in' }}>
                            <p className="font-bold" style={{ fontFamily: 'helvetica', fontSize: '14pt' }}>
                                ${parseFloat(check.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                        </div>

                        {/* Amount in words */}
                        <div className="absolute" style={{ top: '1.5in', left: '1in', width: '5.7in' }}>
                            <p style={{ fontFamily: 'helvetica', fontSize: '10pt' }}>{numberToWords(check.amount)}</p>
                            <div className="border-b border-black" style={{ width: '100%', marginTop: '2pt' }}></div>
                        </div>

                        {/* Bank name */}
                        <div className="absolute" style={{ top: '1.8in', left: '1in' }}>
                            <p style={{ fontFamily: 'helvetica', fontSize: '10pt' }}>NORTHEAST COMMUNITY BANK</p>
                        </div>

                        {/* Memo section */}
                        <div className="absolute" style={{ top: '2.3in', left: '1in' }}>
                            <p style={{ fontFamily: 'helvetica', fontSize: '10pt' }}>Memo: {check.memo || ''}</p>
                        </div>

                        {/* Signature line */}
                        <div className="absolute" style={{ top: '2.35in', left: '4.5in', right: '0.5in' }}>
                            <div className="border-b border-black" style={{ width: '100%' }}></div>
                        </div>

                        {/* MICR line with correct formatting at bottom */}
                        <div className="absolute" style={{ bottom: '0.2in', left: '0.5in', right: '0.5in' }}>
                            <MICR text={`C${check.check_number}C A${checkConfig.routing_number || '021300077'}A ${checkConfig.account_number || '1234567890'}C`} />
                        </div>
                    </div>
                ))}
            </MICRProvider>
        </div>
    );
});

export default PrintableCheck;
