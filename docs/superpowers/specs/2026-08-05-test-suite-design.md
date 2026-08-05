# Test Suite Design

**Date:** 2026-08-05  
**Feature:** Full test suite — Playwright E2E + expanded pytest API edge cases

---

## Goal

Cover all user-facing functionality (browse, fridge search, recipe panel, planning, shopping list) with Playwright end-to-end tests, and all API edge cases (validation, concurrency, corrupt storage) with expanded pytest unit tests.

---

## Architecture

Two test directories, each self-contained:

```
tests/e2e/
  playwright.config.ts        # base URL, Chromium, CI timeouts
  fixtures/
    mock-api.ts               # page.route() intercepts for /api/plan and /api/plan/:day
  test_browse.spec.ts         # text search, category/time filters, Surprise me
  test_fridge.spec.ts         # fridge AND logic, mutual exclusivity with text search
  test_recipe.spec.ts         # recipe detail panel open/close
  test_plan.spec.ts           # day picker, add, replace, remove, badge count, tab switch
  test_shopping.spec.ts       # ingredient deduplication, sort, copy button

api/tests/
  test_main.py                # existing 7 tests (unchanged)
  test_edge_cases.py          # new: validation, concurrent writes, corrupt JSON recovery
```

### Local app server

Playwright serves the frontend with `npx serve . --listen 3000` via `webServer` in `playwright.config.ts`. No Docker required. All `/api/` calls are intercepted by `mock-api.ts` using `page.route()`.

### CI integration

The existing GitHub Actions workflow gains two new steps:
1. `npm ci` in `tests/e2e/` + `npx playwright install --with-deps chromium` + `npx playwright test`
2. `pytest api/tests/test_edge_cases.py -v` (runs alongside the existing pytest step)

Both steps run before the Docker build jobs. A failure in either blocks the image push.

---

## Playwright Setup

**`playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'npx serve .. --listen 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

**`fixtures/mock-api.ts`**

Exports a `setupMockApi(page, initialPlan?)` helper that:
- Routes `GET /api/plan` (exact match) → returns `initialPlan` (default all-null)
- Routes `PATCH /api/plan/**` (glob) → extracts the day from `request.url()`, updates the in-memory plan object, returns it as JSON
- Uses a plain object keyed by day so multiple PATCHes within a test accumulate correctly

---

## Test Scenarios

### `test_browse.spec.ts`

| Test | What it checks |
|------|---------------|
| Page loads | Recipe cards visible, count > 0 |
| Text search by name | Searching "pasta" shows only pasta recipes |
| Text search by ingredient | Searching "garlic" shows recipes that contain garlic |
| Category filter | Selecting a category hides recipes from other categories |
| Time filter (Under 30 min) | Recipes with `time > 30` hidden |
| Clear filter | Removing filter text restores full card count |
| Surprise me | Clicking opens recipe detail panel |

### `test_fridge.spec.ts`

| Test | What it checks |
|------|---------------|
| Single ingredient | Entering one ingredient filters grid |
| AND logic | Two comma-separated ingredients — only recipes with both shown |
| Fridge clears text search | Typing in fridge input empties text search value |
| Text clears fridge | Typing in text search empties fridge input value |

### `test_recipe.spec.ts`

| Test | What it checks |
|------|---------------|
| Open panel | Clicking a card opens side panel with matching title |
| Close with button | Close button hides the panel |
| Close with backdrop | Clicking backdrop hides the panel |

### `test_plan.spec.ts`

| Test | What it checks |
|------|---------------|
| Day picker opens | "Add to plan" button shows picker with 5 day rows |
| Add to free day | Selecting a day closes picker; Plan tab shows recipe on that day |
| Card badge | After adding, card shows "✓ In plan" badge |
| Plan badge count | Tab bar badge increments after each addition |
| Replace recipe | Adding to an already-occupied day overwrites it |
| Remove recipe | × button clears the day; badge disappears from card |
| Auto-switch to Browse | Removing the last planned recipe switches tab back to Browse |

### `test_shopping.spec.ts`

| Test | What it checks |
|------|---------------|
| Ingredients appear | Planning one recipe shows its ingredients in the shopping list |
| Deduplication | Two recipes sharing an ingredient produce one list entry |
| Alphabetical sort | Shopping list entries are in A–Z order |
| Copy button | Clicking "Copy list" briefly shows "Copied!" label |

---

## API Edge Cases (`api/tests/test_edge_cases.py`)

| Test | What it checks |
|------|---------------|
| Name too long | PATCH with 201-char name → 422 Unprocessable Entity |
| All valid days | PATCH all 5 days; GET returns all 5 set correctly |
| Concurrent writes | 5 threads, one per day, fire simultaneously via `threading.Barrier`; GET returns all 5 set |
| Corrupt JSON recovery | Write `{bad json}` to plan file; GET returns all-null plan |

The concurrency test uses `threading.Thread` with a `Barrier` to maximise simultaneous writes.

---

## What Is Not Tested

- **15-second polling**: timing-dependent; tested implicitly by the plan state being server-driven.
- **Mobile/responsive layout**: out of scope for this sprint.
- **Non-Chromium browsers**: Chromium-only in CI; Firefox/Safari can be added later.
- **Docker Compose integration**: covered by CI build job, not by these tests.
