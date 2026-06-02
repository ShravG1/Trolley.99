interface Props {
  names: string[];
}

// PresenceLine (§2.2, §3) — subtle "Mum's looking too". Throttled in real use
// to spare battery (§6.4); here it just renders the current watchers.
export function PresenceLine({ names }: Props) {
  if (names.length === 0) return null;
  const text =
    names.length === 1
      ? `${names[0]}’s looking too`
      : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} are looking too`;
  return <p className="px-4 pt-1 text-caption text-ink-faint">{text}</p>;
}
