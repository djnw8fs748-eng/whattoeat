import pytest
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "STORE_FILE", tmp_path / "store.json")


def test_get_ratings_returns_empty_dict_when_no_file():
    response = client.get("/api/ratings")
    assert response.status_code == 200
    assert response.json() == {}


def test_put_rating_sets_up():
    response = client.put("/api/ratings/Garlic Butter Pasta", json={"rating": "up"})
    assert response.status_code == 200
    assert response.json() == {"Garlic Butter Pasta": "up"}


def test_put_rating_sets_down():
    response = client.put("/api/ratings/Garlic Butter Pasta", json={"rating": "down"})
    assert response.status_code == 200
    assert response.json() == {"Garlic Butter Pasta": "down"}


def test_get_ratings_reflects_previous_put():
    client.put("/api/ratings/Garlic Butter Pasta", json={"rating": "up"})
    response = client.get("/api/ratings")
    assert response.status_code == 200
    assert response.json() == {"Garlic Butter Pasta": "up"}


def test_put_rating_null_clears_existing_rating():
    client.put("/api/ratings/Garlic Butter Pasta", json={"rating": "up"})
    response = client.put("/api/ratings/Garlic Butter Pasta", json={"rating": None})
    assert response.status_code == 200
    assert response.json() == {}


def test_put_rating_null_when_absent_is_a_no_op():
    response = client.put("/api/ratings/Never Rated", json={"rating": None})
    assert response.status_code == 200
    assert response.json() == {}


def test_put_rating_preserves_other_titles():
    client.put("/api/ratings/Pasta", json={"rating": "up"})
    client.put("/api/ratings/Curry", json={"rating": "down"})
    response = client.get("/api/ratings")
    assert response.json() == {"Pasta": "up", "Curry": "down"}


def test_put_rating_invalid_value_returns_422():
    response = client.put("/api/ratings/Garlic Butter Pasta", json={"rating": "sideways"})
    assert response.status_code == 422
