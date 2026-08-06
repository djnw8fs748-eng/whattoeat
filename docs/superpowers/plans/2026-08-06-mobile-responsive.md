# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app fully usable on mobile by merging the two search inputs into one (desktop + mobile) and replacing the inline filter bar with a bottom sheet drawer on screens narrower than 768px.

**Architecture:** Three sequential tasks, each independently testable. Task 1 merges state + logic + HTML (no mobile CSS). Task 2 adds the mobile Filters button and hides desktop-only controls via CSS. Task 3 adds the bottom sheet with duplicate controls, open/close logic, swipe-to-close, badge count, and E2E tests. All changes are in `index.html` (single-file app). New E2E test file for mobile scenarios.

**Tech Stack:** Vanilla JS, HTML, CSS. Playwright E2E tests (TypeScript). No backend changes.

---

## File Structure

| File | Change |
|------|--------|
| `index.html` | All HTML/CSS/JS changes — unified search, mobile layout, bottom sheet |
| `tests/e2e/test_mobile.spec.ts` | New file — 4 E2E tests for mobile behaviour |

---

### Task 1: Unified search input

Replaces `#searchInput` + `#fridgeInput` with a single input. Comma = AND ingredient match; no comma = title-or-ingredient match. Removes `activeFridge` state variable entirely.

**Files:**
- Modify: `index.html` (lines 701–702, 787–791, 841–846, 1061–1077, 1107–1119)
- Create: `tests/e2e/test_mobile.spec.ts`

- [ ] **Step 1: Write the two failing E2E tests**

Create `tests/e2e/test_mobile.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('Unified search input', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await page.waitForSelector('.card');
  });

  test('single-term search filters by title or ingredient', async ({ page }) => {
    const total = await page.locator('.card').count();
    await page.fill('#searchInput', 'pasta');
    const filtered = await page.locator('.card').count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    // Only pasta recipes visible
    const titles = await page.locator('.card h3').allTextContents();
    expect(titles.every(t => t.toLowerCase().includes('pasta'))).toBe(true);
  });

  test('comma search applies AND ingredient logic', async ({ page }) => {
    // "chicken, lemon" should return only recipes with both ingredients
    await page.fill('#searchInput', 'chicken, lemon');
    const count = await page.locator('.card').count();
    expect(count).toBeGreaterThan(0);
    // Result should be <= single-term search
    await page.fill('#searchInput', 'chicken');
    const chickenCount = await page.locator('.card').count();
    await page.fill('#searchInput', 'chicken, lemon');
    const bothCount = await page.locator('.card').count();
    expect(bothCount).toBeLessThanOrEqual(chickenCount);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/whattoeat && npx playwright test tests/e2e/test_mobile.spec.ts --reporter=line
```

Expected: 2 FAILs — `#fridgeInput` still exists and comma logic doesn't exist yet.

- [ ] **Step 3: Replace the two inputs with one in HTML**

Find lines 701–702:
```html
      <input type="text" class="search-input" id="searchInput" placeholder="Search by name or ingredient (e.g. 'chicken', 'pasta')...">
      <input type="text" class="search-input" id="fridgeInput" placeholder="Fridge search: e.g. chicken, rice, spinach…" style="border-color: var(--accent-soft);">
```

Replace with:
```html
      <input type="text" class="search-input" id="searchInput" placeholder="Search recipes or filter by ingredients… (use commas for AND, e.g. chicken, rice)">
```

- [ ] **Step 4: Remove `activeFridge` state and update `getFilteredRecipes()`**

Find lines 787–791:
```javascript
let activeSearch = "";
let activeCategory = "";
let activeMaxTime = 999;

let activeFridge = "";
```

Replace with:
```javascript
let activeSearch = "";
let activeCategory = "";
let activeMaxTime = 999;
```

Find lines 841–855 (the `getFilteredRecipes` filter body):
```javascript
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
```

