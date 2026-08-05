# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Playwright E2E test suite for the frontend and expanded pytest edge-case tests for the API, both wired into the existing GitHub Actions CI pipeline.

**Architecture:** Playwright tests live in `tests/e2e/` and intercept all `/api/` calls via `page.route()` so no Docker/nginx is needed — `serve` hosts the static site locally. Expanded API tests go into `api/tests/test_edge_cases.py` alongside the existing `test_main.py`.

**Tech Stack:** `@playwright/test` (Chromium only), `serve` (static dev server), `pytest` + `threading` (API edge cases), GitHub Actions `setup-node@v4`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `tests/e2e/package.json` | Create | npm project with Playwright + serve as devDependencies |
| `tests/e2e/tsconfig.json` | Create | TypeScript config for test files |
| `tests/e2e/playwright.config.ts` | Create | Base URL, webServer, Chromium config |
| `tests/e2e/fixtures/mock-api.ts` | Create | `setupMockApi(page, initialPlan?)` helper |
| `tests/e2e/test_browse.spec.ts` | Create | 7 browse tab tests |
| `tests/e2e/test_fridge.spec.ts` | Create | 4 fridge search tests |
| `tests/e2e/test_recipe.spec.ts` | Create | 3 recipe panel tests |
| `tests/e2e/test_plan.spec.ts` | Create | 7 plan tab tests |
| `tests/e2e/test_shopping.spec.ts` | Create | 4 shopping list tests |
| `api/tests/test_edge_cases.py` | Create | 4 API edge-case tests |
| `.github/workflows/docker-publish.yml` | Modify | Add Playwright step; expand pytest to cover `api/tests/` |

---

## Task 1: Playwright Project Scaffold

