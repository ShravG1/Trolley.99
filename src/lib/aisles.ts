// Aisle system (§1.3) — the single source mapping an item's category to its
// aisle key, UK-English label, shop-walk order, and colour token.
// Colour is wayfinding, NEVER the sole carrier of meaning — always paired with
// the label (§1.3, §1.8).

export type AisleKey =
  | 'produce'
  | 'dairy'
  | 'bakery'
  | 'meat'
  | 'frozen'
  | 'cupboard'
  | 'drinks'
  | 'snacks'
  | 'household'
  | 'health'
  | 'baby'
  | 'other';

export interface Aisle {
  key: AisleKey;
  label: string;
  /** Order you actually walk the shop in. */
  order: number;
  /** CSS custom property holding the solid colour. */
  colorVar: string;
}

export const AISLES: Record<AisleKey, Aisle> = {
  produce: { key: 'produce', label: 'Fruit & Veg', order: 1, colorVar: '--aisle-produce' },
  bakery: { key: 'bakery', label: 'Bakery', order: 2, colorVar: '--aisle-bakery' },
  meat: { key: 'meat', label: 'Meat & Fish', order: 3, colorVar: '--aisle-meat' },
  dairy: { key: 'dairy', label: 'Dairy & Eggs', order: 4, colorVar: '--aisle-dairy' },
  cupboard: {
    key: 'cupboard',
    label: 'Tins, Packets & Cupboard',
    order: 5,
    colorVar: '--aisle-cupboard',
  },
  snacks: { key: 'snacks', label: 'Snacks & Treats', order: 6, colorVar: '--aisle-snacks' },
  drinks: { key: 'drinks', label: 'Drinks', order: 7, colorVar: '--aisle-drinks' },
  frozen: { key: 'frozen', label: 'Frozen', order: 8, colorVar: '--aisle-frozen' },
  household: {
    key: 'household',
    label: 'Household & Cleaning',
    order: 9,
    colorVar: '--aisle-household',
  },
  health: { key: 'health', label: 'Health & Beauty', order: 10, colorVar: '--aisle-health' },
  baby: { key: 'baby', label: 'Baby & Pets', order: 11, colorVar: '--aisle-baby' },
  other: { key: 'other', label: 'Other', order: 99, colorVar: '--aisle-other' },
};

export const AISLE_ORDER: AisleKey[] = Object.values(AISLES)
  .sort((a, b) => a.order - b.order)
  .map((a) => a.key);

/** The solid colour for an aisle (used directly in style attributes). */
export function aisleColor(key: AisleKey): string {
  return `var(${AISLES[key].colorVar})`;
}

/** Derived row tint: aisle solid mixed into the surface (§1.3). */
export function aisleTint(key: AisleKey): string {
  return `color-mix(in srgb, var(${AISLES[key].colorVar}) var(--aisle-tint-amount), var(--surface))`;
}
