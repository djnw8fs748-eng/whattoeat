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
