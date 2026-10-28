/* Pure recipe logic: filtering, quantity scaling and the "New" badge.
   Nothing in here touches the page, so it's easy to reason about. */
import type { Filters, Ingredient, Ratings, Recipe } from '../types';

export const RECENT_BADGE_COUNT = 10;

export const ALLERGENS: { key: string; label: string }[] = [
  { key: 'gluten', label: 'Gluten' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'eggs', label: 'Eggs' },
  { key: 'fish', label: 'Fish' },
  { key: 'shellfish', label: 'Shellfish' },
  { key: 'nuts', label: 'Nuts & Peanuts' },
  { key: 'soy', label: 'Soy' },
  { key: 'sesame', label: 'Sesame' },
  { key: 'mustard', label: 'Mustard' },
];

const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  gluten:    ['flour', 'bread', 'pasta', 'spaghetti', 'linguine', 'penne', 'fettuccine',
              'rigatoni', 'wheat', 'breadcrumb', 'noodle', 'tortilla', 'wrap', 'couscous',
              'pitta', 'pita'],
  dairy:     ['milk', 'cream', 'butter', 'cheese', 'parmesan', 'mozzarella', 'cheddar',
              'feta', 'ricotta', 'yogurt', 'yoghurt', 'crème fraîche', 'creme fraiche'],
  eggs:      ['egg'],
  fish:      ['salmon', 'tuna', 'cod', 'haddock', 'anchov', 'sardine', 'mackerel',
              'trout', 'bass', 'bream', 'tilapia', 'fish sauce', 'fish stock'],
  shellfish: ['prawn', 'shrimp', 'crab', 'lobster', 'scallop', 'mussel', 'clam', 'oyster'],
  nuts:      ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'peanut', 'pine nut'],
  soy:       ['soy sauce', 'soy', 'tofu', 'edamame', 'tempeh', 'miso'],
  sesame:    ['sesame', 'tahini'],
  mustard:   ['mustard'],
};

export const TIME_OPTIONS = [
  { value: 20, label: 'Under 20 min' },
  { value: 30, label: 'Under 30 min' },
  { value: 999, label: 'Any time' },
];

// Structured ingredients ({qty, unit, item}) are matched on their descriptive
// text. `unit` is included alongside `item` because the qty/unit/item parser
// sometimes captures descriptive words — e.g. "chicken" in "4 chicken thighs,
// skin on" — into `unit` rather than `item`.
function ingredientText(i: Ingredient): string {
  return `${i.unit ?? ''} ${i.item}`.toLowerCase();
}

function matchesSearch(r: Recipe, rawSearch: string): boolean {
  const search = rawSearch.trim().toLowerCase();
  if (search === '') return true;

  const hasIngredient = (term: string) => r.ingredients.some(i => ingredientText(i).includes(term));

  if (search.includes(',')) {
    const terms = search.split(',').map(t => t.trim()).filter(Boolean);
    if (terms.length <= 1) {
      // Trailing comma or a single comma-separated term — treat as a normal search
      const term = terms[0] || '';
      return term === '' || r.title.toLowerCase().includes(term) || hasIngredient(term);
    }
    // "chicken, rice" means the recipe must contain every ingredient
    return terms.every(hasIngredient);
  }
  return r.title.toLowerCase().includes(search) || hasIngredient(search);
}

export function filterRecipes(recipes: Recipe[], filters: Filters, ratings: Ratings): Recipe[] {
  return recipes.filter(r => {
    const matchesAllergens = filters.allergens.every(allergen =>
      !(ALLERGEN_KEYWORDS[allergen] || []).some(kw =>
        r.ingredients.some(i => ingredientText(i).includes(kw)),
      ),
    );
    return matchesSearch(r, filters.search)
      && (filters.category === '' || r.category === filters.category)
      && r.time <= filters.maxTime
      && matchesAllergens
      && (!filters.likedOnly || ratings[r.title] === 'up');
  });
}

/** How many filters (not counting search) are switched on — shown on the mobile Filters button. */
export function countActiveFilters(filters: Filters): number {
  return (filters.category !== '' ? 1 : 0)
    + (filters.maxTime !== 999 ? 1 : 0)
    + filters.allergens.length
    + (filters.likedOnly ? 1 : 0);
}

// The last N titles in recipes/_index.json (which the weekly automation
// always appends to) are the most recently added recipes. recipes.json's own
// order can't be used: its build step concatenates whole category files, so
// a new recipe in an existing category lands mid-array, not at the end.
export function getRecentTitles(recipes: Recipe[], addOrder: string[]): Set<string> {
  const source = addOrder.length > 0 ? addOrder : recipes.map(r => r.title);
  return new Set(source.slice(-RECENT_BADGE_COUNT));
}

/** Sorted, de-duplicated category names. */
export function getCategories(recipes: Recipe[]): string[] {
  return [...new Set(recipes.map(r => r.category))].sort();
}

// Units that read naturally glued to the number ("200g", "500ml").
// Everything else (including words the ingredient parser mistakenly put
// in the unit field) gets a space so the line stays readable.
const GLUED_UNITS = new Set(['g', 'kg', 'mg', 'ml', 'l', 'cl']);

function formatQty(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** "200g spaghetti" scaled by `ratio` (e.g. 1.5 for 3 servings of a 2-serving recipe). */
export function scaleIngredient(entry: Ingredient, ratio: number): string {
  if (entry.qty === null) return entry.item;
  const scaledQty = formatQty(entry.qty * ratio);
  if (!entry.unit) return `${scaledQty} ${entry.item}`;
  const separator = GLUED_UNITS.has(entry.unit.toLowerCase()) ? '' : ' ';
  return `${scaledQty}${separator}${entry.unit} ${entry.item}`;
}
