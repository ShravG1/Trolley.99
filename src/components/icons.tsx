// Item-state glyphs (§2.3). State is icon + text + position + colour — never
// colour alone (§1.8). Plain inline SVGs, no icon library.

interface IconProps {
  className?: string;
  size?: number;
}

const svg = (size: number, className: string | undefined, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const PendingIcon = ({ className, size = 22 }: IconProps) =>
  svg(size, className, <circle cx="12" cy="12" r="9" />);

export const UrgentIcon = ({ className, size = 22 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </>
  );

export const BoughtIcon = ({ className, size = 22 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity="0.18" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </>
  );

export const SubIcon = ({ className, size = 22 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M4 8h12l-3-3" />
      <path d="M20 16H8l3 3" />
    </>
  );

export const NotFoundIcon = ({ className, size = 22 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </>
  );

export const BinIcon = ({ className, size = 20 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>
  );

export const KebabIcon = ({ className, size = 20 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </>
  );

export const SunIcon = ({ className, size = 20 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  );

export const MoonIcon = ({ className, size = 20 }: IconProps) =>
  svg(size, className, <path d="M21 12.8A8 8 0 1 1 11.2 3a6 6 0 0 0 9.8 9.8z" />);

export const PlusIcon = ({ className, size = 22 }: IconProps) =>
  svg(size, className, <><path d="M12 5v14" /><path d="M5 12h14" /></>);

export const ChevronDownIcon = ({ className, size = 18 }: IconProps) =>
  svg(size, className, <path d="M6 9l6 6 6-6" />);

export const CheckIcon = ({ className, size = 20 }: IconProps) =>
  svg(size, className, <path d="M5 12.5l4.5 4.5L19 7.5" />);

export const ChevronRightIcon = ({ className, size = 18 }: IconProps) =>
  svg(size, className, <path d="M9 6l6 6-6 6" />);

export const GearIcon = ({ className, size = 20 }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  );
