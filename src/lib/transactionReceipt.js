import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency } from '@/lib/utils';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n) => `$${formatCurrency(Number(n) || 0)}`;

const OTHER_LABELS = { quickpay: 'QuickPay', direct_deposit: 'Direct Deposit', other: 'Other' };

const row = (label, amount, cls = '') =>
  `<div class="row ${cls}"><span class="lbl">${label}</span><span class="amt">${amount}</span></div>`;

const sub = (label, amount) => row(`&nbsp;&nbsp;${label}`, amount, 'sub');

// Fee for one item (check) from the calculate_fee_v2 breakdown.
const itemFee = (breakdown, types, index) => {
  let fee = 0;
  let waived = false;
  for (const d of breakdown || []) {
    if (!types.includes(d.type)) continue;
    const item = (d.items || []).find(i => i.index === index);
    if (!item) continue;
    if (d.waived) waived = true;
    else fee += Number(item.fee) || 0;
  }
  return { fee, waived };
};

const categoryFee = (breakdown, type) => (breakdown || []).find(d => d.type === type) || null;

const feeLine = (label, entry) => {
  if (!entry) return '';
  return entry.waived ? sub(`${label} (waived)`, money(0)) : sub(label, `-${money(entry.amount)}`);
};

export const buildReceiptHtml = (receipt, settings, newBalance) => {
  const company = settings?.check_config || {};
  const now = new Date();
  const c = receipt.customer || {};
  const bd = receipt.feeBreakdown || [];

  // ---- Deposits ----
  const deposits = [];
  let depositTotal = 0;
  if (receipt.creditCash > 0) {
    deposits.push(row('Cash', money(receipt.creditCash)));
    depositTotal += receipt.creditCash;
  }
  (receipt.creditOther || []).forEach(o => {
    const label = OTHER_LABELS[o.method] || 'Other';
    deposits.push(row(esc(label), money(o.amount)));
    if (o.note) deposits.push(`<div class="note">${esc(o.note)}</div>`);
    depositTotal += o.amount;
  });
  (receipt.creditChecks || []).forEach((chk, i) => {
    const hold = chk.isonhold ? ' (ON HOLD)' : '';
    deposits.push(row(`Check #${esc(chk.checknumber || 'N/A')}${hold}`, money(chk.amount)));
    const { fee, waived } = itemFee(bd, ['missing_account'], i);
    if (waived) deposits.push(sub('No acct # fee (waived)', money(0)));
    else if (fee > 0) deposits.push(sub('No acct # fee', `-${money(fee)}`));
    depositTotal += chk.amount;
  });

  // ---- Withdrawals ----
  const debits = [];
  let debitTotal = 0;
  const regularCash = (receipt.debitCash || []).filter(e => !e.isRush);
  const rushCash = (receipt.debitCash || []).filter(e => e.isRush);
  regularCash.forEach(e => { debits.push(row('Cash', money(e.amount))); debitTotal += e.amount; });
  if (regularCash.length) debits.push(feeLine('Cash fee', categoryFee(bd, 'cash_debit')));
  rushCash.forEach(e => { debits.push(row('Cash (RUSH)', money(e.amount))); debitTotal += e.amount; });
  if (rushCash.length) debits.push(feeLine('Rush cash fee', categoryFee(bd, 'rush_cash')));

  (receipt.debitChecks || []).forEach((chk, i) => {
    const rush = chk.isRush ? ' (RUSH)' : '';
    debits.push(row(`Check #${esc(chk.checkNumber || '—')}${rush}`, money(chk.amount)));
    debits.push(`<div class="note">Pay to: ${esc(chk.paytoorderof || '—')}</div>`);
    const { fee, waived } = itemFee(bd, ['check_debit', 'rush_check'], i);
    if (waived && fee === 0) debits.push(sub('Check fee (waived)', money(0)));
    else if (fee > 0) debits.push(sub('Check fee', `-${money(fee)}`));
    debitTotal += chk.amount;
  });

  // ---- Transfers ----
  const transfers = [];
  let transferTotal = 0;
  (receipt.transfers || []).forEach(t => {
    const name = t.recipient ? ` ${t.recipient.first_name} ${t.recipient.last_name}` : '';
    transfers.push(row(`To ${esc(t.toAccount)}${esc(name)}`, money(t.amount)));
    if (t.note) transfers.push(`<div class="note">${esc(t.note)}</div>`);
    transferTotal += t.amount;
  });

  const fee = Number(receipt.fee) || 0;
  const debitFees = bd
    .filter(d => !d.waived && d.type !== 'missing_account')
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const section = (title, lines, totalLabel, total, extra = '') => lines.length ? `
<div class="section">${title}</div>
${lines.join('')}
<div class="line-thin"></div>
${row(totalLabel, money(total), 'bold')}
${extra}
<div class="line"></div>` : '';

  return `<!DOCTYPE html><html><head><title>Receipt</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:monospace;padding:20px;width:3in;color:#000;background:#fff;font-size:11px;}
.center{text-align:center;}.line{border-bottom:1px dashed #000;margin:8px 0;}.line-thin{border-bottom:1px dotted #000;margin:4px 0;}
.row{display:flex;justify-content:space-between;gap:6px;padding:2px 0;}.row .lbl{flex:1;word-break:break-word;}.row .amt{white-space:nowrap;}
.sub{font-size:10px;}.note{font-size:10px;padding-left:12px;word-break:break-word;}
.section{font-weight:bold;text-decoration:underline;margin:4px 0;}
.bold{font-weight:bold;}.big{font-size:16px;}.mt{margin-top:8px;}@media print{body{padding:5px;margin:0;}}</style>
</head><body>
<div class="center">${company.name ? `<div class="bold big">${esc(company.name)}</div>` : ''}
${company.address1 ? `<div>${esc(company.address1)}</div>` : ''}${company.phone_number ? `<div>${esc(company.phone_number)}</div>` : ''}
</div>
<div class="line"></div>
<div class="center bold">TRANSACTION RECEIPT</div>
<div class="center">${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
<div class="line"></div>
${row('Customer:', esc(`${c.first_name || ''} ${c.last_name || ''}`.trim()), 'bold')}
${row('Account:', esc(c.account_number || ''))}
<div class="line"></div>
${section('DEPOSITS', deposits, 'Total Deposits', depositTotal)}
${receipt.creditNote && deposits.length ? `<div class="note">Note: ${esc(receipt.creditNote)}</div><div class="line"></div>` : ''}
${section('WITHDRAWALS', debits, 'Total Withdrawals', debitTotal,
  debitFees > 0 ? row('Total incl. fees', money(debitTotal + debitFees), 'bold') : '')}
${receipt.debitNote && debits.length ? `<div class="note">Note: ${esc(receipt.debitNote)}</div><div class="line"></div>` : ''}
${section('TRANSFERS', transfers, 'Total Transfers', transferTotal)}
${depositTotal > 0 ? row('Deposits', `+${money(depositTotal)}`) : ''}
${debitTotal > 0 ? row('Withdrawals', `-${money(debitTotal)}`) : ''}
${fee > 0 ? row('Total Fees', `-${money(fee)}`) : ''}
${transferTotal > 0 ? row('Transfers', `-${money(transferTotal)}`) : ''}
${receipt.loanAmount > 0 ? row('Loan', `+${money(receipt.loanAmount)}`) : ''}
<div class="line"></div>
${row('Balance:', money(newBalance), 'bold big')}
<div class="line"></div>
<div class="center mt">Thank you!</div>
</body></html>`;
};

// Balance implied by the receipt — used only if the fresh balance can't be fetched.
const estimateNewBalance = (receipt) => {
  const sum = (arr, f = x => x.amount) => (arr || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const credited = receipt.creditCash + sum(receipt.creditOther)
    + sum((receipt.creditChecks || []).filter(c => !c.isonhold));
  const debited = sum(receipt.debitCash) + sum(receipt.debitChecks) + sum(receipt.transfers) + (Number(receipt.fee) || 0);
  return (parseFloat(receipt.customer?.balance) || 0) + credited - debited + (receipt.loanAmount || 0);
};

export const printTransactionReceipt = async (receipt, settings) => {
  if (!receipt) return;
  // Open synchronously so the popup isn't blocked while we fetch the balance.
  const w = window.open('', '_blank', 'width=350,height=600');
  if (!w) return;

  let newBalance = estimateNewBalance(receipt);
  try {
    const { data } = await supabase.from('customers').select('balance').eq('id', receipt.customer.id).single();
    if (data && data.balance != null) newBalance = parseFloat(data.balance);
  } catch {
    // keep the estimate
  }

  w.document.write(buildReceiptHtml(receipt, settings, newBalance));
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => w.close(), 1000); }, 400);
};
