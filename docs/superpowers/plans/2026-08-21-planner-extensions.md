# Planner Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the whattoeat weekly planner to a 7-day (Mon–Sun) grid with per-day servings, add a servings scaler to recipes and the shopping list, and add multi-week support (named templates + calendar week history).

**Architecture:** Migrate `recipes/*.json` ingredients from freeform strings to structured `{qty, unit, item}` objects and add a base `servings` field to every recipe. Restructure the FastAPI plan store (`api/main.py`) from a single flat `plan.json` into a week-keyed store (`{"weeks": {...}, "templates": {...}}`), extending `VALID_DAYS` to all 7 days and each day's value from a bare recipe title to `{recipe, servings}`. Add history and template endpoints on top of the same store. Update `index.html` (the only frontend file) to consume the new day shape, add servings steppers to the day picker and recipe panel, merge/sum the shopping list from structured ingredients, and add template/history UI to the Plan tab.

**Tech Stack:** Python 3.12, FastAPI, pytest (backend); vanilla JS/HTML/CSS, Playwright (frontend/e2e) — no new dependencies.

## Global Constraints

- Base servings default for existing recipes during migration: `2` (matches the current hardcoded "Serves about 2" panel text being replaced).
- Ingredient lines that can't be confidently parsed keep `qty: null, unit: null, item: <original text unchanged>` — never dropped, never blocks migration.
- Shopping list merges only on exact normalized `item` (lowercased, trimmed) + `unit` match — no unit conversion.
- No auth anywhere in this feature — consistent with the rest of the app (trusted network, one shared plan per instance).
- Servings values are always integers, clamped to a minimum of 1.
- Week keys are ISO Monday-start dates (`YYYY-MM-DD`), computed server-side — the frontend never constructs one itself.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `migrations/migrate_ingredients.py` | Create | One-time script: parses ingredient strings into structured objects, adds `servings` to every recipe in `recipes/*.json` |
| `migrations/test_migrate_ingredients.py` | Create | Unit tests for the ingredient-line parser |
| `api/main.py` | Modify | 7-day model, per-day servings, week-keyed store, history + template endpoints |
| `api/tests/test_main.py` | Modify | Update plan CRUD tests for 7 days + servings shape |
| `api/tests/test_edge_cases.py` | Modify | Fix invalid-day test (Saturday is now valid), update concurrency test for servings |
| `api/tests/test_history.py` | Create | Tests for history list/get/copy endpoints |
| `api/tests/test_templates.py` | Create | Tests for template CRUD/apply endpoints |
| `index.html` | Modify | 7-day grid, day/recipe-panel servings steppers, merged shopping list, template + history UI |
| `tests/e2e/fixtures/mock-api.ts` | Modify | Mock `/api/plan`, `/api/plan/history*`, `/api/templates*` for the new shapes |
| `tests/e2e/test_plan.spec.ts` | Modify | 7-day picker, default-servings assignment |
| `tests/e2e/test_shopping.spec.ts` | Modify | Merged/summed shopping list assertions |
| `tests/e2e/test_servings.spec.ts` | Create | Recipe panel + day picker servings stepper behavior |
| `tests/e2e/test_templates.spec.ts` | Create | Save/load template flow |
| `tests/e2e/test_history.spec.ts` | Create | Week history navigation + copy-forward flow |

---

## Task 1: Ingredient parser + recipe data migration

**Files:**
- Create: `migrations/migrate_ingredients.py`
- Create: `migrations/test_migrate_ingredients.py`

**Interfaces:**
- Produces: `parse_ingredient(line: str) -> dict` with keys `qty` (`float | None`), `unit` (`str | None`), `item` (`str`). Later tasks (frontend rendering) rely on exactly these three keys.
- Produces: migrated `recipes/*.json` files where every recipe object has `servings: int` and `ingredients: list[dict]` in this shape.

- [ ] **Step 1: Write the failing parser tests**

Create `migrations/test_migrate_ingredients.py`:

```python
from migrations.migrate_ingredients import parse_ingredient


def test_parses_no_space_unit():
    assert parse_ingredient("200g spaghetti or linguine") == {
        "qty": 200, "unit": "g", "item": "spaghetti or linguine"
    }


def test_parses_spaced_unit():
    assert parse_ingredient("3 tbsp butter") == {
        "qty": 3, "unit": "tbsp", "item": "butter"
    }


def test_parses_count_unit_with_comma_detail():
    assert parse_ingredient("4 cloves garlic, minced") == {
        "qty": 4, "unit": "cloves", "item": "garlic, minced"
    }


def test_parses_fraction_quantity():
    assert parse_ingredient("1/2 cup flour") == {
        "qty": 0.5, "unit": "cup", "item": "flour"
    }


def test_no_leading_quantity_falls_back():
    assert parse_ingredient("Salt and black pepper") == {
        "qty": None, "unit": None, "item": "Salt and black pepper"
    }


def test_range_quantity_falls_back():
    assert parse_ingredient("2-3 cloves garlic") == {
        "qty": None, "unit": None, "item": "2-3 cloves garlic"
    }


def test_to_taste_falls_back():
    assert parse_ingredient("Chilli flakes, to taste") == {
        "qty": None, "unit": None, "item": "Chilli flakes, to taste"
    }


def test_single_word_after_quantity_has_no_unit():
    assert parse_ingredient("2 eggs") == {
        "qty": 2, "unit": None, "item": "eggs"
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest migrations/test_migrate_ingredients.py -v` from the repo root.
Expected: `ModuleNotFoundError: No module named 'migrations.migrate_ingredients'`

- [ ] **Step 3: Create `migrations/__init__.py`**

```bash
mkdir -p migrations
touch migrations/__init__.py
```

- [ ] **Step 4: Write `parse_ingredient` in `migrations/migrate_ingredients.py`**

```python
import json
import re
from pathlib import Path

QTY_PATTERN = re.compile(
    r"^(?P<qty>\d+/\d+|\d+(?:\.\d+)?)\s*(?P<unit>[a-zA-Z]+)?\s+(?P<item>.+)$"
)

RECIPES_DIR = Path(__file__).resolve().parent.parent / "recipes"
DEFAULT_SERVINGS = 2


def _to_number(qty_str: str) -> float:
    if "/" in qty_str:
        numerator, denominator = qty_str.split("/")
        return int(numerator) / int(denominator)
    if "." in qty_str:
        return float(qty_str)
    return int(qty_str)


def parse_ingredient(line: str) -> dict:
    match = QTY_PATTERN.match(line.strip())
    if not match:
        return {"qty": None, "unit": None, "item": line.strip()}

    qty = _to_number(match.group("qty"))
    unit = match.group("unit")
    item = match.group("item").strip()

    # A single word after the quantity with nothing following it in the
    # original match means there is no unit — the "unit" group actually
    # captured the item itself (e.g. "2 eggs" -> qty=2, unit="eggs", item
    # missing). Detect this: if the raw text after stripping qty+unit+sep
    # left an empty item, treat what we captured as unit as the item instead.
    if unit and not item:
        return {"qty": qty, "unit": None, "item": unit}

    return {"qty": qty, "unit": unit, "item": item}
```

- [ ] **Step 5: Run tests, fix the "2 eggs" case**

Run: `python -m pytest migrations/test_migrate_ingredients.py -v`

The regex requires `\s+` before `item`, so `"2 eggs"` matches `qty="2"`, `unit="eggs"`, then fails to find a further `\s+(?P<item>.+)` — the whole match fails (no fallback item), so `QTY_PATTERN.match` returns `None` and the function falls back to the unparsed branch, not the `unit`-without-`item` branch above. Confirm this by running the tests: `test_single_word_after_quantity_has_no_unit` expects `{"qty": 2, "unit": None, "item": "eggs"}`, which the fallback branch does NOT produce (it would return `qty: None`). Fix by making the unit group optional and non-greedy so a lone trailing word is captured as `item`, not `unit`:

