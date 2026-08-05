# Allergens Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Free from" multi-select allergen filter to the browse UI so users can hide recipes containing specific allergens detected from ingredient strings.

**Architecture:** Nine allergen toggle chips ("Gluten", "Dairy", "Eggs", "Fish", "Shellfish", "Nuts", "Soy", "Sesame", "Mustard") are added to the existing filter bar in `index.html`. Client-side keyword matching against ingredient strings determines which recipes contain each allergen. Active allergens are stored in a `Set`; `getFilteredRecipes()` gains an AND-logic check that hides any recipe containing an ingredient matching any active allergen's keyword list. No backend changes required.

**Tech Stack:** Vanilla JS, HTML, CSS — same pattern as the existing time and category filters. New E2E tests in Playwright following the pattern in `tests/e2e/test_browse.spec.ts`.

---

## File Structure

| File | Change |
|------|--------|
| `index.html` | Add allergen chip-row HTML; add `ALLERGEN_KEYWORDS` const + `activeAllergens` state; update `getFilteredRecipes()`; add chip event listeners; update clear handler |
| `tests/e2e/test_allergens.spec.ts` | New file — 4 Playwright tests covering single allergen, multi-allergen AND logic, chip toggle-off, and clear-filters reset |

---

### Task 1: Allergen filter state and keyword map

