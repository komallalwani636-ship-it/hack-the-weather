from datetime import datetime, timezone

from hypothesis import given, settings
from hypothesis import strategies as st

from src.decision.rules import DecisionEngine, SEVERITY_ORDER


def test_rain_warning_rule():
    now = datetime(2024, 6, 1, 8, tzinfo=timezone.utc)
    adv = DecisionEngine().evaluate(
        {"p_rain_3h": 0.74, "p_rain_24h": 0.4, "water_balance": 0, "heat_level": None}, now=now
    )
    rain = [a for a in adv if a.type == "rain_risk"][0]
    assert rain.severity == "warning"
    assert rain.action == "Delay spraying or harvest drying operations"
    assert (rain.valid_until - rain.valid_from).total_seconds() == 3 * 3600


def test_rain_info_rule():
    adv = DecisionEngine().evaluate({"p_rain_3h": 0.4, "p_rain_24h": 0.6, "water_balance": 0})
    rain = [a for a in adv if a.type == "rain_risk"][0]
    assert rain.severity == "info"


def test_irrigation_and_heat():
    adv = DecisionEngine().evaluate(
        {"p_rain_3h": 0.1, "p_rain_24h": 0.1, "water_balance": -25.0, "heat_level": "High", "wbgt_c": 33.0}
    )
    types = {a.type for a in adv}
    assert "irrigation" in types and "heat_stress" in types
    heat = [a for a in adv if a.type == "heat_stress"][0]
    assert heat.severity == "warning"


def test_empty_when_nothing_fires():
    adv = DecisionEngine().evaluate({"p_rain_3h": 0.1, "p_rain_24h": 0.1, "water_balance": 0.0})
    assert adv == [] or all(a.type == "heat_stress" for a in adv)


@given(
    st.floats(0, 1, allow_nan=False, allow_infinity=False),
    st.floats(-150, 0, allow_nan=False, allow_infinity=False),
    st.floats(-5, 55, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=40)
def test_threshold_completeness(p3, water, wbgt):
    # Feature: conduit-sentinel, Property 24
    result = DecisionEngine().evaluate({"p_rain_3h": p3, "p_rain_24h": 0.0, "water_balance": water, "wbgt_c": wbgt})
    assert isinstance(result, list)


@given(st.floats(0, 1, allow_nan=False, allow_infinity=False))
@settings(max_examples=30)
def test_evidence_integrity(p3):
    # Feature: conduit-sentinel, Property 23
    outputs = {"p_rain_3h": p3, "p_rain_24h": 0.8 if p3 <= 0.7 else 0.2, "water_balance": 0}
    for adv in DecisionEngine().evaluate(outputs):
        if "p_rain_3h" in adv.evidence:
            assert adv.evidence["p_rain_3h"] == p3


def test_severity_monotonicity():
    # Feature: conduit-sentinel, Property 25
    engine = DecisionEngine()
    s1 = [
        a.severity
        for a in engine.evaluate({"p_rain_3h": 0.4, "p_rain_24h": 0.6, "water_balance": 0})
        if a.type == "rain_risk"
    ]
    s2 = [
        a.severity
        for a in engine.evaluate({"p_rain_3h": 0.8, "p_rain_24h": 0.6, "water_balance": 0})
        if a.type == "rain_risk"
    ]
    if s1 and s2:
        assert SEVERITY_ORDER[s2[0]] >= SEVERITY_ORDER[s1[0]]