Replace the pattern with:

```python
QTY_PATTERN = re.compile(
    r"^(?P<qty>\d+/\d+|\d+(?:\.\d+)?)\s*(?:(?P<unit>[a-zA-Z]+)\s+)?(?P<item>.+)$"
)
```

This makes `unit` optional as a whole (unit + following space), so `"2 eggs"` first tries `unit="eggs"` + requires more text for `item` — fails since nothing follows — backtracks to the non-unit alternative, matching `qty="2"`, `unit=None`, `item="eggs"` directly. Remove the now-unnecessary `if unit and not item` branch from `parse_ingredient` (dead code once the regex handles it):

```python
def parse_ingredient(line: str) -> dict:
    match = QTY_PATTERN.match(line.strip())
    if not match:
        return {"qty": None, "unit": None, "item": line.strip()}

    qty = _to_number(match.group("qty"))
    unit = match.group("unit")
    item = match.group("item").strip()
    return {"qty": qty, "unit": unit, "item": item}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest migrations/test_migrate_ingredients.py -v`
Expected: `8 passed`

- [ ] **Step 7: Write the migration runner**

Add to `migrations/migrate_ingredients.py`:

```python
def migrate_file(path: Path) -> int:
    recipes = json.loads(path.read_text())
    for recipe in recipes:
        recipe.setdefault("servings", DEFAULT_SERVINGS)
        recipe["ingredients"] = [parse_ingredient(line) for line in recipe["ingredients"]]
    path.write_text(json.dumps(recipes, indent=2, ensure_ascii=False) + "\n")
    return len(recipes)


def main() -> None:
    total = 0
    for path in sorted(RECIPES_DIR.glob("*.json")):
        if path.name == "_index.json":
            continue
        count = migrate_file(path)
        total += count
        print(f"Migrated {count} recipes in {path.name}")
    print(f"Done: {total} recipes migrated")


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: Run the migration against the real recipe data**

Run: `python -m migrations.migrate_ingredients` from the repo root.
Expected output ends with `Done: 95 recipes migrated`.

- [ ] **Step 9: Spot-check the output for silently mis-parsed real quantities**

Run this check for any ingredient whose original line had a leading digit but ended up with `qty: null` (a parse regression), and separately list every distinct `unit` value produced to eyeball for nonsense units:

```bash
python3 -c "
import json, re
from pathlib import Path

digit_start = re.compile(r'^\d')
units = set()
regressions = []
for path in sorted(Path('recipes').glob('*.json')):
    if path.name == '_index.json':
        continue
    for recipe in json.loads(path.read_text()):
        for ing in recipe['ingredients']:
            units.add(ing['unit'])
            if ing['qty'] is None and digit_start.match(ing['item']):
                regressions.append((recipe['title'], ing['item']))

print('units:', sorted(u for u in units if u))
print('regressions:', regressions)
"
```

Expected: `regressions: []` (any hit here is a real parse bug — inspect the offending line and adjust `QTY_PATTERN` in Step 4/5 before proceeding). The `units` list should read as plausible cooking units (g, kg, ml, tbsp, tsp, cloves, tin, etc.) — anything obviously wrong (e.g. a stray adjective) is a lower-priority known limitation per this task's scope (see Global Constraints: units are descriptive text, not validated against a fixed vocabulary) and does not block the migration.

- [ ] **Step 10: Verify unit tests and existing e2e fixtures still make sense**

Run: `python -m pytest migrations/test_migrate_ingredients.py -v`
Expected: `8 passed` (the migration runner doesn't affect the parser tests).

- [ ] **Step 11: Commit**

```bash
git add migrations/ recipes/
git commit -m "feat: migrate recipe ingredients to structured qty/unit/item, add base servings"
```

---

## Task 2: Backend — 7-day plan with per-day servings, week-keyed store

**Files:**
- Modify: `api/main.py`
- Modify: `api/tests/test_main.py`
- Modify: `api/tests/test_edge_cases.py`

**Interfaces:**
- Produces: `VALID_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")`.
- Produces: `current_week_key(today: date | None = None) -> str` — ISO Monday-start date string.
- Produces: `GET /api/plan` → `{day: {"recipe": str, "servings": int} | None, ...}` for all 7 days.
- Produces: `PATCH /api/plan/{day}` body `{"recipe": str | None, "servings": int | None}` → same shape as GET.
- Consumed by Task 3 and Task 4: `_read_store()`, `_write_store()`, `EMPTY_DAY_PLAN`, `VALID_DAYS`.

- [ ] **Step 1: Write the failing tests for the new shape**

Replace the contents of `api/tests/test_main.py`:

```python
import pytest
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)

EMPTY_WEEK = {"mon": None, "tue": None, "wed": None, "thu": None, "fri": None, "sat": None, "sun": None}


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "STORE_FILE", tmp_path / "store.json")


def test_get_plan_returns_empty_week_when_no_file():
    response = client.get("/api/plan")
    assert response.status_code == 200
    assert response.json() == EMPTY_WEEK


def test_patch_day_sets_recipe_and_servings():
    response = client.patch("/api/plan/mon", json={"recipe": "Garlic Butter Pasta", "servings": 4})
    assert response.status_code == 200
    assert response.json()["mon"] == {"recipe": "Garlic Butter Pasta", "servings": 4}


def test_patch_day_clears_recipe():
    client.patch("/api/plan/mon", json={"recipe": "Garlic Butter Pasta", "servings": 4})
    response = client.patch("/api/plan/mon", json={"recipe": None})
    assert response.status_code == 200
    assert response.json()["mon"] is None


def test_patch_preserves_other_days():
    client.patch("/api/plan/mon", json={"recipe": "Pasta", "servings": 2})
    client.patch("/api/plan/wed", json={"recipe": "Curry", "servings": 3})
    response = client.get("/api/plan")
    data = response.json()
    assert data["mon"] == {"recipe": "Pasta", "servings": 2}
    assert data["wed"] == {"recipe": "Curry", "servings": 3}
    assert data["tue"] is None


def test_patch_weekend_day_is_valid():
    response = client.patch("/api/plan/sat", json={"recipe": "Pancakes", "servings": 2})
    assert response.status_code == 200
    assert response.json()["sat"] == {"recipe": "Pancakes", "servings": 2}


def test_patch_invalid_day_returns_400():
    response = client.patch("/api/plan/someday", json={"recipe": "Something", "servings": 2})
    assert response.status_code == 400


def test_patch_recipe_without_servings_returns_400():
    response = client.patch("/api/plan/mon", json={"recipe": "Pasta"})
    assert response.status_code == 400


def test_patch_servings_below_one_returns_400():
    response = client.patch("/api/plan/mon", json={"recipe": "Pasta", "servings": 0})
    assert response.status_code == 400


def test_patch_replaces_existing_recipe():
    client.patch("/api/plan/fri", json={"recipe": "Old Recipe", "servings": 2})
    response = client.patch("/api/plan/fri", json={"recipe": "New Recipe", "servings": 5})
    assert response.status_code == 200
    assert response.json()["fri"] == {"recipe": "New Recipe", "servings": 5}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest api/tests/test_main.py -v`
Expected: failures — `main_module` has no attribute `STORE_FILE`, and current behavior returns 5-day/string-value shape.

- [ ] **Step 3: Rewrite `api/main.py` for the 7-day, week-keyed, servings-aware model**

