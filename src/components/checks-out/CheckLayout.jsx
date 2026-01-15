
    import React from 'react';
    import { MICR } from '@/lib/micrFont.jsx';

    const CheckLayout = React.forwardRef(({ checks, config }, ref) => {
        if (!checks || checks.length === 0 || !config) {
            return <div ref={ref}></div>;
        }

        const pages = [];
        for (let i = 0; i < checks.length; i += 3) {
            pages.push(checks.slice(i, i + 3));
        }

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

        const SingleCheck = ({ check }) => {
            if (!check) {
                return <div className="check-container empty"></div>;
            }

            const amount = parseFloat(check.amount);
            const amountInWords = numberToWords(check.amount);

            return (
                <div className="check-container">
                    <div className="check-header">
                        <div className="payee-info">
                            <strong>{config.name || ''}</strong>
                            <br />
                            {config.address1 || ''}
                            <br />
                            {config.address2 || ''}
                        </div>
                        <div className="bank-info">
                            <strong>{config.bank_name || ''}</strong>
                        </div>
                        <div className="check-number-box">
                            <span className="check-number-label">Check No.</span>
                            <span className="check-number">{check.check_number}</span>
                        </div>
                    </div>

                    <div className="check-body">
                        <div className="date-line">
                            <span className="label">Date</span>
                            <span className="value date-value">{new Date(check.date).toLocaleDateString()}</span>
                        </div>
                        <div className="pay-line">
                            <span className="label">Pay to the<br />Order of</span>
                            <span className="value payee-value">{check.pay_to_order_of}</span>
                            <div className="amount-box">
                                <span className="dollar-sign">$</span>
                                <span className="amount-value">{amount.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="amount-words-line">
                            <span className="value amount-words-value">{amountInWords}</span>
                        </div>

                        <div className="memo-signature-area">
                            <div className="memo-line">
                                <span className="label">Memo</span>
                                <span className="value memo-value">{check.memo}</span>
                            </div>
                            <div className="signature-line">
                                <span className="signature-placeholder"></span>
                                <span className="label">Authorized Signature</span>
                            </div>
                        </div>
                    </div>

                    <div className="micr-line">
                        <MICR text={`C${check.check_number}C`} />
                        <MICR text={`A${config.routing_number || ''}A`} />
                        <MICR text={`D${check.account_number}D`} />
                    </div>
                </div>
            );
        };

        return (
            <div ref={ref}>
                {pages.map((page, pageIndex) => (
                    <div key={pageIndex} className="print-page">
                        <SingleCheck check={page[0]} />
                        <SingleCheck check={page[1]} />
                        <SingleCheck check={page[2]} />
                    </div>
                ))}
            </div>
        );
    });

    export default CheckLayout;
  