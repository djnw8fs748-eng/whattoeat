import { Page } from '@playwright/test';

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DayEntry = { recipe: string; servings: number } | null;
type Plan = Record<Day, DayEntry>;

const VALID_DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const EMPTY_PLAN: Plan = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

export async function setupMockApi(page: Page, initialPlan: Partial<Plan> = {}): Promise<void> {
  const plan: Plan = { ...EMPTY_PLAN, ...initialPlan };

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
}