```python
import json
import os
import tempfile
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator

app = FastAPI()

STORE_FILE = Path("/data/store.json")
_lock = threading.Lock()

VALID_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
EMPTY_DAY_PLAN: dict = {d: None for d in VALID_DAYS}


def current_week_key(today: Optional[date] = None) -> str:
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    return monday.isoformat()


def _read_store() -> dict:
    if not STORE_FILE.exists():
        return {"weeks": {}, "templates": {}}
    try:
        return json.loads(STORE_FILE.read_text())
    except json.JSONDecodeError:
        return {"weeks": {}, "templates": {}}


def _write_store(store: dict) -> None:
    STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STORE_FILE.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(store, f)
        os.replace(tmp, STORE_FILE)
    except Exception:
        os.unlink(tmp)
        raise


def _get_week(store: dict, week_key: str) -> dict:
    return store["weeks"].get(week_key, dict(EMPTY_DAY_PLAN))


@app.get("/api/plan")
def get_plan():
    with _lock:
        store = _read_store()
        return _get_week(store, current_week_key())


class DayUpdate(BaseModel):
    recipe: Optional[str] = None
    servings: Optional[int] = None

    @field_validator('recipe')
    @classmethod
    def cap_length(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 200:
            raise ValueError('recipe name too long (max 200 chars)')
        return v


@app.patch("/api/plan/{day}")
def patch_day(day: str, body: DayUpdate):
    if day not in VALID_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid day '{day}'. Must be one of: {list(VALID_DAYS)}"
        )
    if body.recipe is not None and (body.servings is None or body.servings < 1):
        raise HTTPException(
            status_code=400,
            detail="servings must be a positive integer when setting a recipe"
        )

    with _lock:
        store = _read_store()
        week_key = current_week_key()
        week = _get_week(store, week_key)
        week[day] = None if body.recipe is None else {"recipe": body.recipe, "servings": body.servings}
        store["weeks"][week_key] = week
        _write_store(store)
        return week
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest api/tests/test_main.py -v`
Expected: `9 passed`

- [ ] **Step 5: Fix the now-invalid concurrency test in `test_edge_cases.py`**

Read `api/tests/test_edge_cases.py` and replace its `isolate_plan_file` fixture and all `PLAN_FILE`/plan-shape references. Replace the full file contents:

```python
import pytest
import threading
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "STORE_FILE", tmp_path / "store.json")


def test_patch_name_too_long():
    name = "A" * 201
    response = client.patch("/api/plan/mon", json={"recipe": name, "servings": 2})
    assert response.status_code == 422


def test_patch_all_valid_days_roundtrip():
    days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    for i, day in enumerate(days):
        r = client.patch(f"/api/plan/{day}", json={"recipe": f"Recipe {i}", "servings": i + 1})
        assert r.status_code == 200

    data = client.get("/api/plan").json()
    for i, day in enumerate(days):
        assert data[day] == {"recipe": f"Recipe {i}", "servings": i + 1}


def test_concurrent_writes_all_persist():
    days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    barrier = threading.Barrier(len(days))
    errors: list[Exception] = []

    def patch_day(day: str, recipe: str) -> None:
        barrier.wait()  # all threads start simultaneously
        try:
            r = client.patch(f"/api/plan/{day}", json={"recipe": recipe, "servings": 2})
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
        assert data[day] == {"recipe": f"Recipe for {day}", "servings": 2}
```

- [ ] **Step 6: Run the full backend test suite**

Run: `python -m pytest api/tests/ -v`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/main.py api/tests/test_main.py api/tests/test_edge_cases.py
git commit -m "feat: 7-day plan with per-day servings, week-keyed backend store"
```

---

## Task 3: Backend — plan history endpoints

**Files:**
- Modify: `api/main.py`
- Create: `api/tests/test_history.py`

**Interfaces:**
- Consumes: `_read_store`, `_write_store`, `_get_week`, `current_week_key`, `VALID_DAYS`, `_lock`, `app` from Task 2.
- Produces: `GET /api/plan/history?limit=8`, `GET /api/plan/history/{week_key}`, `POST /api/plan/history/{week_key}/copy`.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_history.py`:

```python
import pytest
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app, current_week_key

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "STORE_FILE", tmp_path / "store.json")


def _seed_week(week_key: str, mon_recipe: str = "Pasta") -> None:
    store = main_module._read_store()
    week = dict(main_module.EMPTY_DAY_PLAN)
    week["mon"] = {"recipe": mon_recipe, "servings": 2}
    store["weeks"][week_key] = week
    main_module._write_store(store)


def test_history_excludes_current_week():
    _seed_week(current_week_key())
    response = client.get("/api/plan/history")
    assert response.status_code == 200
    assert current_week_key() not in [w["week_key"] for w in response.json()]


def test_history_lists_past_weeks_descending():
    _seed_week("2026-08-03")
    _seed_week("2026-08-10")
    response = client.get("/api/plan/history")
    keys = [w["week_key"] for w in response.json()]
    assert keys == ["2026-08-10", "2026-08-03"]


def test_history_respects_limit():
    for i in range(1, 11):
        _seed_week(f"2026-0{ (i % 9) + 1 }-0{ (i % 9) + 1 }" if i < 9 else f"2026-09-0{i-8}")
    response = client.get("/api/plan/history?limit=3")
    assert len(response.json()) == 3


def test_get_specific_past_week():
    _seed_week("2026-08-03", mon_recipe="Curry")
    response = client.get("/api/plan/history/2026-08-03")
    assert response.status_code == 200
    assert response.json()["mon"] == {"recipe": "Curry", "servings": 2}


def test_get_unknown_week_returns_404():
    response = client.get("/api/plan/history/2099-01-01")
    assert response.status_code == 404


def test_copy_past_week_into_current():
    _seed_week("2026-08-03", mon_recipe="Curry")
    response = client.post("/api/plan/history/2026-08-03/copy")
    assert response.status_code == 200
    assert response.json()["mon"] == {"recipe": "Curry", "servings": 2}

    current = client.get("/api/plan").json()
    assert current["mon"] == {"recipe": "Curry", "servings": 2}


def test_copy_unknown_week_returns_404():
    response = client.post("/api/plan/history/2099-01-01/copy")
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest api/tests/test_history.py -v`
Expected: 404s for all routes (not yet defined).

- [ ] **Step 3: Add history endpoints to `api/main.py`**

Append to `api/main.py`:

```python
@app.get("/api/plan/history")
def list_history(limit: int = 8):
    with _lock:
        store = _read_store()
        current = current_week_key()
        past_keys = sorted(
            (k for k in store["weeks"] if k < current),
            reverse=True,
        )[:limit]
        return [
            {"week_key": k, "days_filled": sum(1 for v in store["weeks"][k].values() if v)}
            for k in past_keys
        ]


@app.get("/api/plan/history/{week_key}")
def get_history_week(week_key: str):
    with _lock:
        store = _read_store()
        if week_key not in store["weeks"]:
            raise HTTPException(status_code=404, detail=f"No plan found for week '{week_key}'")
        return store["weeks"][week_key]


@app.post("/api/plan/history/{week_key}/copy")
def copy_history_week(week_key: str):
    with _lock:
        store = _read_store()
        if week_key not in store["weeks"]:
            raise HTTPException(status_code=404, detail=f"No plan found for week '{week_key}'")
        store["weeks"][current_week_key()] = dict(store["weeks"][week_key])
        _write_store(store)
        return store["weeks"][current_week_key()]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest api/tests/test_history.py -v`
Expected: `7 passed`

- [ ] **Step 5: Run the full backend suite**