**Files:**
- Create: `tests/e2e/package.json`
- Create: `tests/e2e/tsconfig.json`
- Create: `tests/e2e/playwright.config.ts`

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p tests/e2e/fixtures
```

Write `tests/e2e/package.json`:

```json
{
  "name": "whattoeat-e2e",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "serve": "^14.2.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Write `tests/e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 3: Create playwright.config.ts**

Write `tests/e2e/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'npx serve . -l 3000',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 4: Install dependencies and Playwright browsers**

```bash
cd tests/e2e && npm install && npx playwright install chromium
```

Expected: `package-lock.json` created, Chromium downloaded. No errors.

- [ ] **Step 5: Verify config is parseable**

```bash
cd tests/e2e && npx playwright test --list
```

Expected: output showing 0 test files found (we haven't written any yet). No crash.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/package.json tests/e2e/package-lock.json tests/e2e/tsconfig.json tests/e2e/playwright.config.ts
git commit -m "test: scaffold Playwright e2e project"
```

---

## Task 2: Mock API Fixture

**Files:**
- Create: `tests/e2e/fixtures/mock-api.ts`

The mock intercepts all `/api/plan` traffic with a single regex route handler. GET returns the current in-memory plan; PATCH extracts the day from the URL, updates the in-memory object, and returns it. This means the mock is stateful per `setupMockApi` call — each test that calls it gets its own isolated plan.

- [ ] **Step 1: Write the fixture**

Write `tests/e2e/fixtures/mock-api.ts`:

```typescript
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
      const day = segments[2] as Day;
      const body = JSON.parse(route.request().postData() ?? '{}') as { recipe: string | null };
      plan[day] = body.recipe;
      await route.fulfill({ json: { ...plan } });
    } else {
      await route.continue();
    }
  });
}
```

- [ ] **Step 2: Type-check the fixture**

```bash
cd tests/e2e && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures/mock-api.ts
git commit -m "test: add setupMockApi fixture for Playwright tests"
```

---

## Task 3: Browse Tab Tests

**Files:**
- Create: `tests/e2e/test_browse.spec.ts`

Recipe facts used in these tests (from `recipes.json`):
- Total recipes: 80
- "Garlic Butter Pasta with Parmesan" — exact title, category "Pasta", time 15 min
- "Tuna & Sweetcorn Pasta Bake" — time 35 min (over 30)
- Under-30-min recipes: 66
- Searching "400g" matches ingredient strings but no recipe titles

- [ ] **Step 1: Write the tests**

Write `tests/e2e/test_browse.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('page loads with all recipe cards', async ({ page }) => {
  await expect(page.locator('.card')).toHaveCount(80);
});

test('text search by name filters cards', async ({ page }) => {
  await page.fill('#searchInput', 'Garlic Butter Pasta with Parmesan');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card h3').first()).toContainText('Garlic Butter Pasta with Parmesan');
});

test('text search by ingredient filters cards', async ({ page }) => {
  // '400g' appears in many ingredient strings but in no recipe titles
  await page.fill('#searchInput', '400g');
  const count = await page.locator('.card').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(80);
});

test('category filter shows only matching category', async ({ page }) => {
  await page.selectOption('#catSelect', 'Pasta');
  const pills = page.locator('.card .pill');
  const count = await pills.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(pills.nth(i)).toHaveText('Pasta');
  }
});

test('time filter hides recipes over 30 minutes', async ({ page }) => {
  await page.locator('.chip[data-time="30"]').click();
  await expect(page.locator('.card[data-title="Tuna & Sweetcorn Pasta Bake"]')).not.toBeVisible();
  await expect(page.locator('.card')).toHaveCount(66);
});

test('clear filters restores all cards', async ({ page }) => {
  await page.fill('#searchInput', 'pasta');
  await expect(page.locator('.card')).not.toHaveCount(80);
  await page.click('#clearBtn');
  await expect(page.locator('.card')).toHaveCount(80);
});

test('Surprise me opens recipe detail panel', async ({ page }) => {
  await page.click('#surpriseBtn');
  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#panelContent #panelTitle')).not.toBeEmpty();
});
```

- [ ] **Step 2: Run the tests**

```bash
cd tests/e2e && npx playwright test test_browse.spec.ts --reporter=line
```

Expected: 7 tests pass. If any fail, read the error — common issues are wrong selectors or stale count assumptions.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/test_browse.spec.ts
git commit -m "test: add browse tab Playwright tests"
```

---

## Task 4: Fridge Search Tests

**Files:**
- Create: `tests/e2e/test_fridge.spec.ts`

Recipe facts:
- 25 recipes contain "chicken" in ingredients
- Recipes with BOTH "chicken" and "pasta" in ingredients: "Creamy Chicken & Bacon Pasta", "Chicken Alfredo Pasta" (≥1 recipe has both)

- [ ] **Step 1: Write the tests**

Write `tests/e2e/test_fridge.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('fridge search with one ingredient filters cards', async ({ page }) => {
  await page.fill('#fridgeInput', 'chicken');
  const count = await page.locator('.card').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(80);
});

test('fridge AND logic requires all terms to be present', async ({ page }) => {
  // First get count for 'chicken' alone
  await page.fill('#fridgeInput', 'chicken');
  const chickenCount = await page.locator('.card').count();

  // Then add 'pasta' — must be fewer matches (AND logic)
  await page.fill('#fridgeInput', 'chicken, pasta');
  const bothCount = await page.locator('.card').count();

  expect(bothCount).toBeGreaterThan(0);
  expect(bothCount).toBeLessThan(chickenCount);
});

test('typing in fridge input clears text search', async ({ page }) => {
  await page.fill('#searchInput', 'pasta');
  await page.fill('#fridgeInput', 'chicken');
  await expect(page.locator('#searchInput')).toHaveValue('');
});

test('typing in text search clears fridge input', async ({ page }) => {
  await page.fill('#fridgeInput', 'chicken');
  await page.fill('#searchInput', 'pasta');
  await expect(page.locator('#fridgeInput')).toHaveValue('');
});
```

- [ ] **Step 2: Run the tests**

```bash
cd tests/e2e && npx playwright test test_fridge.spec.ts --reporter=line
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/test_fridge.spec.ts
git commit -m "test: add fridge search Playwright tests"
```

---

## Task 5: Recipe Panel Tests

**Files:**
- Create: `tests/e2e/test_recipe.spec.ts`

- [ ] **Step 1: Write the tests**

Write `tests/e2e/test_recipe.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('clicking a card opens the recipe panel with correct title', async ({ page }) => {
  const firstCard = page.locator('.card').first();
  const expectedTitle = await firstCard.locator('h3').textContent();

  // Click the card body (not the add-to-plan button)
  await firstCard.click({ position: { x: 10, y: 10 } });

  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#panelContent #panelTitle')).toHaveText(expectedTitle!.trim());
});

test('close button hides the recipe panel', async ({ page }) => {
  await page.locator('.card').first().click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#panel')).toHaveClass(/open/);

  await page.click('#panelClose');
  await expect(page.locator('#panel')).not.toHaveClass(/open/);
});

test('clicking the backdrop hides the recipe panel', async ({ page }) => {
  await page.locator('.card').first().click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#panel')).toHaveClass(/open/);

  await page.click('#backdrop');
  await expect(page.locator('#panel')).not.toHaveClass(/open/);
});
```

- [ ] **Step 2: Run the tests**

```bash
cd tests/e2e && npx playwright test test_recipe.spec.ts --reporter=line
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/test_recipe.spec.ts
git commit -m "test: add recipe detail panel Playwright tests"
```

---

## Task 6: Plan Tab Tests

**Files:**
- Create: `tests/e2e/test_plan.spec.ts`

Important: the mock's in-memory plan object persists across PATCH calls within a single test, so adding two recipes in sequence correctly accumulates in the mock.

Note on "auto-switch to Browse": clicking the × remove button does NOT auto-switch tabs in the current implementation — `removeFromPlan()` calls `renderPlanTab()` which re-renders in place. The implemented behaviour is that clicking an **empty day slot** in the plan tab switches to Browse. That is what is tested below.

- [ ] **Step 1: Write the tests**

Write `tests/e2e/test_plan.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

async function addRecipeToDay(page: import('@playwright/test').Page, recipeTitle: string, day: string) {
  const card = page.locator(`.card[data-title="${recipeTitle}"]`);
  await card.locator('.add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toHaveClass(/open/);
  await page.locator(`#dayPickerList .day-picker-row[data-day="${day}"]`).click();
  await expect(page.locator('#dayPicker')).not.toHaveClass(/open/);
}

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('Add to plan button opens day picker with 5 day rows', async ({ page }) => {
  await page.locator('.card').first().locator('.add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toHaveClass(/open/);
  await expect(page.locator('#dayPickerList .day-picker-row')).toHaveCount(5);
  await page.click('#dayPickerCancel');
});

test('selecting a day adds recipe to that day in the plan tab', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  await page.click('#planTab');
  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('card shows "✓ In plan" badge after adding to plan', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  const btn = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"] .add-plan-btn');
  await expect(btn).toHaveText('✓ In plan');
  await expect(btn).toHaveClass(/planned/);
});

test('plan tab badge count increments after adding recipe', async ({ page }) => {
  await expect(page.locator('#planBadge')).toBeHidden();

  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await expect(page.locator('#planBadge')).toBeVisible();
  await expect(page.locator('#planBadge')).toHaveText('1');

  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'tue');
  await expect(page.locator('#planBadge')).toHaveText('2');
});

test('adding to an occupied day replaces the recipe', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');

  await page.click('#planTab');
  await expect(page.locator('#planGrid')).not.toContainText('Garlic Butter Pasta with Parmesan');
  await expect(page.locator('#planGrid')).toContainText('One-Pan Tomato & Basil Pasta');
});

test('remove button clears the day and removes card badge', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  await page.click('#planTab');
  await page.locator('.day-col-remove').first().click();

  await expect(page.locator('#planGrid .day-col-recipe')).toHaveCount(0);

  // badge on card should be gone after switching back to browse
  await page.click('#browseTab');
  const btn = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"] .add-plan-btn');
  await expect(btn).toHaveText('+ Add to plan');
  await expect(btn).not.toHaveClass(/planned/);
});

