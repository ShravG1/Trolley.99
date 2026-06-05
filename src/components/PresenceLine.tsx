interface Props {
  names: string[];
}

// PresenceLine (§2.2, §3) — subtle "Mum's looking too", fed by the live Realtime
// presence channel. Throttled upstream in useSupabaseSync to spare battery
// (§6.4); this stays dumb and just renders whoever's currently watching.
export function PresenceLine({ names }: Props) {
  if (names.length === 0) return null;
  const text =
    names.length === 1
      ? `${names[0]}’s looking too`
      : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} are looking too`;
  // Polite live region so a screen reader announces when someone starts/stops
  // viewing, rather than the change landing silently.
  return <p aria-live="polite" className="px-4 pt-1 text-caption text-ink-faint">{text}</p>;
}