Run: `python -m pytest api/tests/ -v`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/main.py api/tests/test_history.py
git commit -m "feat: plan history endpoints (list, get, copy-forward)"
```

---

## Task 4: Backend — plan templates endpoints

**Files:**
- Modify: `api/main.py`
- Create: `api/tests/test_templates.py`

**Interfaces:**
- Consumes: `_read_store`, `_write_store`, `current_week_key`, `VALID_DAYS`, `_lock`, `app`, `DayUpdate` field-validation pattern from Task 2/3.
- Produces: `GET /api/templates`, `POST /api/templates`, `POST /api/templates/{name}/apply`, `DELETE /api/templates/{name}`.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_templates.py`:

```python
import pytest
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)

SAMPLE_PLAN = {
    "mon": {"recipe": "Pasta", "servings": 4},
    "tue": None, "wed": None, "thu": None, "fri": None, "sat": None, "sun": None,
}


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "STORE_FILE", tmp_path / "store.json")


def test_list_templates_empty_initially():
    response = client.get("/api/templates")
    assert response.status_code == 200
    assert response.json() == []


def test_save_and_list_template():
    client.post("/api/templates", json={"name": "Usual Week", "plan": SAMPLE_PLAN})
    response = client.get("/api/templates")
    assert response.status_code == 200
    assert response.json() == ["Usual Week"]


def test_save_template_overwrites_existing():
    client.post("/api/templates", json={"name": "Usual Week", "plan": SAMPLE_PLAN})
    updated_plan = dict(SAMPLE_PLAN, tue={"recipe": "Curry", "servings": 2})
    client.post("/api/templates", json={"name": "Usual Week", "plan": updated_plan})

    names = client.get("/api/templates").json()
    assert names == ["Usual Week"]


def test_apply_template_overwrites_current_week():
    client.post("/api/templates", json={"name": "Usual Week", "plan": SAMPLE_PLAN})
    response = client.post("/api/templates/Usual Week/apply")
    assert response.status_code == 200
    assert response.json()["mon"] == {"recipe": "Pasta", "servings": 4}

    current = client.get("/api/plan").json()
    assert current["mon"] == {"recipe": "Pasta", "servings": 4}


def test_apply_unknown_template_returns_404():
    response = client.post("/api/templates/Nope/apply")
    assert response.status_code == 404


def test_delete_template():
    client.post("/api/templates", json={"name": "Usual Week", "plan": SAMPLE_PLAN})
    response = client.delete("/api/templates/Usual Week")
    assert response.status_code == 200
    assert client.get("/api/templates").json() == []


def test_delete_unknown_template_returns_404():
    response = client.delete("/api/templates/Nope")
    assert response.status_code == 404


def test_save_template_rejects_missing_day_key():
    incomplete_plan = {k: v for k, v in SAMPLE_PLAN.items() if k != "sun"}
    response = client.post("/api/templates", json={"name": "Broken", "plan": incomplete_plan})
    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest api/tests/test_templates.py -v`
Expected: 404s for all routes (not yet defined).

- [ ] **Step 3: Add template endpoints to `api/main.py`**

Append to `api/main.py`:

```python
class DayPlanEntry(BaseModel):
    recipe: str
    servings: int

    @field_validator('servings')
    @classmethod
    def positive_servings(cls, v: int) -> int:
        if v < 1:
            raise ValueError('servings must be a positive integer')
        return v


class TemplateCreate(BaseModel):
    name: str
    plan: dict[str, Optional[DayPlanEntry]]

    @field_validator('plan')
    @classmethod
    def exact_day_keys(cls, v: dict) -> dict:
        if set(v.keys()) != set(VALID_DAYS):
            raise ValueError(f'plan must have exactly these day keys: {list(VALID_DAYS)}')
        return v


@app.get("/api/templates")
def list_templates():
    with _lock:
        store = _read_store()
        return sorted(store["templates"].keys())


@app.post("/api/templates")
def save_template(body: TemplateCreate):
    with _lock:
        store = _read_store()
        store["templates"][body.name] = {
            day: (entry.model_dump() if entry else None)
            for day, entry in body.plan.items()
        }
        _write_store(store)
        return {"name": body.name}


@app.post("/api/templates/{name}/apply")
def apply_template(name: str):
    with _lock:
        store = _read_store()
        if name not in store["templates"]:
            raise HTTPException(status_code=404, detail=f"No template named '{name}'")
        store["weeks"][current_week_key()] = dict(store["templates"][name])
        _write_store(store)
        return store["weeks"][current_week_key()]


@app.delete("/api/templates/{name}")
def delete_template(name: str):
    with _lock:
        store = _read_store()
        if name not in store["templates"]:
            raise HTTPException(status_code=404, detail=f"No template named '{name}'")
        del store["templates"][name]
        _write_store(store)
        return {"deleted": name}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest api/tests/test_templates.py -v`
Expected: `8 passed`

- [ ] **Step 5: Run the full backend suite**

Run: `python -m pytest api/tests/ -v`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/main.py api/tests/test_templates.py
git commit -m "feat: plan template save/list/apply/delete endpoints"
```

---

## Task 5: Frontend — 7-day planner grid with default-servings assignment

**Files:**
- Modify: `index.html`
- Modify: `tests/e2e/fixtures/mock-api.ts`
- Modify: `tests/e2e/test_plan.spec.ts`

**Interfaces:**
- Consumes: `GET /api/plan` / `PATCH /api/plan/{day}` contract from Task 2 (`{recipe, servings} | null` per day, 7 keys).
- Produces: `DAY_KEYS` (7 entries), `DAY_LABELS` (7 entries), `plan` state shape `{recipe: string, servings: number} | null` per day — later tasks (6–10) build on this shape.

- [ ] **Step 1: Update the mock API fixture for the new shape**

Replace `tests/e2e/fixtures/mock-api.ts`:

```typescript
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
```

- [ ] **Step 2: Update `test_plan.spec.ts` for the 7-day picker**

In `tests/e2e/test_plan.spec.ts`, change the day-count assertion:

```typescript
test('Add to plan button opens day picker with 7 day rows', async ({ page }) => {
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.locator('.card').first().locator('.add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toBeVisible();
  await expect(page.locator('#dayPickerList .day-picker-row')).toHaveCount(7);
  await page.locator('#dayPickerCancel').dispatchEvent('click');
});
```

Add a new test at the end of the file asserting a planned day shows the recipe's base servings by default:

```typescript
test('planned day shows the recipe base servings by default', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  await page.click('#planTab');
  await expect(page.locator('.day-col-recipe')).toContainText('2');
});
```

(This assumes `Garlic Butter Pasta with Parmesan` has `servings: 2` after the Task 1 migration — confirm with `python3 -c "import json; r=[x for x in json.load(open('recipes/pasta.json')) if x['title']=='Garlic Butter Pasta with Parmesan'][0]; print(r['servings'])"` before writing this assertion; adjust the expected number if different.)

- [ ] **Step 3: Run the new/updated e2e tests to verify they fail**

Run: `cd tests/e2e && npx playwright test test_plan.spec.ts`
Expected: failures — picker still renders 5 rows, `.day-col-recipe` doesn't contain servings text.

- [ ] **Step 4: Update `index.html` state and constants**

In the `<script>` section, replace:

```javascript
let plan = { mon: null, tue: null, wed: null, thu: null, fri: null };
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };
```

with:

```javascript
let plan = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
};
```

- [ ] **Step 5: Update the CSS grid to 7 columns**

Replace:

```css
.plan-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 32px;
}
```

with:

```css
.plan-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  margin-bottom: 32px;
}
```

(Leave the existing `@media (max-width: 640px) { .plan-grid { grid-template-columns: 1fr 1fr; } }` unchanged — it already collapses to 2 columns on mobile, which still works fine for 7 items.)

- [ ] **Step 6: Update `renderGrid()`'s "in plan" checks**

Replace both occurrences of:

```javascript
DAY_KEYS.some(d => plan[d] === r.title)
```

with:

```javascript
DAY_KEYS.some(d => plan[d]?.recipe === r.title)
```

(One in the `add-plan-btn` class expression, one in its label text — both inside the `grid.innerHTML = filtered.map(...)` template in `renderGrid()`.)

- [ ] **Step 7: Update `renderPlanTab()` to show recipe + servings**

Replace:

```javascript
grid.innerHTML = DAY_KEYS.map(d => {
    const recipe = plan[d];
    return `
      <div class="day-col">
        <div class="day-col-label">${DAY_LABELS[d].slice(0, 3)}</div>
        ${recipe
          ? `<div class="day-col-recipe">
               <span>${escapeHtml(recipe)}</span>
               <button class="day-col-remove" data-day="${d}" aria-label="Remove ${escapeHtml(recipe)} from ${DAY_LABELS[d]}">×</button>
             </div>`
          : `<div class="day-col-empty" data-day="${d}">+ Add recipe</div>`
        }
      </div>`;
  }).join('');