**Files:**
- Modify: `index.html` (around line 771, after `let activeFridge`)

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/test_allergens.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('gluten chip hides recipes with pasta or bread ingredients', async ({ page }) => {
  const totalBefore = await page.locator('.card').count();
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  const totalAfter = await page.locator('.card').count();
  expect(totalAfter).toBeLessThan(totalBefore);
  await expect(page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]')).not.toBeVisible();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd tests/e2e && npx playwright test test_allergens.spec.ts --reporter=line
```

Expected: FAIL — `.allergen-chip[data-allergen="gluten"]` not found.

- [ ] **Step 3: Add state variable and keyword map to `index.html`**

Find the block of state variables (lines ~767–771):
```javascript
let activeSearch = "";
let activeCategory = "";
let activeMaxTime = 999;

let activeFridge = "";
```

Add after `let activeFridge = "";`:

```javascript
let activeAllergens = new Set();

const ALLERGEN_KEYWORDS = {
  gluten:    ['flour','bread','pasta','spaghetti','linguine','penne','fettuccine',
               'rigatoni','wheat','breadcrumb','noodle','tortilla','wrap','couscous'],
  dairy:     ['milk','cream','butter','cheese','parmesan','mozzarella','cheddar',
               'feta','ricotta','yogurt','yoghurt','crème fraîche','creme fraiche'],
  eggs:      ['egg'],
  fish:      ['salmon','tuna','cod','haddock','anchov','sardine','mackerel',
               'trout','bass','bream','tilapia','fish sauce','fish stock'],
  shellfish: ['prawn','shrimp','crab','lobster','scallop','mussel','clam','oyster'],
  nuts:      ['almond','cashew','walnut','pecan','pistachio','hazelnut','peanut','pine nut'],
  soy:       ['soy','tofu','edamame','tempeh','miso'],
  sesame:    ['sesame','tahini'],
  mustard:   ['mustard'],
};
```

- [ ] **Step 4: Run test — still fails (no HTML yet)**

```bash
cd tests/e2e && npx playwright test test_allergens.spec.ts --reporter=line
```

Expected: FAIL — element not found (state exists but no chips in DOM yet).

- [ ] **Step 5: Commit state and keyword map**

```bash
git add index.html tests/e2e/test_allergens.spec.ts
git commit -m "feat(allergens): add state variable and keyword map"
```

---

### Task 2: Allergen chips HTML and CSS

**Files:**
- Modify: `index.html` (filter bar section, around line 700–704; CSS section around line 176–199)

- [ ] **Step 1: Add allergen chip-row HTML**

Find the filter bar block. It ends with the time chips `<div class="chip-row" id="timeChips">...</div>` followed immediately by `<button class="clear-btn" id="clearBtn" ...>`. Insert the allergen row between them:

```html
      <div class="chip-row" id="allergenChips">
        <span class="chip-label">Free from:</span>
        <button class="chip allergen-chip" data-allergen="gluten">Gluten</button>
        <button class="chip allergen-chip" data-allergen="dairy">Dairy</button>
        <button class="chip allergen-chip" data-allergen="eggs">Eggs</button>
        <button class="chip allergen-chip" data-allergen="fish">Fish</button>
        <button class="chip allergen-chip" data-allergen="shellfish">Shellfish</button>
        <button class="chip allergen-chip" data-allergen="nuts">Nuts</button>
        <button class="chip allergen-chip" data-allergen="soy">Soy</button>
        <button class="chip allergen-chip" data-allergen="sesame">Sesame</button>
        <button class="chip allergen-chip" data-allergen="mustard">Mustard</button>
      </div>
```

- [ ] **Step 2: Add `.chip-label` CSS**

Find the CSS block for `.chip-row` (around line 176). After the existing `.chip.active { ... }` rule, add:

```css
  .chip-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
    align-self: center;
    padding-right: 2px;
  }
```

The `.chip` and `.chip.active` styles already cover the buttons — no changes needed there.

- [ ] **Step 3: Run test — should now find the element but filter logic is missing**

```bash
cd tests/e2e && npx playwright test test_allergens.spec.ts --reporter=line
```

Expected: FAIL — card count unchanged after click (no filter logic yet).

- [ ] **Step 4: Commit HTML and CSS**

```bash
git add index.html
git commit -m "feat(allergens): add allergen chip-row to filter bar"
```

---

### Task 3: Filter logic

**Files:**
- Modify: `index.html` (`getFilteredRecipes()` function, around lines 801–813)

- [ ] **Step 1: Add `matchesAllergens` to `getFilteredRecipes()`**

Find `getFilteredRecipes()`. It currently returns:
```javascript
return matchesSearch && matchesFridge && matchesCategory && matchesTime;
```

Change it to:
```javascript
function getFilteredRecipes() {
  return recipes.filter(r => {
    const matchesSearch = activeSearch === "" ||
      r.title.toLowerCase().includes(activeSearch) ||
      r.ingredients.some(i => i.toLowerCase().includes(activeSearch));
    const matchesFridge = activeFridge === "" ||
      activeFridge.split(',').map(t => t.trim()).filter(Boolean)
        .every(term => r.ingredients.some(i => i.toLowerCase().includes(term)));
    const matchesCategory = activeCategory === "" || r.category === activeCategory;
    const matchesTime = r.time <= activeMaxTime;
    const matchesAllergens = activeAllergens.size === 0 ||
      [...activeAllergens].every(allergen =>
        !(ALLERGEN_KEYWORDS[allergen] || []).some(kw =>
          r.ingredients.some(i => i.toLowerCase().includes(kw))
        )
      );
    return matchesSearch && matchesFridge && matchesCategory && matchesTime && matchesAllergens;
  });
}
```

- [ ] **Step 2: Run test — should PASS now**

```bash
cd tests/e2e && npx playwright test test_allergens.spec.ts --reporter=line
```

Expected: PASS (1 test).

- [ ] **Step 3: Commit filter logic**

```bash
git add index.html
git commit -m "feat(allergens): add allergen exclusion logic to getFilteredRecipes"
```

---

### Task 4: Chip event listeners and clear-filter reset

**Files:**
- Modify: `index.html` (event listener section after time-chip listeners; `clearBtn` handler)

- [ ] **Step 1: Write failing tests for the remaining 3 scenarios**

Add to `tests/e2e/test_allergens.spec.ts`:

```typescript
test('selecting two allergens applies AND logic (fewer results)', async ({ page }) => {
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  const glutenCount = await page.locator('.card').count();
  await page.locator('.allergen-chip[data-allergen="dairy"]').click();
  const bothCount = await page.locator('.card').count();
  expect(bothCount).toBeLessThanOrEqual(glutenCount);
});

test('clicking an active allergen chip deactivates it and restores recipes', async ({ page }) => {
  const totalBefore = await page.locator('.card').count();
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  const filtered = await page.locator('.card').count();
  expect(filtered).toBeLessThan(totalBefore);
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  await expect(page.locator('.card')).toHaveCount(totalBefore);
});

test('clear filters deactivates all allergen chips', async ({ page }) => {
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  await page.locator('.allergen-chip[data-allergen="dairy"]').click();
  await expect(page.locator('.allergen-chip.active')).toHaveCount(2);
  await page.click('#clearBtn');
  await expect(page.locator('.allergen-chip.active')).toHaveCount(0);
  const totalAfter = await page.locator('.card').count();
  expect(totalAfter).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd tests/e2e && npx playwright test test_allergens.spec.ts --reporter=line
```

Expected: 3 FAILs — chips don't respond to clicks yet.

- [ ] **Step 3: Add allergen chip event listeners**

Find the time-chip event listener block:
```javascript
document.querySelectorAll('.chip[data-time]').forEach(chip => {
  ...
});
```

Add immediately after it:

```javascript
document.querySelectorAll('.allergen-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const allergen = chip.dataset.allergen;
    if (activeAllergens.has(allergen)) {
      activeAllergens.delete(allergen);
      chip.classList.remove('active');
    } else {
      activeAllergens.add(allergen);
      chip.classList.add('active');
    }
    renderGrid();
  });
});
```

- [ ] **Step 4: Update `clearBtn` handler to reset allergens**

Find the `clearBtn` click handler. It currently contains:
```javascript
document.getElementById('clearBtn').addEventListener('click', () => {
  activeSearch = "";
  activeCategory = "";
  activeMaxTime = 999;
  activeFridge = "";
  document.getElementById('searchInput').value = "";
  document.getElementById('fridgeInput').value = "";
  catSelect.value = "";
  document.querySelectorAll('.chip[data-time]').forEach(c => c.classList.remove('active'));
  renderGrid();
});
```

Add two lines before `renderGrid()`:
```javascript
  activeAllergens = new Set();
  document.querySelectorAll('.allergen-chip').forEach(c => c.classList.remove('active'));
