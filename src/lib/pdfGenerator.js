import { jsPDF } from "jspdf";
import { micrFont } from '@/lib/micrFont.js';

function convertAmountToWords(num) {
  if (num === null || num === undefined) return "";
  const amount = parseFloat(num);
  if (isNaN(amount)) return "";

  const [dollars, cents] = amount.toFixed(2).split('.');
  
  if (dollars === '0') {
    return `Zero and ${cents}/100 Dollars`;
  }

  const toWords = (s) => {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    let n = ('000000000' + s).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]).trim() + ' crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]).trim() + ' lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]).trim() + ' thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]).trim() + ' hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? '' : '') + (a[Number(n[5])] || b[n[5][0]] + (n[5][1] != 0 ? ' ' : '') + a[n[5][1]]).trim() : '';
    
    return str.replace(/\s+/g, ' ').trim();
  };

  const dollarsText = toWords(dollars);
  const dollarsCapitalized = dollarsText.charAt(0).toUpperCase() + dollarsText.slice(1);
  
  return `${dollarsCapitalized} and ${cents}/100 Dollars`;
}

export const generateChecksPDF = async (checks, checkConfig) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const config = checkConfig || {
    name: "KEREN MEAIR VESURE",
    address1: "PO Box 265",
    address2: "Monsey NY 10952",
    bank_name: "NORTHEAST COMMUNITY BANK",
    routing_number: "000000000",
    account_number: "000000000"
  };

  try {
    doc.addFileToVFS('MICR-E13B.ttf', micrFont);
    doc.addFont('MICR-E13B.ttf', 'MICR-E13B', 'normal');
  } catch (e) {
    console.error("Error loading MICR font:", e);
  }

  const checksPerPage = 3;
  let yOffset = 10;
  
  const today = new Date();
  const dateFormatted = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;


  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    
    if (i > 0 && i % checksPerPage === 0) {
      doc.addPage();
      yOffset = 10;
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("KEREN MEAIR VESURE", 20, yOffset);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text("PO Box 265", 20, yOffset + 5);
    doc.text("Monsey NY 10952", 20, yOffset + 10);

    doc.setFontSize(10);
    doc.text(String(check.check_number), 190, yOffset, { align: 'right' });
    doc.text(`Date: ${dateFormatted}`, 190, yOffset + 10, { align: 'right' });

    doc.setFontSize(10);
    doc.text("Pay to the Order of:", 20, yOffset + 25);
    
    doc.setFont('helvetica', 'bold');
    doc.text(check.pay_to_order_of || '', 55, yOffset + 25);
    doc.line(54, yOffset + 26, 150, yOffset + 26);
    
    doc.text(`$${parseFloat(check.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 190, yOffset + 25, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const amountInWords = convertAmountToWords(check.amount);
    doc.text(amountInWords, 20, yOffset + 35);
    doc.line(19, yOffset + 36, 190, yOffset + 36);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('NORTHEAST COMMUNITY BANK', 20, yOffset + 45);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const memoText = `Memo: ${check.memo || ''} - Acct: ${check.account_number}`;
    doc.text(memoText, 20, yOffset + 55);
    
    doc.line(120, yOffset + 55, 190, yOffset + 55);

    try {
      doc.setFont('MICR-E13B');
      doc.setFontSize(12);
      const micrLine = `C${check.check_number}C A${check.routing_number}A ${config.account_number}C`;
      doc.text(micrLine, 20, yOffset + 70);
    } catch(e) {
        console.error("Could not set MICR font, falling back to default", e);
        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        const micrLine = `C${check.check_number}C A${check.routing_number}A ${config.account_number}C`;
        doc.text(micrLine, 20, yOffset + 70);
    }

    yOffset += 90;
  }
  
  const timestamp = new Date();
  const fileName = `${timestamp.getMonth()+1}-${timestamp.getDate()}-${timestamp.getFullYear()}_${timestamp.getHours()}-${timestamp.getMinutes()}-${timestamp.getSeconds()}.pdf`;
  doc.save(fileName);
};