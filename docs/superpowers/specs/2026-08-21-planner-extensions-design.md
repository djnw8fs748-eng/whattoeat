# Planner Extensions — Design Spec

**Date:** 2026-08-21
**Status:** Approved

---

## Overview

Three related improvements to the existing weekly planner ([2026-08-05-fridge-search-and-planner-design.md](2026-08-05-fridge-search-and-planner-design.md)):

1. **Weekend days** — the planner grid becomes Mon–Sun (was Mon–Fri).
2. **Multi-week support** — save the current plan as a named, reusable template; and keep an automatic read-only history of past calendar weeks, with a "copy forward" action.
3. **Servings scaler** — recipes gain a base `servings` count and structured ingredients, so serving size can be adjusted per planned day, scaling both the recipe detail view and the merged shopping list.

These three are grouped together because 2 and 3 both extend the same plan data model and shopping-list code path as 1.

---

## Data Model

### `recipes/*.json` (per-category files)

Recipe data now lives in `recipes/_index.json` (title/category/time/file lookup) plus one file per category (`recipes/pasta.json`, `recipes/curry.json`, etc.) — the source of truth. A CI step in `.github/workflows/docker-publish.yml` already flattens these into the root `recipes.json` consumed by `index.html` at build time; that generation step needs no changes here since it's a plain concatenation.

Every recipe (in every category file) gains:
- `servings: <int>` — base serving count.
- `ingredients` restructured from freeform strings to structured objects:

```json
// before
"ingredients": ["200g spaghetti or linguine", "Salt and black pepper"]

// after
"ingredients": [
  {"qty": 200, "unit": "g", "item": "spaghetti or linguine"},
  {"qty": null, "unit": null, "item": "Salt and black pepper"}
]
```

Lines a migration script can't confidently parse (no leading quantity, ranges like "2-3 cloves", "to taste") fall back to `qty: null, unit: null, item: <full original text>`. These render and behave exactly as today — unscaled, shown as-is. No recipe is dropped or blocked on an unparseable line.

Migration is a one-time script run over all 95 recipes across the `recipes/*.json` category files, followed by a manual spot-check of the output (not every line can be trusted to a regex).

### Plan storage (`api/`)

Replaces the single `plan.json` with a week-keyed store:

```json
{
  "weeks": {
    "2026-08-24": {
      "mon": {"recipe": "Garlic Butter Pasta with Parmesan", "servings": 4},
      "tue": null,
      "wed": null,
      "thu": null,
      "fri": null,
      "sat": null,
      "sun": null
    }
  },
  "templates": {
    "Usual Week": {
      "mon": {"recipe": "Garlic Butter Pasta with Parmesan", "servings": 4},
      "tue": null, "wed": null, "thu": null, "fri": null, "sat": null, "sun": null
    }
  }
}
```

- `VALID_DAYS` extends from `(mon..fri)` to `(mon..sun)`.
- Week keys are the ISO Monday-start date of that week, computed server-side — the frontend never constructs a key itself, it just asks for "the current week."
- Past weeks are never deleted automatically. The file grows slowly over time; acceptable at self-hosted, single-household scale.

---

## Backend API

Extends `api/main.py`, keeping the existing file-lock + atomic-write pattern:

| Endpoint | Behavior |
|---|---|
| `GET /api/plan` | Returns the current week's plan (7 days), auto-computed from today's date. |
| `PATCH /api/plan/{day}` | Body `{recipe, servings}`. Validates `day` against the 7-day set and `servings` as a positive int (min 1). |
| `GET /api/plan/history?limit=8` | List of past weeks (key + short summary) for browsing back. |
| `GET /api/plan/history/{week_key}` | Full plan for one past week. Read-only. |
| `POST /api/plan/history/{week_key}/copy` | Copies that week's plan into the current week (overwrites it). |
| `GET /api/templates` | List of saved template names. |
| `POST /api/templates` | Body `{name, plan}`. Saves/overwrites a template under that name. |
| `POST /api/templates/{name}/apply` | Copies the template into the current week (overwrites it). |
| `DELETE /api/templates/{name}` | Removes a template. |

No auth, consistent with the rest of the app (trusted network, no accounts, one shared plan per instance).

---

## Frontend (`index.html`)

**Planner grid** — 7 columns (Mon–Sun) instead of 5. Each cell shows recipe name + servings (e.g. "Chicken Stir-Fry · 4") with the existing × to remove.

**Day picker popover** — gains a servings stepper (default = the recipe's base `servings`) alongside the day list, so assigning a recipe sets day + servings in one action.

**Recipe detail panel** — gains a servings +/− stepper starting at base `servings`. Ingredient quantities re-render scaled live (`qty * (selected / base)`), rounded to 1 decimal, unit preserved. Ingredients with no `qty` display unscaled, unchanged.

**Plan tab additions:**
- "Save as template" button → prompts for a name → `POST /api/templates`.
- "Load template" dropdown → lists saved templates; applying one shows a confirm (destructive to current week) before calling `POST /api/templates/{name}/apply`.
- "History" view → prev/next navigation (or dropdown of recent week dates) showing past plans read-only, with a "Copy to current week" action (also confirmed before overwrite).

**Shopping list** — built from structured ingredients × each day's stored servings ratio (`servings_planned / servings_base`), merged across the week by matching `item` (normalized: lowercased, trimmed) + `unit`, quantities summed. Items with mismatched units for the same ingredient name (e.g. "cloves garlic" vs "tsp garlic powder") are NOT merged — they stay as separate lines rather than guessing a conversion. Items with no `qty` remain their own unscaled line. Still checkbox + "Copy list" as today.

---

## Error Handling

- **Unparseable ingredient lines** — fall back to unscaled text (see Data Model). Never blocks migration or rendering.
- **Shopping list merge** — only merges on exact normalized `item` + `unit` match; no unit conversion is attempted.
- **Template apply / history copy** — both overwrite the current week; frontend requires confirmation before calling either endpoint.
- **Servings stepper** — clamped to a minimum of 1; no upper bound (trusted self-hosted use).
- **Concurrent edits** — unchanged from the existing plan: file lock + atomic write; per-day PATCH only touches one day, so concurrent edits to different days don't clobber each other. Simultaneous edits to the same day still resolve last-write-wins, acceptable at household scale.

---

## Testing

- **Migration script** — unit tests against a sample of tricky ingredient strings (fractions, "to taste", ranges, multi-word items) to confirm parse/fallback behavior. Full output spot-checked manually across all 95 recipes.
- **Backend (`api/tests`)** — extends the existing pytest suite: 7-day validation, per-day servings validation, week-key computation (Monday-start rollover), template CRUD, history list/get/copy, atomic-write behavior preserved.
- **Frontend (`tests/e2e`)** — extends the existing Playwright suite: 7-day grid renders correctly, servings stepper scales both the recipe panel and shopping list correctly, save/load template round-trip, history navigation + copy-forward, shopping list merge produces correct summed lines and leaves mismatched-unit items separate.

---

## Out of Scope

- Per-user plans/accounts (still one shared plan per instance, no auth)
- Automatic deletion/pruning of old weeks in history
- Unit conversion during shopping list merge (e.g. g ↔ kg, tsp ↔ tbsp)
- Favourites / cook history / leftover-aware fridge search (Group B)
- Cook mode / print export (Group C)
- Recipe images