```

So the full handler becomes:
```javascript
document.getElementById('clearBtn').addEventListener('click', () => {
  activeSearch = "";
  activeCategory = "";
  activeMaxTime = 999;
  activeFridge = "";
  document.getElementById('searchInput').value = "";
  document.getElementById('fridgeInput').value = "";
  catSelect.value = "";
  document.querySelectorAll('.chip[data-time]').forEach(c => c.classList.remove('active'));
  activeAllergens = new Set();
  document.querySelectorAll('.allergen-chip').forEach(c => c.classList.remove('active'));
  renderGrid();
});
```

- [ ] **Step 5: Run all tests**

```bash
cd tests/e2e && npx playwright test test_allergens.spec.ts --reporter=line
```

Expected: 4 PASSes.

Then run the full suite to check for regressions:

```bash
cd tests/e2e && npx playwright test --reporter=line
```

Expected: 29 passed (25 existing + 4 new).

- [ ] **Step 6: Commit event listeners and clear handler**

```bash
git add index.html tests/e2e/test_allergens.spec.ts
git commit -m "feat(allergens): wire up chip toggles and clear-filter reset"
```

---

## Self-Review

**Spec coverage:**
- ✅ 9 allergen chips in UI
- ✅ Multi-select (AND logic) — recipes hidden if they contain ANY ingredient matching ANY active allergen
- ✅ Toggle off by clicking active chip
- ✅ Clear filters resets allergen state
- ✅ 4 E2E tests covering all behaviours
- ✅ No backend changes required

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `activeAllergens` is a `Set<string>` throughout; `ALLERGEN_KEYWORDS` keys match `data-allergen` attribute values throughout. `allergen-chip` class name consistent across HTML, CSS, JS, and tests.
