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
}
