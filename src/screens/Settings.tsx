import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { guessAisle } from '@/lib/categorise';
import {
  isSupabaseConfigured,
  createInvite,
  supabase,
  attachEmail,
  listRecurring,
  addRecurring,
  setRecurringActive,
  deleteRecurring,
  type RecurringRow,
} from '@/lib/supabase';

// Settings (§2.1 invite, §2.8 recurring, §2.9 reporting gate, §11 privacy).
export function Settings() {
  const members = useStore((s) => s.members);
  const items = useStore((s) => s.items);
  const groupId = useStore((s) => s.trip.group_id);
  const deleted = items.filter((i) => i.status === 'deleted');

  const [copied, setCopied] = useState(false);
  const [reportingOn, setReportingOn] = useState(false); // off by default (§2.9, §11.3)
  const [code, setCode] = useState<string | null>(isSupabaseConfigured() ? null : 'TRLY-7K3M');
  const [minting, setMinting] = useState(false);

  const inviteLink = code ? `${window.location.origin}/join/${code}` : '';

  async function mint() {
    setMinting(true);
    try {
      const inv = await createInvite(groupId);
      if (inv) setCode(inv.code);
    } catch {
      /* ignore — surfaced by the empty link */
    } finally {
      setMinting(false);
    }
  }

  async function share() {
    if (!inviteLink) return;
    try {
      await navigator.share({ title: 'Join my Trolley list', text: 'Join my shopping list on Trolley:', url: inviteLink });
    } catch {
      /* user cancelled or unsupported — Copy is the fallback */
    }
  }

  async function copy() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/" aria-label="Back" className="grid h-11 w-11 place-items-center rounded-pill hover:bg-surface-2">
          ←
        </Link>
        <h1 className="font-display text-display-l text-ink">Settings</h1>
      </header>

      {/* Invite */}
      <Section title="Add people">
        <p className="mb-3 text-body text-ink-soft">Send this to whoever’s doing the shopping with you.</p>
        {inviteLink ? (
          <div className="space-y-2">
            <code className="block truncate rounded-xs bg-surface-2 px-3 py-2 text-meta text-ink">{inviteLink}</code>
            <div className="flex gap-2">
              {'share' in navigator && (
                <button onClick={share} className="min-h-11 flex-1 rounded-pill bg-brand px-4 text-meta font-semibold text-on-brand">
                  Share link
                </button>
              )}
              <button onClick={copy} className="min-h-11 flex-1 rounded-pill border border-line px-4 text-meta font-semibold text-ink">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={mint}
            disabled={minting}
            className="min-h-11 rounded-pill bg-brand px-5 text-meta font-semibold text-on-brand disabled:opacity-40"
          >
            {minting ? 'Creating…' : 'Create invite link'}
          </button>
        )}
        <p className="mt-2 text-caption text-ink-faint">Links expire after 7 days and can be revoked.</p>
      </Section>

      {/* People */}
      <Section title="Group">
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-3">
              <span className="text-item text-ink">{m.display_name}</span>
              <span className="text-meta text-ink-faint">member</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Account backup (anonymous → permanent) */}
      {isSupabaseConfigured() && (
        <Section title="Your list">
          <AccountBackup />
        </Section>
      )}

      {/* Recurring */}
      <Section title="Recurring items">
        <p className="mb-3 text-body text-ink-soft">
          Routine bits that get added to the list on schedule — they land with an “Added on schedule” note.
        </p>
        <RecurringManager />
      </Section>

      {/* Reporting gate */}
      <Section title="Reporting">
        <label className="flex items-center justify-between">
          <span className="flex flex-col">
            <span className="text-item text-ink">Track who buys what</span>
            <span className="max-w-[16rem] text-meta text-ink-soft">
              Off by default. A bit of fun — but it profiles everyone in the group, so it’s opt-in and deletable.
            </span>
          </span>
          <Toggle on={reportingOn} onChange={setReportingOn} label="Reporting" />
        </label>
        {reportingOn && (
          <Link to="/reporting" className="mt-3 inline-block text-meta font-semibold text-brand">
            Open reporting →
          </Link>
        )}
      </Section>

      {/* Archive + privacy */}
      <Section title="This trip">
        <Link to="/archive" className="flex items-center justify-between py-2 text-item text-ink">
          <span>Deleted items</span>
          <span className="tnum text-meta text-ink-faint">{deleted.length}</span>
        </Link>
        <Link to="/privacy" className="flex items-center justify-between py-2 text-item text-ink">
          <span>Privacy & your data</span>
          <span className="text-ink-faint">→</span>
        </Link>
      </Section>
    </div>
  );
}

