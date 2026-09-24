from src.ingest.http_retry import request_with_retry
from src.ingest.openmeteo import OpenMeteoCollector
from src.ingest.types import CollectionResult


class DummyResp:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {"hourly": {"time": []}}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)

    def json(self):
        return self._payload


def test_retry_skips_4xx(monkeypatch):
    calls = {"n": 0}

    def fake_request(method, url, **kwargs):
        calls["n"] += 1
        return DummyResp(400)

    class Sess:
        request = staticmethod(fake_request)

    resp = request_with_retry("GET", "https://example.com", session=Sess(), sleep=lambda s: None)
    assert resp.status_code == 400
    assert calls["n"] == 1


def test_openmeteo_offline(monkeypatch):
    collector = OpenMeteoCollector()

    def boom(*a, **k):
        raise RuntimeError("offline")

    monkeypatch.setattr("src.ingest.openmeteo.request_with_retry", boom)
    result = collector.run(sleep=lambda s: None)
    assert isinstance(result, CollectionResult)
    assert result.records_written == 0
    assert result.errors
