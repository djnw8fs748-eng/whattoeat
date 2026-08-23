import pytest
import threading
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "STORE_FILE", tmp_path / "store.json")


def test_patch_name_too_long():
    name = "A" * 201
    response = client.patch("/api/plan/mon", json={"recipe": name, "servings": 2})
    assert response.status_code == 422


def test_patch_all_valid_days_roundtrip():
    days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    for i, day in enumerate(days):
        r = client.patch(f"/api/plan/{day}", json={"recipe": f"Recipe {i}", "servings": i + 1})
        assert r.status_code == 200

    data = client.get("/api/plan").json()
    for i, day in enumerate(days):
        assert data[day] == {"recipe": f"Recipe {i}", "servings": i + 1}


def test_get_plan_when_store_missing_weeks_and_templates_keys(tmp_path):
    main_module.STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
    main_module.STORE_FILE.write_text("{}")

    response = client.get("/api/plan")

    assert response.status_code == 200
    assert response.json() == {
        "mon": None, "tue": None, "wed": None, "thu": None,
        "fri": None, "sat": None, "sun": None,
    }


@pytest.mark.parametrize("contents", ["null", "[]", "42", '"a string"'])
def test_get_plan_when_store_is_valid_json_but_not_an_object(contents):
    main_module.STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
    main_module.STORE_FILE.write_text(contents)

    response = client.get("/api/plan")

    assert response.status_code == 200
    assert response.json() == {
        "mon": None, "tue": None, "wed": None, "thu": None,
        "fri": None, "sat": None, "sun": None,
    }


def test_save_template_rejects_recipe_name_too_long():
    name = "A" * 201
    plan = {d: None for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
    plan["mon"] = {"recipe": name, "servings": 2}
    response = client.post("/api/templates", json={"name": "Long Recipe", "plan": plan})
    assert response.status_code == 422


def test_concurrent_writes_all_persist():
    days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    barrier = threading.Barrier(len(days))
    errors: list[Exception] = []

    def patch_day(day: str, recipe: str) -> None:
        barrier.wait()  # all threads start simultaneously
        try:
            r = client.patch(f"/api/plan/{day}", json={"recipe": recipe, "servings": 2})
            assert r.status_code == 200
        except Exception as exc:
            errors.append(exc)

    threads = [
        threading.Thread(target=patch_day, args=(day, f"Recipe for {day}"))
        for day in days
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"Thread errors: {errors}"

    data = client.get("/api/plan").json()
    for day in days:
        assert data[day] == {"recipe": f"Recipe for {day}", "servings": 2}
