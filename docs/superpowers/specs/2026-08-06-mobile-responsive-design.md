# Mobile Responsiveness Design

## Goal

Make the app fully usable on mobile phones without degrading the desktop experience. Two changes apply everywhere (desktop + mobile): a unified search input. One change is mobile-only: a bottom sheet replaces the inline filter bar.

---

## 1. Unified search input

### What changes

The two existing text inputs — recipe search (`#searchInput`) and fridge search (`#fridgeInput`) — are replaced by a single `<input id="searchInput">` on both desktop and mobile.

**Placeholder text:** `Search recipes or filter by ingredients…`

### Filter logic

The two JS state variables `activeSearch` and `activeFridge` collapse into one: `activeSearch`.

`getFilteredRecipes()` gains a single search branch:

- **No comma in input:** match recipes where `title` contains the term OR any ingredient contains the term (existing general-search behaviour)
- **Comma present:** split on commas, trim each term, apply AND logic — every term must appear in at least one ingredient (existing fridge-search behaviour)

```
"pasta"         → title/ingredient contains "pasta"  (general)
"chicken, rice" → has ingredient with "chicken" AND ingredient with "rice"  (fridge AND)
```

### Desktop impact

- The fridge input row is removed from the filter bar
- The search input row remains; its placeholder changes
- All other filter bar elements (category, time chips, allergen chips, clear button) remain as-is
- No CSS breakpoint changes for desktop

---

## 2. Mobile layout (viewport width < 768px)

### Always-visible bar

On mobile, the filter bar collapses to two elements:

1. **Unified search input** — full width, same behaviour as above
2. **"Filters" button** — right-aligned next to or below the search input

The Filters button shows an active-filter badge when ≥ 1 filter is on:
- Format: `Filters • N` where N = count of active filters
- Active filter count = number of active allergen chips + (1 if category ≠ "") + (1 if time ≠ 999)
- When N = 0: button reads just `Filters`

Category dropdown, time chips, allergen chips, and clear button are **hidden** in the main page at this breakpoint and instead live inside the bottom sheet.

### Bottom sheet

A `<div id="filterSheet">` is appended to `<body>` and contains:

- Section: **Category** — the existing `<select>` element
- Section: **Time** — the existing time chip row
- Section: **Free from** — the existing allergen chip row
- **Clear all** button at the bottom

The sheet sits behind a `<div id="filterSheetBackdrop">` overlay covering the rest of the viewport.

**Open:** `filterSheetBackdrop` fades in (opacity 0 → 0.5), sheet slides up (`translateY(100%) → translateY(0)`)

**Close triggers:**
- Tap the backdrop
- Swipe the sheet downward (touch event: `touchstart` → `touchmove` → `touchend` threshold ≥ 80px)
- Tap the Filters button again (toggle)

**No "Apply" button.** Filter changes take effect immediately as the user interacts with chips/dropdown inside the sheet; the recipe grid updates live. The sheet stays open until explicitly dismissed.

### Animation

```css
#filterSheet {
  transition: transform 250ms ease;
  transform: translateY(100%);   /* closed */
}
#filterSheet.open {
  transform: translateY(0);      /* open */
}
#filterSheetBackdrop {
  transition: opacity 200ms ease;
  opacity: 0;
}
#filterSheetBackdrop.visible {
  opacity: 0.5;
}
```

---

## 3. Breakpoint

`768px` — applied via `@media (max-width: 767px)`.

At this breakpoint:
- The existing filter bar children (category, time chips, allergen chips, clear button) gain `display: none`
- The Filters button and sheet gain `display: block` / `display: flex`
- The search input row spans full width

No other layout changes at this breakpoint (recipe grid, header, plan tab remain as-is — they already adapt well).

---

## 4. State management

No new state is introduced. The sheet open/closed state is managed by toggling `.open` class on `#filterSheet` and `.visible` on `#filterSheetBackdrop`. The `activeSearch` variable replaces `activeSearch` + `activeFridge`. `getFilteredRecipes()` is updated to use the unified logic.

The Filters button badge count is computed in a new `updateFilterBadge()` helper called from `renderGrid()`.

---

## 5. DOM structure

```html
<!-- in <body>, appended once on DOMContentLoaded -->
<div id="filterSheetBackdrop"></div>
<div id="filterSheet" role="dialog" aria-modal="true" aria-label="Filters">
  <!-- category, time chips, allergen chips, clear btn -->
</div>
```

The existing chip/dropdown elements in the filter bar stay in the DOM on desktop; on mobile they are hidden via CSS. The sheet contains **copies** of the controls with distinct IDs (e.g. `#sheetCatSelect`, `#sheetTimeChips`, `#sheetAllergenChips`). Both sets of controls are wired to the same JS state variables and call `renderGrid()` on change. `renderGrid()` syncs both sets of controls to match current state (active chips, selected category, etc.) so they stay in sync.

---

## 6. Testing

Four new Playwright E2E tests in `tests/e2e/test_mobile.spec.ts`:

1. **Unified search — general:** typing a single term filters by title/ingredient
2. **Unified search — fridge AND:** typing "chicken, rice" returns only recipes with both ingredients
3. **Mobile sheet opens on Filters tap:** set viewport to 390×844, tap Filters, assert `#filterSheet` is visible
4. **Mobile sheet closes on backdrop tap:** open sheet, tap backdrop, assert sheet not visible

Existing tests (`test_browse.spec.ts`, `test_allergens.spec.ts`) run at default (desktop) viewport and are unaffected.

---

## 7. Out of scope

- No changes to the plan tab layout
- No changes to the recipe card grid column count (already uses `auto-fill` with `minmax`)
- No offline/PWA changes
- No changes to the API or backend
- Recipe card detail/modal (if added in future) is a separate feature
