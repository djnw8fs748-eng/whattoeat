/* Shapes of the data the app works with. TypeScript uses these to
   catch mistakes (e.g. passing a number where text is expected)
   before the code ever runs. */

export interface Ingredient {
  qty: number | null;
  unit: string | null;
  item: string;
}

export interface Recipe {
  title: string;
  category: string;
  time: number;
  servings: number;
  teaser: string;
  ingredients: Ingredient[];
  steps: string[];
}

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export interface PlanEntry {
  recipe: string;
  servings: number;
}

export type Plan = Record<DayKey, PlanEntry | null>;

export const EMPTY_PLAN: Plan = {
  mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
};

export type Rating = 'up' | 'down';
export type Ratings = Record<string, Rating>;

export interface Filters {
  search: string;
  category: string;
  /** 999 means "any time". */
  maxTime: number;
  allergens: string[];
  likedOnly: boolean;
}

export const NO_FILTERS: Filters = {
  search: '',
  category: '',
  maxTime: 999,
  allergens: [],
  likedOnly: false,
};

export interface HistoryWeek {
  week_key: string;
  days_filled: number;
}
