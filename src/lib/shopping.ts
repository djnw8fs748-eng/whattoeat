/* Builds the shopping list from the week's plan: scales each recipe to
   its planned servings, merges matching ingredients, and groups them
   by supermarket aisle. */
import { DAY_KEYS, type Plan, type Recipe } from '../types';
import { scaleIngredient } from './recipes';

// Keyword -> aisle mapping. First match wins, so order matters.
// Anything unmatched lands in "Other" rather than being dropped.
const AISLE_KEYWORDS: [string, string[]][] = [
  ['Produce', ['onion', 'garlic', 'tomato', 'pepper', 'carrot', 'potato', 'spinach',
    'lettuce', 'cucumber', 'avocado', 'lime', 'lemon', 'ginger', 'chilli', 'chili',
    'coriander', 'parsley', 'basil', 'courgette', 'broccoli', 'cauliflower', 'apple',
    'banana', 'celery', 'kale', 'spring onion', 'leek', 'aubergine', 'sweet potato',
    'apricot', 'mango']],
  ['Meat & Fish', ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage',
    'mince', 'salmon', 'tuna', 'cod', 'shrimp', 'prawn', 'fish', 'haddock']],
  ['Dairy & Eggs', ['milk', 'cream', 'butter', 'cheese', 'parmesan', 'mozzarella',
    'cheddar', 'feta', 'yogurt', 'yoghurt', 'egg']],
  ['Bakery', ['bread', 'tortilla', 'wrap', 'pitta', 'pita', 'naan', 'bun']],
  ['Frozen', ['frozen']],
  ['Pantry', ['rice', 'pasta', 'noodle', 'flour', 'sugar', 'oil', 'vinegar', 'sauce',
    'stock', 'spice', 'curry powder', 'cumin', 'paprika', 'salt', 'herb', 'tin',
    'canned', 'chickpea', 'lentil', 'bean', 'coconut milk', 'honey', 'soy sauce']],
];
const AISLE_ORDER = [...AISLE_KEYWORDS.map(([name]) => name), 'Other'];

// Checked before AISLE_KEYWORDS: some Pantry items contain a Produce word
// ("chilli flakes" contains "chilli", "salt and pepper" contains "pepper"),
// which is only right for the fresh version. These phrases win so the
// dried/jarred/ground form lands in Pantry.
const PANTRY_OVERRIDES = [
  'salt and pepper', 'salt and black pepper', 'chilli flakes', 'chilli powder',
  'chilli paste', 'chilli sauce', 'chilli oil', 'ground coriander', 'coriander seeds',
];

function categorizeItem(item: string): string {
  const text = item.toLowerCase();
  if (PANTRY_OVERRIDES.some(kw => text.includes(kw))) return 'Pantry';
  const match = AISLE_KEYWORDS.find(([, keywords]) => keywords.some(kw => text.includes(kw)));
  return match ? match[0] : 'Other';
}

export interface ShoppingItem {
  label: string;
  /** Normalised ingredient name, used for alphabetical sorting. */
  sortKey: string;
}

export interface ShoppingGroup {
  name: string;
  items: ShoppingItem[];
}

export function buildShoppingList(plan: Plan, recipes: Recipe[]): ShoppingGroup[] {
  // key -> running total for that ingredient
  const merged = new Map<string, { qty: number | null; unit: string | null; item: string; sortKey: string }>();

  for (const day of DAY_KEYS) {
    const entry = plan[day];
    if (!entry) continue;
    const r = recipes.find(x => x.title === entry.recipe);
    if (!r) continue;
    const ratio = entry.servings / r.servings;

    for (const ing of r.ingredients) {
      const normalizedItem = ing.item.trim().toLowerCase();

      if (ing.qty === null) {
        // No-quantity ingredients ("salt to taste"): de-duplicate, never sum.
        const key = `unparsed|${normalizedItem}`;
        if (!merged.has(key)) {
          merged.set(key, { qty: null, unit: null, item: ing.item.trim(), sortKey: normalizedItem });
        }
        continue;
      }

      const key = `${(ing.unit || '').trim().toLowerCase()}|${normalizedItem}`;
      const scaledQty = ing.qty * ratio;
      const existing = merged.get(key);
      if (existing && existing.qty !== null) {
        existing.qty += scaledQty;
      } else {
        merged.set(key, { qty: scaledQty, unit: ing.unit, item: ing.item.trim(), sortKey: normalizedItem });
      }
    }
  }

  const rows = [...merged.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const groups = new Map<string, ShoppingItem[]>(AISLE_ORDER.map(name => [name, []]));
  for (const row of rows) {
    groups.get(categorizeItem(row.item))!.push({
      label: scaleIngredient({ qty: row.qty, unit: row.unit, item: row.item }, 1),
      sortKey: row.sortKey,
    });
  }

  return AISLE_ORDER
    .map(name => ({ name, items: groups.get(name)! }))
    .filter(g => g.items.length > 0);
}
