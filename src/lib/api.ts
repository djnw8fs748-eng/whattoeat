/* All calls to the Python API (api/main.py) live here. Each one throws
   if the server answers with an error status, so a failed request can
   never be mistaken for real data (e.g. an error body saved as the plan). */
import type { HistoryWeek, Plan, Rating, Ratings, Recipe } from '../types';
import type { DayKey } from '../types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

function sendJson<T>(url: string, method: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  // Static files served alongside the page
  getRecipes: () => request<Recipe[]>('recipes.json'),
  getRecipeIndex: () => request<{ title: string }[]>('recipes/_index.json'),

  getPlan: () => request<Plan>('/api/plan'),
  setDay: (day: DayKey, recipe: string | null, servings?: number) =>
    sendJson<Plan>(`/api/plan/${day}`, 'PATCH', recipe === null ? { recipe: null } : { recipe, servings }),

  getRatings: () => request<Ratings>('/api/ratings'),
  setRating: (title: string, rating: Rating | null) =>
    sendJson<Ratings>(`/api/ratings/${encodeURIComponent(title)}`, 'PUT', { rating }),

  getTemplateNames: () => request<string[]>('/api/templates'),
  saveTemplate: (name: string, plan: Plan) => sendJson<unknown>('/api/templates', 'POST', { name, plan }),
  applyTemplate: (name: string) =>
    request<Plan>(`/api/templates/${encodeURIComponent(name)}/apply`, { method: 'POST' }),

  getHistoryWeeks: () => request<HistoryWeek[]>('/api/plan/history'),
  getHistoryWeek: (weekKey: string) => request<Plan>(`/api/plan/history/${weekKey}`),
  copyHistoryWeek: (weekKey: string) =>
    request<Plan>(`/api/plan/history/${weekKey}/copy`, { method: 'POST' }),
};