```

with:

```javascript
grid.innerHTML = DAY_KEYS.map(d => {
    const entry = plan[d];
    return `
      <div class="day-col">
        <div class="day-col-label">${DAY_LABELS[d].slice(0, 3)}</div>
        ${entry
          ? `<div class="day-col-recipe">
               <span>${escapeHtml(entry.recipe)} · ${entry.servings}</span>
               <button class="day-col-remove" data-day="${d}" aria-label="Remove ${escapeHtml(entry.recipe)} from ${DAY_LABELS[d]}">×</button>
             </div>`
          : `<div class="day-col-empty" data-day="${d}">+ Add recipe</div>`
        }
      </div>`;
  }).join('');
```

- [ ] **Step 8: Update the day picker to show recipe+servings and send default servings**

Replace the `openDayPicker` row-rendering line:

```javascript
const current = plan[d];
    const taken = current !== null;
    return `
      <div class="day-picker-row ${taken ? 'taken' : ''}" data-day="${d}">
        <span class="day-name">${DAY_LABELS[d]}</span>
        <span class="day-status">${taken ? escapeHtml(current) : 'Free'}</span>
      </div>`;
```

with:

```javascript
const current = plan[d];
    const taken = current !== null;
    return `
      <div class="day-picker-row ${taken ? 'taken' : ''}" data-day="${d}">
        <span class="day-name">${DAY_LABELS[d]}</span>
        <span class="day-status">${taken ? escapeHtml(current.recipe) : 'Free'}</span>
      </div>`;
```

Replace `selectDay`'s PATCH body — it currently sends only `recipe`. Look up the recipe's base `servings` and send it:

```javascript
function selectDay(day) {
  if (!dayPickerRecipe) return;
  const recipe = recipes.find(r => r.title === dayPickerRecipe);
  const servings = recipe ? recipe.servings : 1;
  fetch(`/api/plan/${day}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe: dayPickerRecipe, servings })
  })
```

(Keep the rest of `selectDay` — the `.then`/`.catch` chain — unchanged.)

- [ ] **Step 9: Update `updatePlanBadge()` — no change needed**

`DAY_KEYS.filter(d => plan[d]).length` already works correctly with object-or-null values (truthy check). Confirm by reading the function — no edit required here.

- [ ] **Step 10: Run the e2e tests to verify they pass**

Run: `cd tests/e2e && npx playwright test test_plan.spec.ts`
Expected: all tests pass, including the new "7 day rows" and "default servings" tests.

- [ ] **Step 11: Run the full e2e suite to check for regressions in other specs**

Run: `cd tests/e2e && npx playwright test`
Expected: all tests pass (other specs like `test_shopping.spec.ts` will be updated in Task 8; if they fail here due to the shape change, that's expected — Task 8 fixes them. Confirm failures are isolated to shopping-list-related assertions, not `test_allergens.spec.ts`, `test_browse.spec.ts`, `test_fridge.spec.ts`, `test_mobile.spec.ts`, `test_recipe.spec.ts`, which don't touch plan shape and should still pass).

- [ ] **Step 12: Commit**

```bash
git add index.html tests/e2e/fixtures/mock-api.ts tests/e2e/test_plan.spec.ts
git commit -m "feat: 7-day planner grid with default-servings assignment"
```

---

## Task 6: Frontend — day picker servings stepper

**Files:**
- Modify: `index.html`
- Modify: `tests/e2e/test_servings.spec.ts` (create in this task)

**Interfaces:**
- Consumes: `plan` shape, `DAY_KEYS`, `recipes` array, `openDayPicker`/`selectDay` from Task 5.
- Produces: `dayPickerServings` module-level state, read by `selectDay`.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/test_servings.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('day picker servings stepper defaults to recipe base servings and can be adjusted', async ({ page }) => {
  const card = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]');
  await card.locator('.add-plan-btn').click();

  await expect(page.locator('#dayPickerServingsValue')).toHaveText('2');

  await page.locator('#dayPickerServingsPlus').click();
  await expect(page.locator('#dayPickerServingsValue')).toHaveText('3');

  await page.locator('#dayPickerList .day-picker-row[data-day="mon"]').dispatchEvent('click');

  await page.click('#planTab');
  await expect(page.locator('.day-col-recipe')).toContainText('3');
});

test('day picker servings stepper cannot go below 1', async ({ page }) => {
  const card = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]');
  await card.locator('.add-plan-btn').click();

  for (let i = 0; i < 5; i++) {
    await page.locator('#dayPickerServingsMinus').click();
  }
  await expect(page.locator('#dayPickerServingsValue')).toHaveText('1');
});
```

(This test assumes `Garlic Butter Pasta with Parmesan` has `servings: 2` — same assumption verified in Task 5 Step 2.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/e2e && npx playwright test test_servings.spec.ts`
Expected: fails — `#dayPickerServingsValue` doesn't exist.

- [ ] **Step 3: Add the stepper markup to the day picker**

Find the day picker HTML block (containing `id="dayPickerList"` and `id="dayPickerCancel"`) and add a stepper row above the cancel button:

```html
<div class="day-picker-servings">
  <span>Servings:</span>
  <button type="button" id="dayPickerServingsMinus" aria-label="Decrease servings">−</button>
  <span id="dayPickerServingsValue">1</span>
  <button type="button" id="dayPickerServingsPlus" aria-label="Increase servings">+</button>
</div>
```

Add matching CSS near the existing `.day-picker` rules:

```css
.day-picker-servings {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 4px;
  font-size: 13px;
  color: var(--text-muted);
}
.day-picker-servings button {
  width: 24px;
  height: 24px;
  border: 1px solid var(--divider);
  border-radius: 4px;
  background: var(--surface);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.day-picker-servings #dayPickerServingsValue {
  min-width: 20px;
  text-align: center;
  font-weight: 600;
  color: var(--text);
}
```

- [ ] **Step 4: Add stepper state and wiring in JS**

Add near the existing `let dayPickerRecipe = null;`:

```javascript
let dayPickerServings = 1;

function setDayPickerServings(value) {
  dayPickerServings = Math.max(1, value);
  document.getElementById('dayPickerServingsValue').textContent = dayPickerServings;
}

document.getElementById('dayPickerServingsMinus').addEventListener('click', () => {
  setDayPickerServings(dayPickerServings - 1);
});
document.getElementById('dayPickerServingsPlus').addEventListener('click', () => {
  setDayPickerServings(dayPickerServings + 1);
});
```

