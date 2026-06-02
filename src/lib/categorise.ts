import type { AisleKey } from './aisles';

// Lightweight keyword auto-categoriser (§2.4). It WILL be wrong sometimes — the
// re-aisle affordance in the AddSheet is mandatory. Kept client-side and dumb on
// purpose; the hot list (server-learned) is the smarter signal over time.

const KEYWORDS: Array<[AisleKey, string[]]> = [
  ['produce', ['apple', 'banana', 'tomato', 'potato', 'onion', 'lettuce', 'carrot', 'salad', 'veg', 'fruit', 'avocado', 'lemon', 'lime', 'pepper', 'cucumber', 'spinach', 'broccoli', 'garlic', 'mushroom', 'berries', 'grapes']],
  ['dairy', ['milk', 'cheese', 'butter', 'yoghurt', 'yogurt', 'egg', 'cream', 'margarine']],
  ['bakery', ['bread', 'roll', 'bagel', 'croissant', 'cake', 'bun', 'baguette', 'pitta', 'wrap', 'tortilla', 'muffin']],
  ['meat', ['chicken', 'beef', 'pork', 'lamb', 'mince', 'sausage', 'bacon', 'fish', 'salmon', 'tuna', 'prawn', 'ham', 'turkey']],
  ['frozen', ['frozen', 'ice cream', 'ice lolly', 'peas', 'chips', 'fish finger']],
  ['cupboard', ['pasta', 'rice', 'flour', 'sugar', 'tin', 'beans', 'soup', 'sauce', 'oil', 'vinegar', 'spice', 'cereal', 'oats', 'noodle', 'stock', 'lentil', 'tinned']],
  ['drinks', ['water', 'juice', 'squash', 'cola', 'coke', 'lemonade', 'beer', 'wine', 'tea', 'coffee', 'drink', 'cordial']],
  ['snacks', ['crisp', 'chocolate', 'sweets', 'biscuit', 'snack', 'nuts', 'crackers', 'popcorn', 'treat']],
  ['household', ['washing', 'detergent', 'bleach', 'cleaner', 'soap', 'sponge', 'bin bag', 'foil', 'cling film', 'kitchen roll', 'toilet roll', 'loo roll', 'tissue']],
  ['health', ['shampoo', 'toothpaste', 'toothbrush', 'deodorant', 'razor', 'plaster', 'paracetamol', 'ibuprofen', 'vitamin', 'shower gel', 'conditioner', 'sanitary', 'tampon']],
  ['baby', ['nappy', 'nappies', 'wipes', 'baby', 'formula', 'dog', 'cat', 'pet', 'litter', 'kibble']],
];

export function guessAisle(name: string): AisleKey {
  const n = name.trim().toLowerCase();
  if (!n) return 'other';
  // Prefer the longest (most specific) matching keyword so "loo roll" (household)
  // beats "roll" (bakery). Auto-categorisation will still be wrong sometimes —
  // the re-aisle affordance is mandatory (§2.4).
  let best: { aisle: AisleKey; len: number } | null = null;
  for (const [aisle, words] of KEYWORDS) {
    for (const w of words) {
      if (n.includes(w) && (!best || w.length > best.len)) {
        best = { aisle, len: w.length };
      }
    }
  }
  return best?.aisle ?? 'other';
}

/** Normalise a name for dedupe / hot-list matching (§7.4). */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
