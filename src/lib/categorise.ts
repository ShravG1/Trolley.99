import { isAisleKey, type AisleKey } from './aisles';
import type { CategoryMemory } from './categoryMemory';

// Lightweight keyword auto-categoriser (§2.4). It WILL be wrong sometimes — the
// re-aisle affordance in the AddSheet is mandatory. Kept client-side and dumb on
// purpose; it's the FALLBACK now — the household's learned memory (migration
// 0016, see resolveAisle below) is the smarter signal, and it wins.

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

/** Normalise a name for dedupe / hot-list matching (§7.4). Must stay in step with
 *  the DB's `norm_item_name()` (migration 0016) or the learned memory won't match
 *  what the server stored. */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Which aisle does this household put this thing in? (§2.4, migration 0016.)
 *
 * The learned memory wins: if anyone in the group has re-aisled this name — or
 * the weekly sweep has worked out where they actually file it — that's the
 * answer, and the keyword guess never gets a look-in. Otherwise fall back to
 * guessAisle. Unknown/absent memory is always safe: `resolveAisle(name)` is
 * exactly the old behaviour.
 */
export function resolveAisle(name: string, memory?: CategoryMemory | null): AisleKey {
  const n = normaliseName(name);
  if (!n) return 'other';
  const learned = memory?.[n];
  // Re-validate: memory can come from localStorage, which is user-writable.
  if (isAisleKey(learned)) return learned;
  return guessAisle(name);
}
