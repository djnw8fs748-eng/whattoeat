import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator

app = FastAPI()

PLAN_FILE = Path("/data/plan.json")
_lock = threading.Lock()

VALID_DAYS = ("mon", "tue", "wed", "thu", "fri")
EMPTY_PLAN: dict = {d: None for d in VALID_DAYS}


def _read_plan() -> dict:
    if not PLAN_FILE.exists():
        return dict(EMPTY_PLAN)
    try:
        return json.loads(PLAN_FILE.read_text())
    except json.JSONDecodeError:
        return dict(EMPTY_PLAN)


def _write_plan(plan: dict) -> None:
    PLAN_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=PLAN_FILE.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(plan, f)
        os.replace(tmp, PLAN_FILE)
    except Exception:
        os.unlink(tmp)
        raise


@app.get("/api/plan")
def get_plan():
    with _lock:
        return _read_plan()


class DayUpdate(BaseModel):
    recipe: Optional[str] = None

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
    with _lock:
        plan = _read_plan()
        plan[day] = body.recipe
        _write_plan(plan)
    return plan