Replace with:
```javascript
    let matchesSearch;
    if (activeSearch === "") {
      matchesSearch = true;
    } else if (activeSearch.includes(',')) {
      const terms = activeSearch.split(',').map(t => t.trim()).filter(Boolean);
      matchesSearch = terms.every(term =>
        r.ingredients.some(i => i.toLowerCase().includes(term))
      );
    } else {
      matchesSearch = r.title.toLowerCase().includes(activeSearch) ||
        r.ingredients.some(i => i.toLowerCase().includes(activeSearch));
    }
    const matchesCategory = activeCategory === "" || r.category === activeCategory;
    const matchesTime = r.time <= activeMaxTime;
    const matchesAllergens = activeAllergens.size === 0 ||
      [...activeAllergens].every(allergen =>
        !(ALLERGEN_KEYWORDS[allergen] || []).some(kw =>
          r.ingredients.some(i => i.toLowerCase().includes(kw))
        )
      );
    return matchesSearch && matchesCategory && matchesTime && matchesAllergens;
```

- [ ] **Step 5: Replace the two search event listeners and update clearBtn**

Find lines 1061–1077:
```javascript
document.getElementById('searchInput').addEventListener('input', (e) => {
  activeSearch = e.target.value.trim().toLowerCase();
  if (activeSearch) {
    activeFridge = "";
    document.getElementById('fridgeInput').value = "";
  }
  renderGrid();
});

document.getElementById('fridgeInput').addEventListener('input', (e) => {
  activeFridge = e.target.value.trim().toLowerCase();
  if (activeFridge) {
    activeSearch = "";
    document.getElementById('searchInput').value = "";
  }
  renderGrid();
});
```

Replace with:
```javascript
document.getElementById('searchInput').addEventListener('input', (e) => {
  activeSearch = e.target.value.trim().toLowerCase();
  renderGrid();
});
```

Find lines 1107–1119 (clearBtn handler):
```javascript
document.getElementById('clearBtn').addEventListener('click', () => {
  activeSearch = "";
  activeCategory = "";
  activeMaxTime = 999;
  activeFridge = "";
  activeAllergens.clear();
  document.getElementById('searchInput').value = "";
  document.getElementById('fridgeInput').value = "";
  catSelect.value = "";
  document.querySelectorAll('.chip[data-time]').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.allergen-chip').forEach(c => c.classList.remove('active'));
  renderGrid();
});
```

Replace with:
```javascript
document.getElementById('clearBtn').addEventListener('click', () => {
  activeSearch = "";
  activeCategory = "";
  activeMaxTime = 999;
  activeAllergens = new Set();
  document.getElementById('searchInput').value = "";
  catSelect.value = "";
  document.querySelectorAll('.chip[data-time]').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.allergen-chip').forEach(c => c.classList.remove('active'));
  renderGrid();
});
```

- [ ] **Step 6: Run the two new tests — both should PASS**

```bash
npx playwright test tests/e2e/test_mobile.spec.ts --reporter=line
```

Expected: 2 passed.

- [ ] **Step 7: Run the full test suite to check for regressions**

```bash
npx playwright test --reporter=line
```

Expected: all existing tests pass (29 tests + 2 new = 31 passed). The `test_browse.spec.ts` fridge test searches with commas — verify it still passes.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/e2e/test_mobile.spec.ts
git commit -m "feat(search): merge recipe and fridge search into single input with comma AND logic"
```

---

### Task 2: Mobile layout — Filters button and hiding desktop controls

Adds the `#filtersBtn` button in HTML, hides the non-search filter controls at `< 768px`, and adds the `updateFilterBadge()` helper wired into `renderGrid()`.

**Files:**
- Modify: `index.html` (HTML filter bar, CSS around line 450, renderGrid around line 864)
- Modify: `tests/e2e/test_mobile.spec.ts`

- [ ] **Step 1: Write the two failing E2E tests**

Add to `tests/e2e/test_mobile.spec.ts`, after the existing describe block:

```typescript
test.describe('Mobile layout', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('.card');
  });

  test('Filters button is visible on mobile, filter bar controls are hidden', async ({ page }) => {
    await expect(page.locator('#filtersBtn')).toBeVisible();
    await expect(page.locator('#catSelect')).toBeHidden();
    await expect(page.locator('#timeChips')).toBeHidden();
    await expect(page.locator('#allergenChips')).toBeHidden();
  });

  test('Filters button shows badge count when a filter is active', async ({ page }) => {
    // Open sheet and activate a time chip via the sheet
    // (sheet not built yet — just test via JS state for now)
    await page.evaluate(() => {
      window.activeCategory = 'Pasta';
      window.activeMaxTime = 30;
      window.renderGrid();
    });
    await expect(page.locator('#filtersBtn')).toHaveText('Filters • 2');
  });
});
```

- [ ] **Step 2: Run tests — confirm 2 FAILs**

```bash
npx playwright test tests/e2e/test_mobile.spec.ts --reporter=line
```

Expected: 2 FAILs — `#filtersBtn` not found.

- [ ] **Step 3: Add `#filtersBtn` to HTML**

Find line 724 (after allergenChips, before clearBtn):
```html
      <button class="clear-btn" id="clearBtn" type="button">Clear filters</button>
```

Insert `#filtersBtn` before it:
```html
      <button class="filters-btn" id="filtersBtn" type="button" aria-expanded="false" aria-controls="filterSheet">Filters</button>
      <button class="clear-btn" id="clearBtn" type="button">Clear filters</button>
```

- [ ] **Step 4: Add CSS for `#filtersBtn` and mobile hiding rules**

Find the existing mobile media query at line 450:
```css
  @media (max-width: 640px) {
    .hero { padding: 44px 0 32px; }
    .filters-inner { flex-direction: column; align-items: stretch; }
    .chip-row { overflow-x: auto; padding-bottom: 4px; }
  }
```

Replace with:
```css
  @media (max-width: 640px) {
    .hero { padding: 44px 0 32px; }
  }

  /* Mobile filter layout */
  .filters-btn {
    display: none;
    background: var(--surface);
    border: 1px solid var(--divider);
    color: var(--text);
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .filters-btn:hover { border-color: var(--accent); }

  @media (max-width: 767px) {
    .filters-inner { flex-wrap: nowrap; align-items: center; gap: 8px; }
    #searchInput { flex: 1 1 auto; min-width: 0; }
    #catSelect, #timeChips, #allergenChips, #clearBtn { display: none !important; }
    .filters-btn { display: block; }
    .chip-row { overflow-x: auto; padding-bottom: 4px; }
  }
```

- [ ] **Step 5: Add `updateFilterBadge()` and call it from `renderGrid()`**

Find `function renderGrid() {` (around line 859). Add `updateFilterBadge()` definition immediately before it:

```javascript
function updateFilterBadge() {
  const btn = document.getElementById('filtersBtn');
  if (!btn) return;
  const count = (activeCategory !== "" ? 1 : 0) +
                (activeMaxTime !== 999 ? 1 : 0) +
                activeAllergens.size;
  btn.textContent = count > 0 ? `Filters • ${count}` : 'Filters';
}
```

Then add `updateFilterBadge();` as the first line inside `renderGrid()`, right after `const grid = document.getElementById('grid');`:

```javascript
function renderGrid() {
  updateFilterBadge();
  const grid = document.getElementById('grid');
  // ... rest unchanged
```

- [ ] **Step 6: Expose state globals for test (add after state declarations, around line 811)**

The badge-count E2E test calls `window.renderGrid()` and `window.activeCategory` etc. Make them accessible by adding after `let plan = ...`:

```javascript
// expose for testing
window.renderGrid = renderGrid;
Object.defineProperty(window, 'activeCategory', {
  get() { return activeCategory; },
  set(v) { activeCategory = v; },
});
Object.defineProperty(window, 'activeMaxTime', {
  get() { return activeMaxTime; },
  set(v) { activeMaxTime = v; },
});
```

Actually, `renderGrid` is referenced before it's defined at that point. Instead, expose them right after DOMContentLoaded or after renderGrid is declared. Find `function renderGrid()` (line ~859) and add after the closing `}` of renderGrid:

```javascript
window.renderGrid = renderGrid;
Object.defineProperty(window, 'activeCategory', { get() { return activeCategory; }, set(v) { activeCategory = v; } });
Object.defineProperty(window, 'activeMaxTime', { get() { return activeMaxTime; }, set(v) { activeMaxTime = v; } });
```

