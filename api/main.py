import json
import threading
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

PLAN_FILE = Path("/data/plan.json")
_lock = threading.Lock()

VALID_DAYS = ("mon", "tue", "wed", "thu", "fri")
EMPTY_PLAN: dict = {d: None for d in VALID_DAYS}


def _read_plan() -> dict:
    if not PLAN_FILE.exists():
        return dict(EMPTY_PLAN)
    return json.loads(PLAN_FILE.read_text())


def _write_plan(plan: dict) -> None:
    PLAN_FILE.parent.mkdir(parents=True, exist_ok=True)
    PLAN_FILE.write_text(json.dumps(plan))


@app.get("/api/plan")
def get_plan():
    with _lock:
        return _read_plan()


class DayUpdate(BaseModel):
    recipe: Optional[str] = None


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
