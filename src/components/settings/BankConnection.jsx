import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Landmark, Loader2, RefreshCw, Link2, Unplug, KeyRound } from 'lucide-react';
import { pollPlaid, syncBankNow, loadPlaidLink } from '@/lib/bankFeed';
import { formatCurrency } from '@/lib/utils';

const BankConnection = () => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [keys, setKeys] = useState({ clientId: '', secret: '', env: 'sandbox' });

  const loadStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc('plaid_status');
    if (error) { toast({ title: 'Bank status failed', description: error.message, variant: 'destructive' }); return; }
    setStatus(data);
    setKeys(k => ({ ...k, env: data?.env || 'sandbox' }));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const saveKeys = async () => {
    setBusy('keys');
    try {
      const { error } = await supabase.rpc('plaid_save_keys', { p_client_id: keys.clientId, p_secret: keys.secret, p_env: keys.env });
      if (error) throw error;
      toast({ title: 'Plaid keys saved', description: 'Stored encrypted. You can now connect the bank.' });
      setKeys(k => ({ ...k, clientId: '', secret: '' }));
      setShowKeys(false);
      await loadStatus();
    } catch (e) {
      toast({ title: 'Could not save keys', description: e.message, variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const connectBank = async () => {
    setBusy('connect');
    try {
      const { data: reqId, error } = await supabase.rpc('plaid_create_link_token');
      if (error) throw error;
      const [{ result }, Plaid] = await Promise.all([pollPlaid(reqId), loadPlaidLink()]);
      const handler = Plaid.create({
        token: result.link_token,
        onSuccess: async (publicToken, metadata) => {
          setBusy('connect');
          try {
            const { data: exId, error: exErr } = await supabase.rpc('plaid_exchange_public_token', {
              p_public_token: publicToken, p_institution_name: metadata?.institution?.name || null,
            });
            if (exErr) throw exErr;
            await pollPlaid(exId);
            toast({ title: 'Bank connected', description: 'Downloading recent activity…' });
            await loadStatus();
            await syncBankNow().catch(() => {});
            await loadStatus();
          } catch (e) {
            toast({ title: 'Connecting failed', description: e.message, variant: 'destructive' });
          } finally { setBusy(''); }
        },
        onExit: () => setBusy(''),
      });
      handler.open();
    } catch (e) {
      toast({ title: 'Could not start bank connection', description: e.message, variant: 'destructive' });
      setBusy('');
    }
  };

  const syncNow = async (id) => {
    setBusy(`sync-${id}`);
    try {
      await syncBankNow(id);
      toast({ title: 'Bank synced' });
    } catch (e) {
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(''); await loadStatus(); }
  };

  const disconnect = async (id) => {
    if (!window.confirm('Disconnect this bank? Daily imports will stop.')) return;
    setBusy(`disc-${id}`);
    try {
      const { error } = await supabase.rpc('plaid_disconnect', { p_connection_id: id });
      if (error) throw error;
      toast({ title: 'Bank disconnected' });
    } catch (e) {
      toast({ title: 'Disconnect failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(''); await loadStatus(); }
  };

  if (!status) return <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const connections = status.connections || [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Connect the gemach&apos;s bank account through Plaid. Every morning the system downloads the bank activity,
        matches bank deposits to the checks you marked deposited, and flags any returned (bounced) check for you to confirm
        under <span className="font-medium">Checks In → Bank</span>.
      </p>

      {/* Keys */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4" /> Plaid keys
            <span className={`text-sm ${status.keys_configured ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400'}`}>
              {status.keys_configured ? `set (${status.env})` : 'not set'}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowKeys(s => !s)}>
            {status.keys_configured ? 'Change keys' : 'Enter keys'}
          </Button>
        </div>
        {showKeys && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Client ID</Label>
              <Input value={keys.clientId} onChange={e => setKeys({ ...keys, clientId: e.target.value })} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label>Secret</Label>
              <Input type="password" value={keys.secret} onChange={e => setKeys({ ...keys, secret: e.target.value })} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label>Environment</Label>
              <select
                value={keys.env}
                onChange={e => setKeys({ ...keys, env: e.target.value })}
                className="w-full h-10 rounded-md border border-border bg-input px-3 text-foreground"
              >
                <option value="sandbox">Sandbox (test)</option>
                <option value="production">Production (real bank)</option>
              </select>
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <Button onClick={saveKeys} disabled={busy === 'keys' || !keys.clientId || !keys.secret}>
                {busy === 'keys' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save keys
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Connections */}
      <div className="space-y-3">
        {connections.map(c => (
          <div key={c.id} className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <Landmark className="h-5 w-5 text-primary" /> {c.institution_name || 'Bank'}
                <span className={`text-xs font-normal px-2 py-0.5 rounded ${c.status === 'active' ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-red-500/15 text-red-700 dark:text-red-400'}`}>
                  {c.status === 'active' ? 'connected' : 'needs attention'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => syncNow(c.id)} disabled={!!busy}>
                  {busy === `sync-${c.id}` ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Sync now
                </Button>
                <Button size="sm" variant="destructive" onClick={() => disconnect(c.id)} disabled={!!busy}>
                  <Unplug className="h-4 w-4 mr-2" /> Disconnect
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Last sync: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : 'not yet'}
            </div>
            {(c.accounts || []).map(a => (
              <div key={a.account_id} className="text-sm flex justify-between">
                <span>{a.name}{a.mask ? ` ••${a.mask}` : ''}</span>
                {a.balance != null && <span className="font-medium">${formatCurrency(Number(a.balance) || 0)}</span>}
              </div>
            ))}
            {c.last_error && <div className="text-sm text-red-700 dark:text-red-400">Last error: {c.last_error}</div>}
          </div>
        ))}

        <Button onClick={connectBank} disabled={!status.keys_configured || !!busy}>
          {busy === 'connect' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
          {connections.length ? 'Connect another account' : 'Connect bank'}
        </Button>
        {!status.keys_configured && (
          <p className="text-xs text-muted-foreground">Enter the Plaid keys first.</p>
        )}
      </div>
    </div>
  );
};

export default BankConnection;
