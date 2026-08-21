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
