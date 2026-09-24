from datetime import datetime, timezone

from fastapi.testclient import TestClient

from src.api import main as api_main
from src.api.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "data_last_updated_utc" in body


def test_latest_includes_history():
    response = client.get("/observations/latest")
    assert response.status_code == 200
    history = response.json().get("history") or {}
    assert "temp_sht_c" in history
    assert isinstance(history["temp_sht_c"], list)


def test_core_get_endpoints_ok():
    # Feature: conduit-sentinel, Property 27: API Endpoint Schema Conformance
    for path in ["/health", "/observations/latest", "/forecast", "/risk/rain", "/irrigation", "/advisories"]:
        response = client.get(path)
        assert response.status_code == 200, path


def test_observations_invalid_range():
    start = datetime(2024, 6, 2, tzinfo=timezone.utc).isoformat()
    end = datetime(2024, 6, 1, tzinfo=timezone.utc).isoformat()
    response = client.get("/observations", params={"from": start, "to": end})
    assert response.status_code == 422


def test_observations_too_long():
    start = datetime(2024, 6, 1, tzinfo=timezone.utc).isoformat()
    end = datetime(2024, 6, 10, tzinfo=timezone.utc).isoformat()
    response = client.get("/observations", params={"from": start, "to": end})
    assert response.status_code == 422


def test_observation_round_trip():
    # Feature: conduit-sentinel, Property 26: API Observation Round-Trip
    ts = datetime.now(tz=timezone.utc).replace(microsecond=0)
    record = {
        "timestamp_utc": ts,
        "source": "conduit",
        "rain_gauge_1_mm": 0.42,
        "qc_flag": "OK",
    }
    api_main.store.write_silver_record(record)
    response = client.get("/observations", params={"from": ts.isoformat(), "to": ts.isoformat()})
    assert response.status_code == 200
    body = response.json()
    assert any(abs(float(item.get("rain_gauge_1_mm") or 0) - 0.42) < 1e-6 for item in body)


def test_assistant():
    response = client.post("/assistant", json={"question": "Should I irrigate today?"})
    assert response.status_code == 200
    assert response.json()["answer"]
