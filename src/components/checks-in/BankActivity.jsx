import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { syncBankNow } from '@/lib/bankFeed';
import { formatCurrency } from '@/lib/utils';

const STATUS_LABEL = {
  matched: { text: 'Matched', cls: 'text-green-700 dark:text-green-400' },
  confirmed: { text: 'Bounced (confirmed)', cls: 'text-red-700 dark:text-red-400' },
  needs_review: { text: 'Needs review', cls: 'text-orange-700 dark:text-orange-400' },
  unmatched: { text: 'Not matched', cls: 'text-muted-foreground' },
  dismissed: { text: 'Dismissed', cls: 'text-muted-foreground' },
  new: { text: 'Pending', cls: 'text-muted-foreground' },
};

const KIND_LABEL = { deposit: 'Deposit', return: 'Returned item', bank_fee: 'Bank fee', other: 'Other' };

// One returned item awaiting a decision: pick the check that bounced, then confirm.
const ReturnReview = ({ txn, checksIn, customers, defaultFee, onDone }) => {
  const [selected, setSelected] = useState(txn.candidate_check_ids?.length === 1 ? txn.candidate_check_ids[0] : '');
  const [fee, setFee] = useState(defaultFee);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const nameFor = (acct) => {
    const c = customers.find(x => x.account_number === acct);
    return c ? `${c.first_name} ${c.last_name}` : acct;
  };

  const candidates = useMemo(() => {
    const ids = new Set(txn.candidate_check_ids || []);
    let list = checksIn.filter(c => ids.has(c.id));
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = [...list, ...checksIn.filter(c => !ids.has(c.id) && !['bounced', 'voided'].includes(c.status)
        && ((c.check_number || '').toLowerCase().includes(s) || nameFor(c.account_number).toLowerCase().includes(s)))
        .slice(0, 10)];
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn, checksIn, search, customers]);

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('bank_confirm_return', { p_bank_txn_id: txn.id, p_check_id: selected, p_fee: parseFloat(fee) || 0 });
      if (error) throw error;
      toast({ title: 'Check bounced', description: 'Balance adjusted and reversal recorded.' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not bounce check', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const dismiss = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('bank_dismiss', { p_bank_txn_id: txn.id });
    setBusy(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else onDone();
  };

  return (
    <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <AlertTriangle className="h-5 w-5 text-orange-700 dark:text-orange-400" />
          Bank returned ${formatCurrency(Number(txn.amount))} on {new Date(txn.date + 'T12:00:00').toLocaleDateString()}
        </div>
        <span className="text-sm text-muted-foreground">{txn.name}</span>
      </div>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Which check bounced?</p>
        {candidates.length === 0 && <p className="text-sm text-muted-foreground">No check of this amount found — search below.</p>}
        {candidates.map(c => (
          <label key={c.id} className="flex items-center gap-3 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted/40">
            <input type="radio" name={`ret-${txn.id}`} checked={selected === c.id} onChange={() => setSelected(c.id)} />
            <span className="font-medium text-foreground">#{c.check_number || 'N/A'}</span>
            <span>{nameFor(c.account_number)} ({c.account_number})</span>
            <span className="text-muted-foreground">{new Date(c.date).toLocaleDateString()}</span>
            <span className="ml-auto font-semibold text-foreground">${formatCurrency(Number(c.amount))}</span>
            <span className="text-xs capitalize text-muted-foreground">{c.status}</span>
          </label>
        ))}
        <Input placeholder="Search another check by number or name…" value={search} onChange={e => setSearch(e.target.value)} className="mt-2 max-w-sm" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Bounce fee $</span>
        <Input type="number" value={fee} onChange={e => setFee(e.target.value)} className="w-24" />
        <Button variant="destructive" onClick={confirm} disabled={!selected || busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />} Confirm bounce
        </Button>
        <Button variant="outline" onClick={dismiss} disabled={busy}>Not a bounced check</Button>
      </div>
    </div>
  );
};

const BankActivity = () => {
  const { checksIn, customers, settings, refreshData } = useData();
  const [rows, setRows] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [connected, setConnected] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const defaultFee = useMemo(() => {
    const b = settings?.transaction_fees?.bounced_check;
    return b?.enabled ? String(b.fee ?? 0) : '0';
  }, [settings]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const [{ data, error }, { data: st }] = await Promise.all([
      supabase.from('bank_transactions').select('*').eq('removed', false).gte('date', since)
        .order('date', { ascending: false }).order('id', { ascending: false }).limit(500),
      supabase.rpc('plaid_status'),
    ]);
    if (error) { toast({ title: 'Could not load bank activity', description: error.message, variant: 'destructive' }); setRows([]); return; }
    setRows(data || []);
    const conns = st?.connections || [];
    setConnected(conns.length > 0);
    setLastSync(conns.map(c => c.last_sync_at).filter(Boolean).sort().pop() || null);
  }, []);

  useEffect(() => { load(); }, [load]);

  const afterChange = () => { load(); refreshData(); };

  const syncNow = async () => {
    setSyncing(true);
    try { await syncBankNow(); toast({ title: 'Bank synced' }); }
    catch (e) { toast({ title: 'Sync failed', description: e.message, variant: 'destructive' }); }
    finally { setSyncing(false); afterChange(); }
  };

  if (!rows) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const review = rows.filter(r => r.match_status === 'needs_review' || (r.kind === 'return' && r.match_status === 'unmatched'));
  const checkById = Object.fromEntries((checksIn || []).map(c => [c.id, c]));

  return (
    <div className="space-y-6 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {connected
            ? <>Bank activity is downloaded every morning. Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'not yet'}</>
            : <>No bank connected yet — an admin can connect it under Settings → Bank Connection.</>}
        </div>
        {connected && (
          <Button variant="outline" onClick={syncNow} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Sync now
          </Button>
        )}
      </div>

      {review.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Returned checks to review ({review.length})</h3>
          {review.map(t => (
            <ReturnReview key={t.id} txn={t} checksIn={checksIn || []} customers={customers || []} defaultFee={defaultFee} onDone={afterChange} />
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No bank activity yet.</td></tr>
            )}
            {rows.map(r => {
              const moneyIn = Number(r.amount) < 0;
              const st = r.pending ? { text: 'Pending at bank', cls: 'text-muted-foreground' } : (STATUS_LABEL[r.match_status] || STATUS_LABEL.new);
              const matched = (r.matched_check_ids || []).map(id => checkById[id]).filter(Boolean);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-foreground whitespace-nowrap">{new Date(r.date + 'T12:00:00').toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-foreground">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{KIND_LABEL[r.kind] || '—'}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${moneyIn ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {moneyIn ? '+' : '-'}${formatCurrency(Math.abs(Number(r.amount)))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 ${st.cls}`}>
                      {r.match_status === 'matched' && <CheckCircle className="h-4 w-4" />}
                      {st.text}
                    </span>
                    {matched.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {matched.map(c => `#${c.check_number || 'N/A'}`).join(', ')}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BankActivity;