- [ ] **Step 7: Run the 2 mobile layout tests — both should PASS**

```bash
npx playwright test tests/e2e/test_mobile.spec.ts --reporter=line
```

Expected: 4 passed (2 from Task 1 + 2 new).

- [ ] **Step 8: Run full suite — no regressions**

```bash
npx playwright test --reporter=line
```

Expected: 33 passed.

- [ ] **Step 9: Commit**

```bash
git add index.html tests/e2e/test_mobile.spec.ts
git commit -m "feat(mobile): add Filters button and hide filter bar controls at 768px"
```

---

### Task 3: Bottom sheet with duplicate controls, open/close, swipe, and sync

Adds the bottom sheet HTML + CSS, duplicate filter controls inside it, open/close wiring, swipe-to-dismiss, and syncs sheet controls to JS state.

**Files:**
- Modify: `index.html` (HTML body end, CSS, JS event listeners)
- Modify: `tests/e2e/test_mobile.spec.ts`

- [ ] **Step 1: Write the two failing E2E tests**

Add to `tests/e2e/test_mobile.spec.ts`, inside the `Mobile layout` describe block, after the existing two tests:

```typescript
  test('tapping Filters opens the bottom sheet', async ({ page }) => {
    await page.locator('#filtersBtn').click();
    await expect(page.locator('#filterSheet')).toBeVisible();
    await expect(page.locator('#filtersBtn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('tapping backdrop closes the sheet', async ({ page }) => {
    await page.locator('#filtersBtn').click();
    await expect(page.locator('#filterSheet')).toBeVisible();
    await page.locator('#filterSheetBackdrop').click();
    await expect(page.locator('#filterSheet')).not.toBeVisible();
    await expect(page.locator('#filtersBtn')).toHaveAttribute('aria-expanded', 'false');
  });
```

- [ ] **Step 2: Run tests — confirm 2 FAILs**

```bash
npx playwright test tests/e2e/test_mobile.spec.ts --reporter=line
```

Expected: 2 FAILs — `#filterSheet` not found.

- [ ] **Step 3: Add bottom sheet and backdrop HTML before `</body>`**

Find the closing `</body>` tag (near the bottom of index.html). Insert before it:

```html
  <!-- ============ BOTTOM SHEET (mobile filters) ============ -->
  <div id="filterSheetBackdrop"></div>
  <div id="filterSheet" role="dialog" aria-modal="true" aria-label="Filters">
    <div class="sheet-handle"></div>
    <div class="sheet-content">
      <div class="sheet-section">
        <label class="sheet-label" for="sheetCatSelect">Category</label>
        <select class="cat-select" id="sheetCatSelect">
          <option value="">All categories</option>
        </select>
      </div>
      <div class="sheet-section">
        <div class="sheet-label">Time</div>
        <div class="chip-row" id="sheetTimeChips">
          <button class="chip sheet-time-chip" data-time="20">Under 20 min</button>
          <button class="chip sheet-time-chip" data-time="30">Under 30 min</button>
          <button class="chip sheet-time-chip" data-time="999">Any time</button>
        </div>
      </div>
      <div class="sheet-section">
        <div class="sheet-label">Free from</div>
        <div class="chip-row" id="sheetAllergenChips" role="group" aria-label="Free from allergens">
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="gluten">Gluten</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="dairy">Dairy</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="eggs">Eggs</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="fish">Fish</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="shellfish">Shellfish</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="nuts">Nuts & Peanuts</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="soy">Soy</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="sesame">Sesame</button>
          <button class="chip allergen-chip sheet-allergen-chip" data-allergen="mustard">Mustard</button>
        </div>
      </div>
      <button class="clear-btn" id="sheetClearBtn" type="button">Clear all filters</button>
    </div>
  </div>
```

- [ ] **Step 4: Add CSS for the sheet and backdrop**

Find the `@media (max-width: 767px)` block added in Task 2. After it, add:

