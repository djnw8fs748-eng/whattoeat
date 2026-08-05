import { Page } from '@playwright/test';

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type Plan = Record<Day, string | null>;

const EMPTY_PLAN: Plan = { mon: null, tue: null, wed: null, thu: null, fri: null };

export async function setupMockApi(page: Page, initialPlan: Partial<Plan> = {}): Promise<void> {
  const plan: Plan = { ...EMPTY_PLAN, ...initialPlan };

  await page.route(/\/api\/plan/, async (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/').filter(Boolean);
    // segments for GET /api/plan  → ['api', 'plan']
    // segments for PATCH /api/plan/mon → ['api', 'plan', 'mon']

    if (segments.length === 2 && route.request().method() === 'GET') {
      await route.fulfill({ json: { ...plan } });
    } else if (segments.length === 3 && route.request().method() === 'PATCH') {
      const dayStr = segments[2];
      const VALID_DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
      if (!VALID_DAYS.includes(dayStr as Day)) {
        await route.continue();
        return;
      }
      const day = dayStr as Day;
      const body = JSON.parse(route.request().postData() ?? '{}') as { recipe: string | null };
      plan[day] = body.recipe;
      await route.fulfill({ json: { ...plan } });
    } else {
      await route.continue();
    }
  });
}
