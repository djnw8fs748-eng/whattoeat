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
