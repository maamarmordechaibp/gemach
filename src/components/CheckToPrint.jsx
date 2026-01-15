import React from 'react';
import { useData } from '@/contexts/DataContext';
import { MICRProvider, MICR } from '@/lib/micrFont.jsx';

const numberToWords = (numStr) => {
    const num = parseFloat(numStr);
    if (isNaN(num)) return '';
    if (num === 0) return 'Zero';
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    const inWords = (n) => {
        if (n < 20) return a[n];
        let digit = n % 10;
        return `${b[Math.floor(n / 10)]}${digit ? '-' + a[digit] : ''}`;
    };

    let words = '';
    let integerPart = Math.floor(num);
    if (integerPart >= 1000) {
        words += inWords(Math.floor(integerPart / 1000)) + ' thousand ';
        integerPart %= 1000;
    }
    if (integerPart >= 100) {
        words += inWords(Math.floor(integerPart / 100)) + ' hundred ';
        integerPart %= 100;
    }
    if (integerPart > 0) {
        if (words !== '') words += 'and ';
        words += inWords(integerPart);
    }
    if (words === '') words = 'Zero';

    const cents = Math.round((num - Math.floor(num)) * 100);
    return `${words.charAt(0).toUpperCase() + words.slice(1)} and ${cents}/100 Dollars`;
};


const CheckToPrint = ({ checks }) => {
    const { settings } = useData();
    const checkConfig = settings.check_config || {};

    if (!checks || checks.length === 0) {
        return null;
    }

    return (
        <MICRProvider>
            {checks.map(check => (
                <div key={check.id} className="w-[8.5in] h-[3.5in] p-4 text-black bg-white font-serif relative" style={{ pageBreakAfter: 'always' }}>
                    
                    <div className="absolute top-4 left-4">
                        <p className="font-bold text-sm">{checkConfig.name}</p>
                        <p className="text-xs">{checkConfig.address1}</p>
                        <p className="text-xs">{checkConfig.address2}</p>
                    </div>

                    <div className="absolute top-4 right-4 text-right">
                        <p className="text-2xl font-bold">{check.check_number}</p>
                        <p className="text-sm">{new Date(check.date).toLocaleDateString()}</p>
                    </div>

                    <div className="absolute top-20 left-4">
                        <p className="text-xs">PAY TO THE ORDER OF</p>
                        <p className="text-lg font-semibold pl-4 border-b border-black w-[6in]">{check.pay_to_order_of}</p>
                    </div>

                    <div className="absolute top-20 right-4 flex items-center border border-black p-1">
                        <span className="text-sm">$</span>
                        <p className="text-lg font-bold pl-2">{parseFloat(check.amount).toFixed(2)}</p>
                    </div>
                    
                    <div className="absolute top-32 left-4 w-[7in] border-b border-black">
                        <p className="capitalize text-sm">{numberToWords(check.amount)}</p>
                    </div>

                    <div className="absolute bottom-16 left-4">
                         <p className="text-xs">MEMO</p>
                         <p className="text-sm pl-4 border-b border-black w-[4in]">{check.memo}</p>
                    </div>
                    
                     <div className="absolute bottom-16 right-4 w-[3in] border-b-2 border-black">
                    </div>

                    <div className="absolute bottom-4 left-4 right-4">
                        <MICR text={`C${check.check_number}C A${checkConfig.routing_number}A ${checkConfig.account_number}C`} />
                    </div>
                </div>
            ))}
        </MICRProvider>
    );
};

export default CheckToPrint;