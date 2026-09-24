import time

from src.llm.explainer import LLMExplainer


def _tools():
    return {
        "get_observations_latest": lambda: {
            "timestamp_utc": "2024-06-01T08:00:00Z",
            "sensors": {"temp_sht_c": {"value": 22.5}, "humidity_sht_pct": {"value": 70}},
        },
        "get_rain_risk": lambda: {"p_rain_3h": 0.2, "p_rain_24h": 0.4},
        "get_irrigation": lambda: {
            "et0_today_mm": 4.2,
            "water_balance_mm": -12.0,
            "irrigation_required": False,
            "irrigation_action": "No irrigation required",
        },
        "get_advisories": lambda: [],
        "get_forecast": lambda: {"forecast": []},
    }


def test_no_invented_numbers():
    # Feature: conduit-sentinel, Property 28: LLM No Invented Numbers
    explainer = LLMExplainer(_tools())

    def llm(prompt, question, payloads):
        return "Temperature is 22.5 and rain risk is 0.2"

    result = explainer.explain("How hot is it?", llm_call=llm)
    logged = str(result.tool_calls)
    for token in ["22.5", "0.2"]:
        assert token in result.answer
        assert token in logged


def test_fallback_429():
    # Feature: conduit-sentinel, Property 29: LLM Fallback Availability
    explainer = LLMExplainer(_tools())

    class Quota(Exception):
        status_code = 429

    started = time.monotonic()
    result = explainer.explain("hello", llm_call=lambda *a, **k: (_ for _ in ()).throw(Quota()))
    elapsed = time.monotonic() - started
    assert result.response_type == "templated"
    assert result.answer
    assert elapsed < 2.0