// Optional email backup (§ auth): anonymous by default; attaching an email makes
// the account portable across devices. Low-friction, opt-in.
function AccountBackup() {
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [anon, setAnon] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      setAnon(data.user?.is_anonymous ?? true);
      setSavedEmail(data.user?.email ?? null);
    });
  }, []);

  if (!anon && savedEmail) {
    return (
      <p className="text-body text-ink-soft">
        Saved to <span className="font-semibold text-ink">{savedEmail}</span>. You can sign back in on any
        device with that email.
      </p>
    );
  }

  if (sent) {
    return <p className="text-body text-ink-soft">Check your email and tap the link to lock it in.</p>;
  }

  return (
    <div>
      <p className="mb-3 text-body text-ink-soft">
        Your list lives on this device right now. Add an email to keep it if you switch phones or clear your
        browser — optional, and we only use it to sign you back in.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 rounded-xs border border-line bg-surface-2 px-3 py-2 text-meta text-ink"
        />
        <button
          onClick={async () => {
            if (!email.trim()) return;
            setError('');
            try {
              await attachEmail(email.trim());
              setSent(true);
            } catch {
              setError('Couldn’t save that — try a different email.');
            }
          }}
          className="min-h-11 rounded-pill bg-brand px-4 text-meta font-semibold text-on-brand"
        >
          Save
        </button>
      </div>
      {error && <p className="mt-2 text-meta text-urgent">{error}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-md bg-surface p-4 shadow-e1">
      <h2 className="mb-2 text-aisle font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors ${on ? 'bg-brand' : 'bg-line'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-pill bg-white shadow-e1 transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

const RULE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_weekly: 'Twice a week',
  thrice_weekly: '3× a week',
  weekly: 'Weekly',
};

// Recurring items (§2.8). Persists to recurring_items when connected; falls back
// to a read-only demo list otherwise.
function RecurringManager() {
  const groupId = useStore((s) => s.trip.group_id);
  const live = isSupabaseConfigured();

  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [newName, setNewName] = useState('');
  const [newRule, setNewRule] = useState('weekly');

  useEffect(() => {
    if (live) listRecurring(groupId).then(setRows).catch(() => setRows([]));
  }, [live, groupId]);

  const demo: RecurringRow[] = [
    { id: '1', name: 'Milk', default_qty: 1, category: 'dairy', recurrence_rule: 'weekly', active: true },
    { id: '2', name: 'Bin bags', default_qty: 1, category: 'household', recurrence_rule: 'weekly', active: true },
  ];
  const data = live ? rows : demo;

  async function add() {
    if (!newName.trim() || !live) return;
    await addRecurring(groupId, newName.trim(), newRule, guessAisle(newName));
    setNewName('');
    setRows(await listRecurring(groupId));
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {data.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-3">
            <span className="flex flex-col">
              <span className="text-item text-ink">{r.name}</span>
              <span className="text-meta text-ink-soft">{RULE_LABELS[r.recurrence_rule] ?? r.recurrence_rule}</span>
            </span>
            <div className="flex items-center gap-3">
              <Toggle
                on={r.active}
                label={`${r.name} recurring`}
                onChange={async (v) => {
                  setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, active: v } : x)));
                  if (live) await setRecurringActive(r.id, v);
                }}
              />
              {live && (
                <button
                  aria-label={`Delete ${r.name}`}
                  onClick={async () => {
                    setRows((rs) => rs.filter((x) => x.id !== r.id));
                    await deleteRecurring(r.id);
                  }}
                  className="text-ink-faint hover:text-bin"
                >
                  ✕
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {live && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add a routine item…"
            maxLength={80}
            className="min-w-0 flex-1 rounded-xs border border-line bg-surface-2 px-3 py-2 text-meta text-ink"
          />
          <select
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            className="rounded-xs border border-line bg-surface-2 px-2 py-2 text-meta text-ink"
          >
            {Object.entries(RULE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button onClick={add} className="min-h-11 rounded-pill bg-brand px-4 text-meta font-semibold text-on-brand">
            Add
          </button>
        </div>
      )}
    </div>
  );
}
