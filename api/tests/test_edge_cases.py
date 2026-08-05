import pytest
import threading
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_plan_file(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "PLAN_FILE", tmp_path / "plan.json")


def test_patch_name_too_long():
    name = "A" * 201
    response = client.patch("/api/plan/mon", json={"recipe": name})
    assert response.status_code == 422


def test_patch_all_valid_days_roundtrip():
    days = ["mon", "tue", "wed", "thu", "fri"]
    for i, day in enumerate(days):
        r = client.patch(f"/api/plan/{day}", json={"recipe": f"Recipe {i}"})
        assert r.status_code == 200

    data = client.get("/api/plan").json()
    for i, day in enumerate(days):
        assert data[day] == f"Recipe {i}"


def test_concurrent_writes_all_persist():
    days = ["mon", "tue", "wed", "thu", "fri"]
    barrier = threading.Barrier(len(days))
    errors: list[Exception] = []

    def patch_day(day: str, recipe: str) -> None:
        barrier.wait()  # all threads start simultaneously
        try:
            r = client.patch(f"/api/plan/{day}", json={"recipe": recipe})
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
        assert data[day] == f"Recipe for {day}"


def test_corrupt_plan_file_returns_empty_plan(tmp_path, monkeypatch):
    plan_file = tmp_path / "plan.json"
    plan_file.write_text("{bad json}")
    monkeypatch.setattr(main_module, "PLAN_FILE", plan_file)

    response = client.get("/api/plan")
    assert response.status_code == 200
    assert response.json() == {
        "mon": None, "tue": None, "wed": None, "thu": None, "fri": None
    }
