import { Page } from '@playwright/test';

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DayEntry = { recipe: string; servings: number } | null;
type Plan = Record<Day, DayEntry>;

const VALID_DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const EMPTY_PLAN: Plan = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

export async function setupMockApi(
  page: Page,
  initialPlan: Partial<Plan> = {},
  historyWeeks: Record<string, Plan> = {}
): Promise<void> {
  const plan: Plan = { ...EMPTY_PLAN, ...initialPlan };
  const history: Record<string, Plan> = { ...historyWeeks };

  // Registered first = lowest priority relative to routes registered later
  // (Playwright gives matching priority to the MOST RECENTLY registered route).
  // /api/plan/history also matches this broad /api/plan(\/|$) pattern, so the
  // more specific /api/plan/history handler below must be registered AFTER
  // this one, or the specific one would never run.
  await page.route(/\/api\/plan(\/|$)/, async (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/').filter(Boolean);
    // GET /api/plan → ['api', 'plan']
    // PATCH /api/plan/mon → ['api', 'plan', 'mon']

    if (segments.length === 2 && route.request().method() === 'GET') {
      await route.fulfill({ json: { ...plan } });
    } else if (segments.length === 3 && route.request().method() === 'PATCH') {
      const dayStr = segments[2];
      if (!VALID_DAYS.includes(dayStr as Day)) {
        await route.continue();
        return;
      }
      const day = dayStr as Day;
      const body = JSON.parse(route.request().postData() ?? '{}') as { recipe: string | null; servings?: number };
      plan[day] = body.recipe === null ? null : { recipe: body.recipe, servings: body.servings ?? 1 };
      await route.fulfill({ json: { ...plan } });
    } else {
      await route.continue();
    }
  });

  const templates: Record<string, Plan> = {};

  await page.route(/\/api\/templates/, async (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/').filter(Boolean);
    const method = route.request().method();

    if (segments.length === 2 && method === 'GET') {
      await route.fulfill({ json: Object.keys(templates) });
    } else if (segments.length === 2 && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as { name: string; plan: Plan };
      templates[body.name] = body.plan;
      await route.fulfill({ json: { name: body.name } });
    } else if (segments.length === 4 && segments[3] === 'apply' && method === 'POST') {
      const name = decodeURIComponent(segments[2]);
      if (!(name in templates)) {
        await route.fulfill({ status: 404, json: { detail: 'not found' } });
        return;
      }
      Object.assign(plan, templates[name]);
      await route.fulfill({ json: { ...plan } });
    } else {
      await route.continue();
    }
  });

  // Registered last = highest priority, so this correctly intercepts
  // /api/plan/history* before the broader /api/plan(\/|$) handler above can.
  await page.route(/\/api\/plan\/history/, async (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/').filter(Boolean);
    const method = route.request().method();
    // GET /api/plan/history → ['api', 'plan', 'history']
    // GET /api/plan/history/2026-08-03 → ['api', 'plan', 'history', '2026-08-03']
    // POST /api/plan/history/2026-08-03/copy → ['api', 'plan', 'history', '2026-08-03', 'copy']

    if (segments.length === 3 && method === 'GET') {
      const weeks = Object.keys(history).sort().reverse()
        .map(week_key => ({ week_key, days_filled: Object.values(history[week_key]).filter(Boolean).length }));
      await route.fulfill({ json: weeks });
    } else if (segments.length === 4 && method === 'GET') {
      const weekKey = segments[3];
      if (!(weekKey in history)) {
        await route.fulfill({ status: 404, json: { detail: 'not found' } });
        return;
      }
      await route.fulfill({ json: history[weekKey] });
    } else if (segments.length === 5 && segments[4] === 'copy' && method === 'POST') {
      const weekKey = segments[3];
      if (!(weekKey in history)) {
        await route.fulfill({ status: 404, json: { detail: 'not found' } });
        return;
      }
      Object.assign(plan, history[weekKey]);
      await route.fulfill({ json: { ...plan } });
    } else {
      await route.continue();
    }
  });
}
