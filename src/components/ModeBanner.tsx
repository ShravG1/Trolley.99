interface Props {
  shopperName: string;
}

// ModeBanner (§2.7) — "X's shopping" while the group spectates.
export function ModeBanner({ shopperName }: Props) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-brand-tint px-4 py-2 text-meta font-semibold text-brand-strong">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
      </span>
      {shopperName}’s shopping
    </div>
  );
}
