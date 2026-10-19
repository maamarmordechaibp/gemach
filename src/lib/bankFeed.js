import { supabase } from '@/lib/customSupabaseClient';

// Plaid calls run inside Postgres via pg_net and are asynchronous: an RPC
// returns a request id and plaid_poll() reports when Plaid has answered.
export const pollPlaid = async (requestId, { timeoutMs = 60000, intervalMs = 1000 } = {}) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await supabase.rpc('plaid_poll', { p_request_id: requestId });
    if (error) throw error;
    if (data?.processed) {
      if (data.error) throw new Error(data.error);
      return data;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('The bank did not respond in time. Please try again.');
};

// Start a sync and wait until every page has been downloaded and matched.
export const syncBankNow = async (connectionId = null) => {
  const { data: ids, error } = await supabase.rpc('plaid_sync_start', { p_connection_id: connectionId });
  if (error) throw error;
  if (!ids || ids.length === 0) return { started: false };
  let last = null;
  for (const id of ids) last = await pollPlaid(id, { timeoutMs: 120000 });
  // Further pages (has_more) are queued automatically; wait for them too.
  const started = Date.now();
  while (last && last.sync_pending > 0 && Date.now() - started < 180000) {
    await new Promise(r => setTimeout(r, 1500));
    const { data, error: e } = await supabase.rpc('plaid_poll', { p_request_id: ids[ids.length - 1] });
    if (e) throw e;
    last = data;
  }
  return { started: true };
};

let plaidScriptPromise = null;
export const loadPlaidLink = () => {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  if (!plaidScriptPromise) {
    plaidScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      s.async = true;
      s.onload = () => resolve(window.Plaid);
      s.onerror = () => { plaidScriptPromise = null; reject(new Error('Could not load Plaid')); };
      document.head.appendChild(s);
    });
  }
  return plaidScriptPromise;
};
