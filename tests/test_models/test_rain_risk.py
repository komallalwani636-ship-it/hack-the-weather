"""Property-based tests for M1 RainRisk model.

Validates: Requirements covering M1 Rain-Risk LightGBM classifier properties.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.models.rain_risk import RainRiskModel

# ── Generators ───────────────────────────────────────────────────────────────

_feat_full = st.fixed_dictionaries(
    {
        "pressure_tendency_1h": st.floats(-5, 5, allow_nan=False, allow_infinity=False),
        "pressure_tendency_3h": st.floats(-5, 5, allow_nan=False, allow_infinity=False),
        "pressure_tendency_6h": st.floats(-5, 5, allow_nan=False, allow_infinity=False),
        "rain_1h": st.floats(0, 10, allow_nan=False, allow_infinity=False),
        "rain_3h": st.floats(0, 20, allow_nan=False, allow_infinity=False),
        "rain_24h": st.floats(0, 50, allow_nan=False, allow_infinity=False),
        "humidity_delta_1h": st.floats(-10, 10, allow_nan=False, allow_infinity=False),
        "temperature_delta_1h": st.floats(-5, 5, allow_nan=False, allow_infinity=False),
        "wind_gust_ratio": st.floats(-1, 5, allow_nan=False, allow_infinity=False),
        "hour_sin": st.floats(-1, 1, allow_nan=False, allow_infinity=False),
        "hour_cos": st.floats(-1, 1, allow_nan=False, allow_infinity=False),
        # OM features may be None (partial NaN simulates missing Open-Meteo)
        "om_temp": st.one_of(st.none(), st.floats(10, 35, allow_nan=False, allow_infinity=False)),
        "om_precip_prob": st.one_of(st.none(), st.floats(0, 100, allow_nan=False, allow_infinity=False)),
        "om_rh": st.one_of(st.none(), st.floats(20, 100, allow_nan=False, allow_infinity=False)),
        "om_sw_rad": st.one_of(st.none(), st.floats(0, 1000, allow_nan=False, allow_infinity=False)),
    }
)

# ── Property 7: Probability Range Invariant ──────────────────────────────────


@given(_feat_full)
@settings(max_examples=100)
def test_probability_range(vector):
    """**Validates: Requirements M1**
    Property 7: For any feature vector (including partial NaN),
    0.0 ≤ p_rain_3h ≤ 1.0 and 0.0 ≤ p_rain_24h ≤ 1.0.
    """
    pred = RainRiskModel().predict(vector)
    if pred.insufficient_data:
        # Even on insufficient data the defaults must be in range
        assert pred.p_rain_3h == 0.0
        assert pred.p_rain_24h == 0.0
        return
    assert 0.0 <= pred.p_rain_3h <= 1.0, f"p_rain_3h={pred.p_rain_3h!r} out of [0, 1]"
    assert 0.0 <= pred.p_rain_24h <= 1.0, f"p_rain_24h={pred.p_rain_24h!r} out of [0, 1]"


# ── Property 8: Monotonic Rain Signal ────────────────────────────────────────


@given(_feat_full, st.floats(0.1, 5, allow_nan=False, allow_infinity=False))
@settings(max_examples=100)
def test_monotonic_rain(vector, bump):
    """**Validates: Requirements M1**
    Property 8: Increasing rain_3h holding all else constant →
    p_rain_3h does not decrease.
    """
    model = RainRiskModel()
    base_pred = model.predict(vector)
    bumped = dict(vector)
    bumped["rain_3h"] = (vector["rain_3h"] or 0.0) + bump
    higher_pred = model.predict(bumped)
    # Allow tiny floating-point slack
    assert higher_pred.p_rain_3h + 1e-9 >= base_pred.p_rain_3h, (
        f"Monotonicity violated: base={base_pred.p_rain_3h}, "
        f"higher={higher_pred.p_rain_3h} (rain_3h bumped by {bump})"
    )


# ── Parametrized boundary tests ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "rain_3h,rain_24h",
    [
        (0.0, 0.0),  # zero rain
        (5.0, 0.0),  # exactly at clip threshold for p3
        (20.0, 20.0),  # max range rain_24h still below clip threshold
        (0.0, 20.0),  # only 24h rain
    ],
)
def test_boundary_persistence_baseline(rain_3h, rain_24h):
    """Boundary: persistence-baseline probabilities stay in [0, 1]."""
    model = RainRiskModel()
    pred = model.predict({"rain_3h": rain_3h, "rain_24h": rain_24h})
    assert 0.0 <= pred.p_rain_3h <= 1.0
    assert 0.0 <= pred.p_rain_24h <= 1.0
