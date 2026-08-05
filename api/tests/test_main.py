import pytest
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_plan_file(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "PLAN_FILE", tmp_path / "plan.json")


def test_get_plan_returns_empty_when_no_file():
    response = client.get("/api/plan")
    assert response.status_code == 200
    assert response.json() == {
        "mon": None, "tue": None, "wed": None, "thu": None, "fri": None
    }


def test_get_plan_returns_saved_plan(tmp_path, monkeypatch):
    plan_file = tmp_path / "plan.json"
    plan_file.write_text('{"mon":"Garlic Butter Pasta","tue":null,"wed":null,"thu":null,"fri":null}')
    monkeypatch.setattr(main_module, "PLAN_FILE", plan_file)
    response = client.get("/api/plan")
    assert response.status_code == 200
    assert response.json()["mon"] == "Garlic Butter Pasta"


def test_patch_day_sets_recipe():
    response = client.patch("/api/plan/mon", json={"recipe": "Garlic Butter Pasta"})
    assert response.status_code == 200
    assert response.json()["mon"] == "Garlic Butter Pasta"


def test_patch_day_clears_recipe():
    client.patch("/api/plan/mon", json={"recipe": "Garlic Butter Pasta"})
    response = client.patch("/api/plan/mon", json={"recipe": None})
    assert response.status_code == 200
    assert response.json()["mon"] is None


def test_patch_preserves_other_days():
    client.patch("/api/plan/mon", json={"recipe": "Pasta"})
    client.patch("/api/plan/wed", json={"recipe": "Curry"})
    response = client.get("/api/plan")
    data = response.json()
    assert data["mon"] == "Pasta"
    assert data["wed"] == "Curry"
    assert data["tue"] is None


def test_patch_invalid_day_returns_400():
    response = client.patch("/api/plan/saturday", json={"recipe": "Something"})
    assert response.status_code == 400


def test_patch_replaces_existing_recipe():
    client.patch("/api/plan/fri", json={"recipe": "Old Recipe"})
    response = client.patch("/api/plan/fri", json={"recipe": "New Recipe"})
    assert response.status_code == 200
    assert response.json()["fri"] == "New Recipe"