- [ ] **Step 5: Initialize the stepper when the picker opens**

In `openDayPicker(recipeTitle, anchorEl)`, after `dayPickerRecipe = recipeTitle;`, add:

```javascript
const recipe = recipes.find(r => r.title === recipeTitle);
setDayPickerServings(recipe ? recipe.servings : 1);
```

- [ ] **Step 6: Use the stepper value in `selectDay`**

Replace the servings lookup added in Task 5 Step 8:

```javascript
function selectDay(day) {
  if (!dayPickerRecipe) return;
  fetch(`/api/plan/${day}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe: dayPickerRecipe, servings: dayPickerServings })
  })
```

(Remove the `const recipe = ...; const servings = ...;` lines added in Task 5 — `dayPickerServings` now covers it.)

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `cd tests/e2e && npx playwright test test_servings.spec.ts`
Expected: `2 passed`

- [ ] **Step 8: Run test_plan.spec.ts to check for regressions**

Run: `cd tests/e2e && npx playwright test test_plan.spec.ts`
Expected: all pass (the "default servings" test from Task 5 still passes since the stepper initializes to the same base value).

- [ ] **Step 9: Commit**

```bash
git add index.html tests/e2e/test_servings.spec.ts
git commit -m "feat: day picker servings stepper"
```

---

## Task 7: Frontend — recipe panel servings stepper + scaled ingredients

**Files:**
- Modify: `index.html`
- Modify: `tests/e2e/test_servings.spec.ts`
- Modify: `tests/e2e/test_recipe.spec.ts` (only if it asserts on the old hardcoded "Serves about 2" text — check first)

**Interfaces:**
- Consumes: migrated `recipe.servings` and `recipe.ingredients` (structured) from Task 1.
- Produces: `formatQty(n: number) -> string`, `scaleIngredient(entry, ratio) -> string` — reused by Task 8's shopping list.

- [ ] **Step 1: Check whether an existing test depends on the hardcoded serving text**

Run: `grep -n "Serves about" tests/e2e/*.spec.ts index.html`

If any e2e test asserts on `"Serves about 2"`, note the file/line — it will be updated in Step 6 below to assert on the new stepper instead.

- [ ] **Step 2: Write the failing e2e test**

Add to `tests/e2e/test_servings.spec.ts`:

```typescript
test('recipe panel servings stepper scales ingredient quantities', async ({ page }) => {
  await page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]').click();

  await expect(page.locator('#panelServingsValue')).toHaveText('2');
  const spaghettiLine = page.locator('.ingredient-list li', { hasText: 'spaghetti or linguine' });
  await expect(spaghettiLine).toContainText('200g');

  await page.locator('#panelServingsPlus').click();
  await expect(page.locator('#panelServingsValue')).toHaveText('3');
  await expect(spaghettiLine).toContainText('300g');
});

test('recipe panel ingredients with no quantity render unscaled', async ({ page }) => {
  await page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]').click();
  const saltLine = page.locator('.ingredient-list li', { hasText: 'Salt and black pepper' });
  await expect(saltLine).toBeVisible();

  await page.locator('#panelServingsPlus').click();
  await expect(saltLine).toContainText('Salt and black pepper');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd tests/e2e && npx playwright test test_servings.spec.ts`
Expected: fails — `#panelServingsValue` doesn't exist, ingredient lines don't show `qty`+`unit` since `openRecipe` still assumes string ingredients.

- [ ] **Step 4: Add `formatQty` and `scaleIngredient` helpers**

Add near the other pure helper functions (e.g. next to `escapeHtml`):

```javascript
function formatQty(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function scaleIngredient(entry, ratio) {
  if (entry.qty === null) return entry.item;
  const scaledQty = formatQty(entry.qty * ratio);
  return entry.unit ? `${scaledQty}${entry.unit} ${entry.item}` : `${scaledQty} ${entry.item}`;
}
```

- [ ] **Step 5: Rewrite `openRecipe` to use structured ingredients and a servings stepper**

Replace the whole `openRecipe` function body's template (the panel gains stepper markup, ingredient rendering is factored into a re-renderable piece):

```javascript
let panelRecipe = null;
let panelServings = 1;

function renderPanelIngredients() {
  const ratio = panelServings / panelRecipe.servings;
  document.getElementById('panelIngredientList').innerHTML = panelRecipe.ingredients.map((ing, i) => `
    <li>
      <input type="checkbox" id="ing-${i}">
      <label for="ing-${i}">${escapeHtml(scaleIngredient(ing, ratio))}</label>
    </li>
  `).join('');
}

function setPanelServings(value) {
  panelServings = Math.max(1, value);
  document.getElementById('panelServingsValue').textContent = panelServings;
  renderPanelIngredients();
}

function openRecipe(title) {
  const r = recipes.find(x => x.title === title);
  if (!r) return;
  panelRecipe = r;

  panelContent.innerHTML = `
    <span class="pill cat-${categoryColors[r.category] ?? 0}">${escapeHtml(r.category)}</span>
    <h2 id="panelTitle">${escapeHtml(r.title)}</h2>
    <div class="meta">
      <span>${clockIcon} ${r.time} minutes</span>
      <span class="panel-servings">
        Serves
        <button type="button" id="panelServingsMinus" aria-label="Decrease servings">−</button>
        <span id="panelServingsValue">${r.servings}</span>
        <button type="button" id="panelServingsPlus" aria-label="Increase servings">+</button>
      </span>
    </div>
    <p class="teaser">${r.teaser}</p>
    <h4>Ingredients</h4>
    <ul class="ingredient-list" id="panelIngredientList"></ul>
    <h4>Method</h4>
    <ol class="steps-list">
      ${r.steps.map(step => `<li>${step}</li>`).join('')}
    </ol>
  `;

  document.getElementById('panelServingsMinus').addEventListener('click', () => setPanelServings(panelServings - 1));
  document.getElementById('panelServingsPlus').addEventListener('click', () => setPanelServings(panelServings + 1));
  setPanelServings(r.servings);

  panel.classList.add('open');
  backdrop.classList.add('open');
  document.getElementById('panelClose').focus();
}
```

- [ ] **Step 6: Add minimal CSS for `.panel-servings`**

Add near the existing `.meta` CSS rules:

```css
.panel-servings {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.panel-servings button {
  width: 20px;
  height: 20px;
  border: 1px solid var(--divider);
  border-radius: 4px;
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}
```

- [ ] **Step 7: Fix any test that asserted the old hardcoded text**

If Step 1 found a match (e.g. in `tests/e2e/test_recipe.spec.ts`), replace that assertion with one against `#panelServingsValue`, matching the pattern used in the new tests above.

- [ ] **Step 8: Run the e2e tests to verify they pass**

Run: `cd tests/e2e && npx playwright test test_servings.spec.ts test_recipe.spec.ts`
Expected: all pass.

- [ ] **Step 9: Run the full e2e suite**

Run: `cd tests/e2e && npx playwright test`
Expected: all pass except `test_shopping.spec.ts`, which still expects unstructured ingredient strings and is fixed in Task 8.

- [ ] **Step 10: Commit**

```bash
git add index.html tests/e2e/test_servings.spec.ts tests/e2e/test_recipe.spec.ts
git commit -m "feat: recipe panel servings stepper with live-scaled ingredients"
```

---

## Task 8: Frontend — merged, servings-aware shopping list

**Files:**
- Modify: `index.html`
- Modify: `tests/e2e/test_shopping.spec.ts`

**Interfaces:**
- Consumes: `plan` shape (`{recipe, servings} | null` per day) from Task 5, `formatQty`/structured `ingredients` from Task 7.

- [ ] **Step 1: Write the failing e2e tests**

Replace the "shared ingredients are deduplicated" test in `tests/e2e/test_shopping.spec.ts` and add a new merge-sum test:

```typescript
test('matching ingredients are merged and summed across planned recipes', async ({ page }) => {
  // Both recipes contain garlic — quantities should sum, not just dedupe
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');
  await addRecipeToDay(page, 'Creamy Chicken & Bacon Pasta', 'tue');

  await page.click('#planTab');

  const items = page.locator('#shoppingGrid .shopping-item label');
  const texts = await items.allTextContents();
  const garlicItems = texts.filter(t => t.toLowerCase().includes('garlic'));
  expect(garlicItems).toHaveLength(1);
  // Sum must be a number, not the original unscaled per-recipe quantity string
  expect(garlicItems[0]).toMatch(/^\d+(\.\d+)?\s*cloves garlic/i);
});

test('shopping list quantities scale with a day\'s servings', async ({ page }) => {
  const card = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]');
  await card.locator('.add-plan-btn').click();
  await page.locator('#dayPickerServingsPlus').click(); // 2 -> 3
  await page.locator('#dayPickerList .day-picker-row[data-day="mon"]').dispatchEvent('click');

  await page.click('#planTab');
  const spaghettiItem = page.locator('#shoppingGrid .shopping-item label', { hasText: 'spaghetti or linguine' });
  await expect(spaghettiItem).toContainText('300g');
});
```

Remove or update the old "shared ingredients are deduplicated in the shopping list" test if it conflicts with the new merge test (it's superseded by the first test above — delete it to avoid duplicate coverage).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tests/e2e && npx playwright test test_shopping.spec.ts`
Expected: fails — `renderShoppingList` still reads `recipe.ingredients` as strings and `plan[d]` as a title string.

- [ ] **Step 3: Rewrite `renderShoppingList` to merge structured ingredients by day servings ratio**

Replace the whole function:

```javascript
function renderShoppingList() {
  const section = document.getElementById('shoppingSection');
  const grid = document.getElementById('shoppingGrid');
  if (!section || !grid) return;

  const plannedEntries = DAY_KEYS.map(d => plan[d]).filter(Boolean);
  if (plannedEntries.length === 0) {
    section.style.display = 'none';
    return;
  }

  // key -> { qty: number|null, unit: string|null, item: string, display: string }
  const merged = new Map();

  plannedEntries.forEach(({ recipe: title, servings }) => {
    const r = recipes.find(x => x.title === title);
    if (!r) return;
    const ratio = servings / r.servings;

    r.ingredients.forEach(ing => {
      const normalizedItem = ing.item.trim().toLowerCase();

      if (ing.qty === null) {
        // Unparsed/no-quantity ingredients: dedupe by exact original text, never summed.
        const key = `unparsed|${normalizedItem}`;
        if (!merged.has(key)) {
          merged.set(key, { qty: null, unit: null, item: ing.item.trim(), sortKey: normalizedItem });
        }
        return;
      }

      const key = `${ing.unit || ''}|${normalizedItem}`;
      const scaledQty = ing.qty * ratio;
      if (merged.has(key)) {
        merged.get(key).qty += scaledQty;
      } else {
        merged.set(key, { qty: scaledQty, unit: ing.unit, item: ing.item.trim(), sortKey: normalizedItem });
      }
    });
  });

  const rows = [...merged.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  grid.innerHTML = rows.map((row, i) => {
    const label = row.qty === null
      ? row.item
      : (row.unit ? `${formatQty(row.qty)}${row.unit} ${row.item}` : `${formatQty(row.qty)} ${row.item}`);
    return `
      <div class="shopping-item">
        <input type="checkbox" id="shop-${i}">
        <label for="shop-${i}">${escapeHtml(label)}</label>
      </div>
    `;
  }).join('');

  section.style.display = '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tests/e2e && npx playwright test test_shopping.spec.ts`
Expected: all pass.

- [ ] **Step 5: Run the full e2e suite**

Run: `cd tests/e2e && npx playwright test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/e2e/test_shopping.spec.ts
git commit -m "feat: merge and sum shopping list quantities by servings-scaled ingredient"
```

---

## Task 9: Frontend — save/load plan templates

**Files:**
- Modify: `index.html`
- Modify: `tests/e2e/fixtures/mock-api.ts`
- Create: `tests/e2e/test_templates.spec.ts`

**Interfaces:**
- Consumes: `GET /api/templates`, `POST /api/templates`, `POST /api/templates/{name}/apply` from Task 4.
- Consumes: `plan`, `DAY_KEYS`, `fetchPlan`, `renderPlanTab` from Task 5.

- [ ] **Step 1: Extend the mock API fixture with template routes**

Add to `tests/e2e/fixtures/mock-api.ts`, inside `setupMockApi` (as a second `page.route` call):

```typescript
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
```

- [ ] **Step 2: Write the failing e2e test**

Create `tests/e2e/test_templates.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

async function addRecipeToDay(page: import('@playwright/test').Page, recipeTitle: string, day: string) {
  const card = page.locator(`.card[data-title="${recipeTitle}"]`);
  await card.locator('.add-plan-btn').click();
  await page.locator(`#dayPickerList .day-picker-row[data-day="${day}"]`).dispatchEvent('click');
}

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('saving and loading a template round-trips the plan', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await page.click('#planTab');

  page.on('dialog', dialog => dialog.accept('Usual Week'));
  await page.click('#saveTemplateBtn');

  // Clear the plan
  await page.locator('.day-col-remove').first().click();
  await expect(page.locator('#planGrid .day-col-recipe')).toHaveCount(0);

  await page.selectOption('#loadTemplateSelect', 'Usual Week');
  page.on('dialog', dialog => dialog.accept());
  await page.click('#loadTemplateBtn');

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd tests/e2e && npx playwright test test_templates.spec.ts`
Expected: fails — `#saveTemplateBtn` doesn't exist.

- [ ] **Step 4: Add template UI markup to the Plan tab**

Find the Plan tab section (containing `id="planGrid"`) and add, right after the `planGrid` div and before the shopping section:

```html
<div class="template-controls">
  <button type="button" id="saveTemplateBtn">Save as template</button>
  <select id="loadTemplateSelect"><option value="">Load template…</option></select>
  <button type="button" id="loadTemplateBtn">Load</button>
</div>
```

Add minimal CSS near `.plan-tab-inner`:

```css
.template-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 20px;
}
.template-controls button, .template-controls select {
  padding: 6px 12px;
  border: 1px solid var(--divider);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
}
```

- [ ] **Step 5: Wire up save/load in JS**

Add near the other Plan tab wiring (after `fetchPlan` definition):

```javascript
function fetchTemplateNames() {
  fetch('/api/templates')
    .then(res => res.json())
    .then(names => {
      const select = document.getElementById('loadTemplateSelect');
      select.innerHTML = '<option value="">Load template…</option>' +
        names.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
    })
    .catch(() => {});
}

document.getElementById('saveTemplateBtn').addEventListener('click', () => {
  const name = prompt('Save current plan as:');
  if (!name) return;
  fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, plan })
  })
    .then(res => res.json())
    .then(() => fetchTemplateNames());
});

document.getElementById('loadTemplateBtn').addEventListener('click', () => {
  const name = document.getElementById('loadTemplateSelect').value;
  if (!name) return;
  if (!confirm(`Load "${name}"? This will overwrite the current week's plan.`)) return;
  fetch(`/api/templates/${encodeURIComponent(name)}/apply`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      plan = data;
      renderGrid();
      renderPlanTab();
    });
});
```

- [ ] **Step 6: Call `fetchTemplateNames()` on load**

In the final `fetch('recipes.json')` chain, after `fetchPlan();`, add:

```javascript
fetchTemplateNames();
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `cd tests/e2e && npx playwright test test_templates.spec.ts`
Expected: `1 passed`

- [ ] **Step 8: Run the full e2e suite**

Run: `cd tests/e2e && npx playwright test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add index.html tests/e2e/fixtures/mock-api.ts tests/e2e/test_templates.spec.ts
git commit -m "feat: save and load plan templates"
```

---

## Task 10: Frontend — plan week history navigation + copy-forward

**Files:**
- Modify: `index.html`
- Modify: `tests/e2e/fixtures/mock-api.ts`
- Create: `tests/e2e/test_history.spec.ts`

**Interfaces:**
- Consumes: `GET /api/plan/history`, `GET /api/plan/history/{week_key}`, `POST /api/plan/history/{week_key}/copy` from Task 3.
- Consumes: `DAY_KEYS`, `DAY_LABELS`, `plan`, `renderPlanTab`, `fetchPlan` from Task 5.

- [ ] **Step 1: Extend the mock API fixture with history routes**

Replace the full contents of `tests/e2e/fixtures/mock-api.ts` (this merges the `/api/plan` route from Task 5, the `/api/templates` route from Task 9, and adds the new `/api/plan/history` route with a `historyWeeks` param):

```typescript
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
  const templates: Record<string, Plan> = {};
  const history: Record<string, Plan> = { ...historyWeeks };

  // Registered first = lowest priority. Playwright gives matching priority to the
  // MOST RECENTLY registered route, and /api/plan/history also matches this broad
  // /api/plan(\/|$) pattern — so this general handler must be registered before
  // (not after) the more specific /api/plan/history handler below, or the specific
  // one would never run.
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
```

This changes `setupMockApi`'s signature, but the two new parameters are optional with defaults, so existing calls like `setupMockApi(page)` across other spec files remain valid with no edits needed.

- [ ] **Step 2: Write the failing e2e test**

Create `tests/e2e/test_history.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

const PAST_WEEK: Record<string, { recipe: string; servings: number } | null> = {
  mon: { recipe: 'Garlic Butter Pasta with Parmesan', servings: 2 },
  tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
};

test.beforeEach(async ({ page }) => {
  await setupMockApi(page, {}, { '2026-08-03': PAST_WEEK });
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('history view lists past weeks and shows their plan read-only', async ({ page }) => {
  await page.click('#planTab');
  await page.click('#historyBtn');

  await expect(page.locator('#historyWeekList option')).toHaveCount(1);
  await page.selectOption('#historyWeekList', '2026-08-03');

  await expect(page.locator('#historyGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('copying a past week overwrites the current plan', async ({ page }) => {
  await page.click('#planTab');
  await page.click('#historyBtn');
  await page.selectOption('#historyWeekList', '2026-08-03');

  page.on('dialog', dialog => dialog.accept());
  await page.click('#historyCopyBtn');

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd tests/e2e && npx playwright test test_history.spec.ts`
Expected: fails — `#historyBtn` doesn't exist.

- [ ] **Step 4: Add history UI markup to the Plan tab**

Add after the `.template-controls` div added in Task 9:

```html
<div class="history-controls">
  <button type="button" id="historyBtn">History</button>
  <div id="historyPanel" style="display: none;">
    <select id="historyWeekList"><option value="">Select a past week…</option></select>
    <div id="historyGrid"></div>
    <button type="button" id="historyCopyBtn">Copy to current week</button>
  </div>
</div>
```

Add minimal CSS near `.template-controls`:

```css
.history-controls { margin-bottom: 20px; }
.history-controls button, .history-controls select {
  padding: 6px 12px;
  border: 1px solid var(--divider);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
}
#historyPanel {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--divider);
  border-radius: var(--radius);
}
#historyGrid { margin: 10px 0; font-size: 13px; }
```

- [ ] **Step 5: Wire up history navigation and copy in JS**

Add near the template JS from Task 9:

```javascript
let selectedHistoryWeek = null;

function fetchHistoryWeeks() {
  fetch('/api/plan/history')
    .then(res => res.json())
    .then(weeks => {
      const select = document.getElementById('historyWeekList');
      select.innerHTML = '<option value="">Select a past week…</option>' +
        weeks.map(w => `<option value="${w.week_key}">${w.week_key} (${w.days_filled} planned)</option>`).join('');
    })
    .catch(() => {});
}

document.getElementById('historyBtn').addEventListener('click', () => {
  const panel = document.getElementById('historyPanel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) fetchHistoryWeeks();
});

document.getElementById('historyWeekList').addEventListener('change', (e) => {
  selectedHistoryWeek = e.target.value || null;
  const historyGrid = document.getElementById('historyGrid');
  if (!selectedHistoryWeek) {
    historyGrid.innerHTML = '';
    return;
  }
  fetch(`/api/plan/history/${selectedHistoryWeek}`)
    .then(res => res.json())
    .then(weekPlan => {
      historyGrid.innerHTML = DAY_KEYS
        .filter(d => weekPlan[d])
        .map(d => `<div>${DAY_LABELS[d]}: ${escapeHtml(weekPlan[d].recipe)} · ${weekPlan[d].servings}</div>`)
        .join('') || '<div>No recipes planned that week.</div>';
    });
});

document.getElementById('historyCopyBtn').addEventListener('click', () => {
  if (!selectedHistoryWeek) return;
  if (!confirm('Copy this week into the current week? This will overwrite the current plan.')) return;
  fetch(`/api/plan/history/${selectedHistoryWeek}/copy`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      plan = data;
      renderGrid();
      renderPlanTab();
      document.getElementById('historyPanel').style.display = 'none';
    });
});
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `cd tests/e2e && npx playwright test test_history.spec.ts`
Expected: `2 passed`

- [ ] **Step 7: Run the full e2e suite**

Run: `cd tests/e2e && npx playwright test`
Expected: all pass.

- [ ] **Step 8: Run the full backend suite one more time to confirm no regressions across the whole feature**

Run: `python -m pytest api/tests/ migrations/ -v`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add index.html tests/e2e/fixtures/mock-api.ts tests/e2e/test_history.spec.ts
git commit -m "feat: plan week history navigation and copy-forward"
```

---

## Self-Review: Spec Coverage

| Spec Requirement | Covered In |
|---|---|
| `servings` + structured ingredients in `recipes/*.json` | Task 1 |
| Unparseable ingredient lines fall back safely, never dropped | Task 1 |
| `VALID_DAYS` extends to 7 days | Task 2 |
| Plan storage becomes week-keyed (`weeks` + `templates`) | Task 2 |
| Week key computed server-side (ISO Monday-start) | Task 2 |
| `GET /api/plan` / `PATCH /api/plan/{day}` with per-day servings | Task 2 |
| `GET /api/plan/history`, `GET .../{week_key}`, `POST .../copy` | Task 3 |
| `GET/POST /api/templates`, `POST .../apply`, `DELETE` | Task 4 |
| Planner grid Mon–Sun, always shown | Task 5 |
| Day picker sets day + servings in one action | Task 5 (default), Task 6 (stepper) |
| Recipe panel servings stepper + live-scaled ingredients | Task 7 |
| Shopping list merges/sums matching items by servings ratio | Task 8 |
| Save/load named templates with overwrite confirm | Task 9 |
| Calendar week history + copy-forward with overwrite confirm | Task 10 |
| Servings clamped to minimum 1 | Task 2 (backend), Task 6/7 (frontend steppers) |
| No unit conversion during merge | Task 8 |