```css
  /* ============ BOTTOM SHEET ============ */
  #filterSheetBackdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 40;
    opacity: 0;
    transition: opacity 200ms ease;
  }
  #filterSheetBackdrop.visible {
    opacity: 1;
  }

  #filterSheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--surface);
    border-radius: 16px 16px 0 0;
    z-index: 50;
    transform: translateY(100%);
    transition: transform 250ms ease;
    max-height: 80vh;
    overflow-y: auto;
    display: none;
  }
  #filterSheet.open {
    transform: translateY(0);
  }

  .sheet-handle {
    width: 40px;
    height: 4px;
    background: var(--divider);
    border-radius: 2px;
    margin: 12px auto 0;
  }

  .sheet-content {
    padding: 16px 20px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .sheet-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sheet-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  #sheetTimeChips, #sheetAllergenChips {
    flex-wrap: wrap;
    gap: 8px;
  }
```

- [ ] **Step 5: Add open/close JS and wire sheet controls**

Find the section after the clearBtn event listener (around line 1119). Add a new section:

```javascript
/* ============================================================
   BOTTOM SHEET: open/close, swipe-to-dismiss, sheet controls
   ============================================================ */
const filterSheet = document.getElementById('filterSheet');
const filterSheetBackdrop = document.getElementById('filterSheetBackdrop');
const filtersBtn = document.getElementById('filtersBtn');

function openSheet() {
  filterSheet.style.display = 'block';
  filterSheetBackdrop.style.display = 'block';
  // Force reflow before adding classes so transition fires
  filterSheet.getBoundingClientRect();
  filterSheet.classList.add('open');
  filterSheetBackdrop.classList.add('visible');
  filtersBtn.setAttribute('aria-expanded', 'true');
  syncSheetControls();
}

function closeSheet() {
  filterSheet.classList.remove('open');
  filterSheetBackdrop.classList.remove('visible');
  filtersBtn.setAttribute('aria-expanded', 'false');
  filterSheet.addEventListener('transitionend', () => {
    filterSheet.style.display = 'none';
    filterSheetBackdrop.style.display = 'none';
  }, { once: true });
}

function syncSheetControls() {
  // Category
  const sheetCat = document.getElementById('sheetCatSelect');
  sheetCat.value = activeCategory;

  // Time chips
  document.querySelectorAll('.sheet-time-chip').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.time, 10) === activeMaxTime);
  });

  // Allergen chips
  document.querySelectorAll('.sheet-allergen-chip').forEach(c => {
    c.classList.toggle('active', activeAllergens.has(c.dataset.allergen));
  });
}

filtersBtn.addEventListener('click', () => {
  if (filterSheet.classList.contains('open')) {
    closeSheet();
  } else {
    openSheet();
  }
});

filterSheetBackdrop.addEventListener('click', closeSheet);

// Populate sheet category dropdown (mirrors catSelect)
const sheetCatSelect = document.getElementById('sheetCatSelect');
function populateSheetCategories() {
  const categories = [...new Set(recipes.map(r => r.category))].sort();
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    sheetCatSelect.appendChild(opt);
  });
}

sheetCatSelect.addEventListener('change', (e) => {
  activeCategory = e.target.value;
  catSelect.value = activeCategory;
  renderGrid();
});

document.querySelectorAll('.sheet-time-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-time]').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.sheet-time-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeMaxTime = parseInt(chip.dataset.time, 10);
    renderGrid();
  });
});

document.querySelectorAll('.sheet-allergen-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const allergen = chip.dataset.allergen;
    if (activeAllergens.has(allergen)) {
      activeAllergens.delete(allergen);
      chip.classList.remove('active');
      // sync desktop chip
      document.querySelector(`.allergen-chip[data-allergen="${allergen}"]:not(.sheet-allergen-chip)`)?.classList.remove('active');
    } else {
      activeAllergens.add(allergen);
      chip.classList.add('active');
      // sync desktop chip
      document.querySelector(`.allergen-chip[data-allergen="${allergen}"]:not(.sheet-allergen-chip)`)?.classList.add('active');
    }
    renderGrid();
  });
});

document.getElementById('sheetClearBtn').addEventListener('click', () => {
  activeSearch = "";
  activeCategory = "";
  activeMaxTime = 999;
  activeAllergens = new Set();
  document.getElementById('searchInput').value = "";
  catSelect.value = "";
  sheetCatSelect.value = "";
  document.querySelectorAll('.chip[data-time], .sheet-time-chip').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.allergen-chip').forEach(c => c.classList.remove('active'));
  renderGrid();
});

// Swipe down to close
let touchStartY = 0;
filterSheet.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });
filterSheet.addEventListener('touchend', (e) => {
  const delta = e.changedTouches[0].clientY - touchStartY;
  if (delta > 80) closeSheet();
}, { passive: true });
```

