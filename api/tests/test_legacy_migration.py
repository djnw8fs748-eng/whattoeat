import json

import pytest
from fastapi.testclient import TestClient

import api.main as main_module
from api.main import app

client = TestClient(app)

EMPTY_WEEK = {"mon": None, "tue": None, "wed": None, "thu": None, "fri": None, "sat": None, "sun": None}


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "STORE_FILE", tmp_path / "store.json")
    monkeypatch.setattr(main_module, "PLAN_FILE", tmp_path / "plan.json")


def test_legacy_plan_with_some_days_filled_is_wrapped_into_current_week():
    main_module.PLAN_FILE.write_text(json.dumps({
        "mon": "Garlic Butter Pasta",
        "tue": None,
        "wed": "Chicken Curry",
        "thu": None,
        "fri": None,
    }))

    response = client.get("/api/plan")

    assert response.status_code == 200
    data = response.json()
    assert data["mon"] == {"recipe": "Garlic Butter Pasta", "servings": 2}
    assert data["wed"] == {"recipe": "Chicken Curry", "servings": 2}
    assert data["tue"] is None
    assert data["thu"] is None
    assert data["fri"] is None
    assert data["sat"] is None
    assert data["sun"] is None

    # the legacy file must be left untouched, not deleted/modified
    assert main_module.PLAN_FILE.exists()
    on_disk = json.loads(main_module.PLAN_FILE.read_text())
    assert on_disk == {
        "mon": "Garlic Butter Pasta",
        "tue": None,
        "wed": "Chicken Curry",
        "thu": None,
        "fri": None,
    }


def test_legacy_plan_is_ignored_once_store_json_exists():
    main_module.PLAN_FILE.write_text(json.dumps({
        "mon": "Garlic Butter Pasta",
        "tue": None,
        "wed": None,
        "thu": None,
        "fri": None,
    }))
    main_module.STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
    main_module.STORE_FILE.write_text(json.dumps({"weeks": {}, "templates": {}}))

    response = client.get("/api/plan")

    assert response.status_code == 200
    assert response.json() == EMPTY_WEEK


def test_no_legacy_plan_and_no_store_returns_empty_store():
    assert not main_module.PLAN_FILE.exists()
    assert not main_module.STORE_FILE.exists()

    response = client.get("/api/plan")

    assert response.status_code == 200
    assert response.json() == EMPTY_WEEK


def test_migration_is_reflected_via_patch_endpoint_persisting_to_store():
    main_module.PLAN_FILE.write_text(json.dumps({
        "mon": "Garlic Butter Pasta",
        "tue": None,
        "wed": None,
        "thu": None,
        "fri": None,
    }))

    # first read triggers the one-time migration and returns it inline
    first = client.get("/api/plan").json()
    assert first["mon"] == {"recipe": "Garlic Butter Pasta", "servings": 2}

    # a subsequent write should build on top of the migrated week, not lose it
    patch_resp = client.patch("/api/plan/tue", json={"recipe": "New Dish", "servings": 3})
    assert patch_resp.status_code == 200
    assert patch_resp.json()["mon"] == {"recipe": "Garlic Butter Pasta", "servings": 2}
    assert patch_resp.json()["tue"] == {"recipe": "New Dish", "servings": 3}
