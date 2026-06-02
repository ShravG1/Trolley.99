import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { AISLES } from '@/lib/aisles';

// Settings (§2.1 invite, §2.8 recurring, §2.9 reporting gate, §11 privacy).
export function Settings() {
  const members = useStore((s) => s.members);
  const items = useStore((s) => s.items);
  const deleted = items.filter((i) => i.status === 'deleted');

  const [copied, setCopied] = useState(false);
  const [reportingOn, setReportingOn] = useState(false); // off by default (§2.9, §11.3)

  const inviteLink = `${window.location.origin}/join/TRLY-7K3M`;

  async function copy() {
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
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-xs bg-surface-2 px-3 py-2 text-meta text-ink">{inviteLink}</code>
          <button onClick={copy} className="min-h-11 rounded-pill bg-brand px-4 text-meta font-semibold text-on-brand">
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
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

      {/* Recurring */}
      <Section title="Recurring items">
        <p className="mb-3 text-body text-ink-soft">
          Routine bits that get added to the list on schedule — they land with an “Added on schedule” note.
        </p>
        <RecurringDemo />
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

function RecurringDemo() {
  const [rows, setRows] = useState([
    { id: '1', name: 'Milk', rule: 'weekly', on: true },
    { id: '2', name: 'Bin bags', rule: 'weekly', on: true },
    { id: '3', name: 'Cat food', rule: 'twice_weekly', on: false },
  ]);
  const labels: Record<string, string> = {
    daily: 'Daily',
    twice_weekly: 'Twice a week',
    thrice_weekly: '3× a week',
    weekly: 'Weekly',
  };
  void AISLES;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-3">
          <span className="flex flex-col">
            <span className="text-item text-ink">{r.name}</span>
            <span className="text-meta text-ink-soft">{labels[r.rule]}</span>
          </span>
          <Toggle
            on={r.on}
            label={`${r.name} recurring`}
            onChange={(v) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, on: v } : x)))}
          />
        </li>
      ))}
    </ul>
  );
}
