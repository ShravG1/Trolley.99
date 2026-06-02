import { Link } from 'react-router-dom';

// Short, honest privacy note (§11.2) + the account/group lifecycle controls
// that are usually forgotten (§11.4).
export function Privacy() {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/settings" aria-label="Back" className="grid h-11 w-11 place-items-center rounded-pill hover:bg-surface-2">
          ←
        </Link>
        <h1 className="font-display text-display-l text-ink">Privacy & your data</h1>
      </header>

      <div className="space-y-4 text-body text-ink-soft">
        <p>
          We store your email (to sign you in), your display name, the lists you share with your group,
          and a record of who added or bought what. That history is shared with everyone in your group.
        </p>
        <p>
          Reporting is off by default. If you turn it on, it counts who bought what — handy, but it
          profiles everyone in the household, so it stays opt-in and you can clear it whenever.
        </p>
        <p>UK GDPR: you can leave a group, delete your account, or wipe your history at any time below.</p>
      </div>

      <div className="mt-6 space-y-2">
        <LifecycleButton label="Clear trip history" tone="neutral" />
        <LifecycleButton label="Leave this group" tone="neutral" />
        <LifecycleButton label="Delete my account" tone="danger" />
      </div>
      <p className="mt-3 text-caption text-ink-faint">
        Deleting your account detaches you from the audit trail — your past actions stay as a snapshot name
        (“Mum binned this”) so the history still makes sense, but your email and login are removed.
      </p>
    </div>
  );
}

function LifecycleButton({ label, tone }: { label: string; tone: 'neutral' | 'danger' }) {
  return (
    <button
      className={`min-h-13 w-full rounded-md border px-4 text-left text-item font-semibold ${
        tone === 'danger' ? 'border-bin/40 text-bin' : 'border-line text-ink'
      }`}
    >
      {label}
    </button>
  );
}
