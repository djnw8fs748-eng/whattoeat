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
