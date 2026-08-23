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
PLAN_FILE = Path("/data/plan.json")
_lock = threading.Lock()

VALID_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
LEGACY_DAYS = ("mon", "tue", "wed", "thu", "fri")
EMPTY_DAY_PLAN: dict = {d: None for d in VALID_DAYS}
LEGACY_DEFAULT_SERVINGS = 2


def current_week_key(today: Optional[date] = None) -> str:
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    return monday.isoformat()


def _migrate_legacy_plan() -> dict:
    """One-time migration: if no store.json exists but a legacy plan.json
    (old 5-day, day -> recipe title string format) does, wrap it into the
    current week of a fresh store. The legacy file is left untouched as an
    inert backup. Returns a normal empty store if plan.json is absent or
    unreadable."""
    if not PLAN_FILE.exists():
        return {"weeks": {}, "templates": {}}
    try:
        legacy = json.loads(PLAN_FILE.read_text())
    except json.JSONDecodeError:
        return {"weeks": {}, "templates": {}}

    week = dict(EMPTY_DAY_PLAN)
    for day in LEGACY_DAYS:
        title = legacy.get(day) if isinstance(legacy, dict) else None
        if title:
            week[day] = {"recipe": title, "servings": LEGACY_DEFAULT_SERVINGS}
    return {"weeks": {current_week_key(): week}, "templates": {}}


def _read_store() -> dict:
    if not STORE_FILE.exists():
        return _migrate_legacy_plan()
    try:
        store = json.loads(STORE_FILE.read_text())
    except json.JSONDecodeError:
        return {"weeks": {}, "templates": {}}
    if not isinstance(store, dict):
        return {"weeks": {}, "templates": {}}
    store.setdefault("weeks", {})
    store.setdefault("templates", {})
    return store


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


class DayPlanEntry(BaseModel):
    recipe: str
    servings: int

    @field_validator('recipe')
    @classmethod
    def cap_length(cls, v: str) -> str:
        if len(v) > 200:
            raise ValueError('recipe name too long (max 200 chars)')
        return v

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