test('clicking an empty day slot in the plan tab switches to Browse', async ({ page }) => {
  // Navigate to plan tab with an empty plan — all slots are empty
  await page.click('#planTab');
  await page.locator('.day-col-empty').first().click();

  await expect(page.locator('#browseView')).toBeVisible();
  await expect(page.locator('#planView')).toBeHidden();
  await expect(page.locator('#browseTab')).toHaveClass(/active/);
});
```

- [ ] **Step 2: Run the tests**

```bash
cd tests/e2e && npx playwright test test_plan.spec.ts --reporter=line
```

Expected: 7 tests pass. If the day picker tests fail, double-check `data-day` attribute is present on `.day-picker-row` elements (rendered in `openDayPicker()` in `index.html:1097`).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/test_plan.spec.ts
git commit -m "test: add plan tab Playwright tests"
```

---

## Task 7: Shopping List Tests

**Files:**
- Create: `tests/e2e/test_shopping.spec.ts`

Recipe facts used:
- "One-Pan Tomato & Basil Pasta" and "Creamy Chicken & Bacon Pasta" both contain "2 cloves garlic, minced" in their ingredients — the deduplication test exploits this shared ingredient.

- [ ] **Step 1: Write the tests**

Write `tests/e2e/test_shopping.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

async function addRecipeToDay(page: import('@playwright/test').Page, recipeTitle: string, day: string) {
  const card = page.locator(`.card[data-title="${recipeTitle}"]`);
  await card.locator('.add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toHaveClass(/open/);
  await page.locator(`#dayPickerList .day-picker-row[data-day="${day}"]`).click();
  await expect(page.locator('#dayPicker')).not.toHaveClass(/open/);
}

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('planning a recipe shows its ingredients in the shopping list', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  await page.click('#planTab');
  await expect(page.locator('#shoppingSection')).toBeVisible();
  const items = page.locator('#shoppingGrid .shopping-item label');
  await expect(items).not.toHaveCount(0);
});

