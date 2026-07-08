interface Props {
  names: string[];
}

// WatchedBanner — the flip side of a silent run (§2.6). You slipped off without
// pinging anyone, so if someone's actually watching the list live, don't let it
// pass quietly: call it out hard with eyes. Only rendered by Home when the trip
// was a silent run AND there's at least one watcher, so `names` is never empty.
export function WatchedBanner({ names }: Props) {
  if (names.length === 0) return null;
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'is' : 'are';
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-md bg-urgent-tint px-4 py-2 text-center text-meta font-semibold text-urgent"
    >
      <span aria-hidden="true" className="text-item leading-none">👀</span>
      <span className="truncate">
        {who} {verb} watching your shop
      </span>
    </div>
  );
}
