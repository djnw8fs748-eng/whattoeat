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