test('shared ingredients are deduplicated in the shopping list', async ({ page }) => {
  // Both recipes contain "2 cloves garlic, minced"
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');
  await addRecipeToDay(page, 'Creamy Chicken & Bacon Pasta', 'tue');

  await page.click('#planTab');

  const items = page.locator('#shoppingGrid .shopping-item label');
  const texts = await items.allTextContents();
  const garlicItems = texts.filter(t => t.toLowerCase().includes('garlic'));
  expect(garlicItems).toHaveLength(1);
});

test('shopping list items are in alphabetical order', async ({ page }) => {
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');
  await addRecipeToDay(page, 'Creamy Chicken & Bacon Pasta', 'tue');

  await page.click('#planTab');

  const items = page.locator('#shoppingGrid .shopping-item label');
  const texts = await items.allTextContents();
  const sorted = [...texts].sort((a, b) => a.localeCompare(b));
  expect(texts).toEqual(sorted);
});

test('copy list button briefly shows "Copied!" text', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await page.click('#planTab');

  // Grant clipboard permission so writeText doesn't throw
  await page.context().grantPermissions(['clipboard-write']);

  await page.click('#copyListBtn');
  await expect(page.locator('#copyListBtn')).toHaveText('Copied!');

  // Text resets after 1800ms
  await expect(page.locator('#copyListBtn')).toHaveText('Copy list', { timeout: 3000 });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd tests/e2e && npx playwright test test_shopping.spec.ts --reporter=line
```

Expected: 4 tests pass. If the copy test fails on headless Chromium, verify that `grantPermissions(['clipboard-write'])` is called before `page.click('#copyListBtn')`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/test_shopping.spec.ts
git commit -m "test: add shopping list Playwright tests"
```

---

## Task 8: API Edge Case Tests

**Files:**
- Create: `api/tests/test_edge_cases.py`

The existing `api/tests/__init__.py` already exists. The `autouse` fixture from `test_main.py` is NOT shared — we define an identical one locally so each file is self-contained.

- [ ] **Step 1: Write the tests**

Write `api/tests/test_edge_cases.py`:

```python
import pytest
import threading
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_plan_file(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "PLAN_FILE", tmp_path / "plan.json")


def test_patch_name_too_long():
    name = "A" * 201
    response = client.patch("/api/plan/mon", json={"recipe": name})
    assert response.status_code == 422


def test_patch_all_valid_days_roundtrip():
    days = ["mon", "tue", "wed", "thu", "fri"]
    for i, day in enumerate(days):
        r = client.patch(f"/api/plan/{day}", json={"recipe": f"Recipe {i}"})
        assert r.status_code == 200

    data = client.get("/api/plan").json()
    for i, day in enumerate(days):
        assert data[day] == f"Recipe {i}"


def test_concurrent_writes_all_persist():
    days = ["mon", "tue", "wed", "thu", "fri"]
    barrier = threading.Barrier(len(days))
    errors: list[Exception] = []

    def patch_day(day: str, recipe: str) -> None:
        barrier.wait()  # all threads start simultaneously
        try:
            r = client.patch(f"/api/plan/{day}", json={"recipe": recipe})
            assert r.status_code == 200
        except Exception as exc:
            errors.append(exc)

    threads = [
        threading.Thread(target=patch_day, args=(day, f"Recipe for {day}"))
        for day in days
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"Thread errors: {errors}"

    data = client.get("/api/plan").json()
    for day in days:
        assert data[day] == f"Recipe for {day}"


def test_corrupt_plan_file_returns_empty_plan(tmp_path, monkeypatch):
    plan_file = tmp_path / "plan.json"
    plan_file.write_text("{bad json}")
    monkeypatch.setattr(main_module, "PLAN_FILE", plan_file)

    response = client.get("/api/plan")
    assert response.status_code == 200
    assert response.json() == {
        "mon": None, "tue": None, "wed": None, "thu": None, "fri": None
    }
```

- [ ] **Step 2: Run the tests**

```bash
# Run from the project root (the directory that contains api/, index.html, etc.)
python3 -m pytest api/tests/test_edge_cases.py -v
```

Expected output:
```
PASSED api/tests/test_edge_cases.py::test_patch_name_too_long
PASSED api/tests/test_edge_cases.py::test_patch_all_valid_days_roundtrip
PASSED api/tests/test_edge_cases.py::test_concurrent_writes_all_persist
PASSED api/tests/test_edge_cases.py::test_corrupt_plan_file_returns_empty_plan

4 passed
```

- [ ] **Step 3: Also run the original tests to confirm no regressions**

```bash
python3 -m pytest api/tests/ -v
```

Expected: 11 tests pass (7 from `test_main.py` + 4 from `test_edge_cases.py`).

- [ ] **Step 4: Commit**

```bash
git add api/tests/test_edge_cases.py
git commit -m "test: add API edge case tests (validation, concurrency, corrupt JSON)"
```

---

## Task 9: CI Integration

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

Two changes:
1. Expand the existing `Run api tests` step to cover `api/tests/` (not just `test_main.py`) so it picks up the new edge-case file automatically.
2. Add a new `Run E2E tests` step that installs Node, runs `npm ci`, installs Playwright's Chromium browser with system dependencies, and runs the test suite.

Both new steps must come **before** the Docker build steps so any failure blocks the image push.

- [ ] **Step 1: Update the workflow**

Open `.github/workflows/docker-publish.yml`. Make these two edits:

**Edit 1** — expand pytest glob (line ~61):

Replace:
```yaml
      - name: Run api tests
        run: pip install fastapi uvicorn httpx pytest && python -m pytest api/tests/test_main.py -v
```

With:
```yaml
      - name: Run api tests
        run: pip install fastapi uvicorn httpx pytest && python -m pytest api/tests/ -v
```

**Edit 2** — add Playwright step after "Run api tests" and before "Log in to GitHub Container Registry":

```yaml
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: tests/e2e/package-lock.json

      - name: Run E2E tests
        run: |
          cd tests/e2e
          npm ci
          npx playwright install --with-deps chromium
          npx playwright test
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/docker-publish.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Run the full E2E suite locally one more time to confirm it passes**

```bash
cd tests/e2e && npx playwright test --reporter=line
```

Expected: 25 tests pass (7 browse + 4 fridge + 3 recipe + 7 plan + 4 shopping).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: add Playwright E2E step; expand pytest to cover api/tests/"
```

---

## Final Verification

After all tasks are complete, run both suites together from the project root:

```bash
# API tests
python3 -m pytest api/tests/ -v

# E2E tests
cd tests/e2e && npx playwright test --reporter=line
```

Expected: 11 API tests pass, 25 E2E tests pass, 0 failures.
