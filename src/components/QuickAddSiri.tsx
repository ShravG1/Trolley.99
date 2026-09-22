import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  isSupabaseConfigured,
  listQuickAddTokens,
  createQuickAddToken,
  revokeQuickAddToken,
  type QuickAddTokenRow,
} from '@/lib/supabase';

// "Add via Siri" (§22) — mint a per-member token for an iOS Shortcut. The
// token is a bearer credential for ONE thing only (quick_add_item, migration
// 0019): it can add an item to this group's list, nothing else. Shown once at
// mint time; only its hash is ever stored, so there's no way to show it again
// later — only revoke and mint a fresh one.
const ENDPOINT = `${(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/quick-add`;

export function QuickAddSiri() {
  const groupId = useStore((s) => s.trip.group_id);
  const live = isSupabaseConfigured();

  const [rows, setRows] = useState<QuickAddTokenRow[]>([]);
  const [minting, setMinting] = useState(false);
  const [minted, setMinted] = useState<{ label: string; token: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (live) listQuickAddTokens(groupId).then(setRows).catch(() => setRows([]));
  }, [live, groupId]);

  if (!live) {
    return <p className="text-body text-ink-soft">Sign in with a real account to set this up (not available in demo mode).</p>;
  }

  async function mint() {
    setMinting(true);
    try {
      const label = `Shortcut ${rows.length + 1}`;
      const token = await createQuickAddToken(groupId, label);
      if (token) {
        setMinted({ label, token });
        setRows(await listQuickAddTokens(groupId));
      }
    } catch {
      /* ignore — the empty state just invites another try */
    } finally {
      setMinting(false);
    }
  }

  async function revoke(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
    await revokeQuickAddToken(id);
  }

  async function copy(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      {minted ? (
        <div className="space-y-3 rounded-md bg-surface-2 p-3">
          <p className="text-meta font-semibold text-ink">
            “{minted.label}” created — copy both of these into a new Shortcut now. This token won’t be shown again.
          </p>
          <div>
            <span className="block text-caption uppercase tracking-wide text-ink-faint">Endpoint URL</span>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xs bg-surface px-3 py-2 text-meta text-ink-soft">{ENDPOINT}</code>
              <button
                onClick={() => copy(ENDPOINT, setCopiedUrl)}
                className="shrink-0 min-h-11 rounded-pill border border-line px-3 text-meta font-semibold text-ink"
              >
                {copiedUrl ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div>
            <span className="block text-caption uppercase tracking-wide text-ink-faint">Token</span>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xs bg-surface px-3 py-2 text-meta text-ink-soft">{minted.token}</code>
              <button
                onClick={() => copy(minted.token, setCopiedToken)}
                className="shrink-0 min-h-11 rounded-pill border border-line px-3 text-meta font-semibold text-ink"
              >
                {copiedToken ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <p className="text-meta text-ink-soft">
            In Shortcuts: add “Get Contents of URL”, set it to POST the endpoint with header{' '}
            <code className="text-ink">Authorization: Bearer &lt;token&gt;</code> and JSON body{' '}
            <code className="text-ink">{'{ "name": <your text> }'}</code>. Name the Shortcut “Add to Trolley” so “Hey
            Siri, add milk to Trolley” runs it.
          </p>
          <button onClick={() => setMinted(null)} className="text-meta font-semibold text-brand">
            Done
          </button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-body text-ink-soft">
            Set up “Hey Siri, add milk to Trolley” — mints a token for one iOS Shortcut to add items, nothing else.
          </p>
          {rows.length > 0 && (
            <ul className="mb-3 divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-item text-ink">{r.label}</span>
                    <span className="text-meta text-ink-soft">
                      {r.last_used_at ? `Last used ${new Date(r.last_used_at).toLocaleDateString()}` : 'Never used yet'}
                    </span>
                  </span>
                  <button
                    onClick={() => revoke(r.id)}
                    aria-label={`Revoke ${r.label}`}
                    className="shrink-0 min-h-11 rounded-pill border border-line px-4 text-meta font-semibold text-ink-soft"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={mint}
            disabled={minting}
            className="min-h-11 rounded-pill bg-brand px-5 text-meta font-semibold text-on-brand disabled:opacity-40"
          >
            {minting ? 'Creating…' : 'Set up a Shortcut'}
          </button>
        </>
      )}
    </div>
  );
}