- [ ] **Step 6: Call `populateSheetCategories()` alongside `populateCategories()`**

Find the call to `populateCategories()` (search for `populateCategories()` in the file). Add `populateSheetCategories()` immediately after it:

```javascript
populateCategories();
populateSheetCategories();
```

- [ ] **Step 7: Run the 2 new sheet tests — both should PASS**

```bash
npx playwright test tests/e2e/test_mobile.spec.ts --reporter=line
```

Expected: 6 passed (all 4 from Tasks 1–2 + 2 new).

- [ ] **Step 8: Manual smoke test on mobile viewport**

Open the app in a browser with DevTools set to 390×844 (iPhone 14). Verify:
- Only search input and Filters button visible in the filter bar
- Tapping Filters opens the sheet from the bottom
- Selecting a category / time chip / allergen chip in the sheet updates the recipe count live
- Tapping the backdrop closes the sheet
- Swipe down on the sheet closes it
- Filters button shows badge count (e.g. `Filters • 2`) when filters are active
- On desktop (> 768px): full filter bar visible, Filters button hidden, sheet never appears

- [ ] **Step 9: Run full test suite — no regressions**

```bash
npx playwright test --reporter=line
```

Expected: 35 passed.

- [ ] **Step 10: Commit**

```bash
git add index.html tests/e2e/test_mobile.spec.ts
git commit -m "feat(mobile): add bottom sheet with duplicate filter controls, swipe-to-close, and badge count"
```

---

## Self-Review

**Spec coverage:**
- ✅ Unified search (comma = AND, no comma = title/ingredient) — Task 1
- ✅ Applied to desktop + mobile — Task 1 (HTML replaces both inputs; no mobile condition)
- ✅ Mobile ≤ 767px: Filters button visible, filter controls hidden — Task 2
- ✅ Active filter badge count on Filters button — Task 2 (`updateFilterBadge`)
- ✅ Bottom sheet slides up on Filters tap — Task 3
- ✅ Sheet stays open while selecting multiple filters — Task 3 (no auto-close on chip tap)
- ✅ Tap backdrop to close — Task 3
- ✅ Swipe down to close — Task 3
- ✅ Sheet contains category, time chips, allergen chips, clear all — Task 3
- ✅ Sheet controls sync to current state when opened — Task 3 (`syncSheetControls`)
- ✅ Desktop unchanged — all mobile CSS gated behind `@media (max-width: 767px)`
- ✅ 4 E2E tests (unified search ×2, mobile layout ×2, sheet ×2... 6 total) — Tasks 1–3
- ✅ `populateSheetCategories()` mirrors `populateCategories()` — Task 3

**Placeholder scan:** None. All code blocks are complete.

**Type consistency:**
- `activeAllergens` is `new Set()` throughout (Tasks 1 and 3 both reassign with `new Set()`)
- `updateFilterBadge()` defined in Task 2 and called from `renderGrid()` which already existed — correct
- `syncSheetControls()` defined in Task 3 and called from `openSheet()` — correct
- `populateSheetCategories()` defined in Task 3 and called alongside `populateCategories()` — correct
- `.sheet-allergen-chip` and `.allergen-chip` both present on sheet allergen buttons, so both desktop and sheet selectors work — correct
- `catSelect` (the desktop select, `const catSelect = document.getElementById('catSelect')`) is referenced in the sheet's catSelect listener to keep desktop in sync — correct
