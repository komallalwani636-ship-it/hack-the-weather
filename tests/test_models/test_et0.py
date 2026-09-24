"""Property-based tests for M4 ET0Model (FAO-56 Penman-Monteith).

Validates: Requirements covering ET0 computation and water-balance irrigation model.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.models.et0 import ET0Model

# ── Property 15: ET0 Physical Range ───────────────────────────────────────────


@given(
    st.floats(5, 40, allow_nan=False, allow_infinity=False),
    st.floats(10, 100, allow_nan=False, allow_infinity=False),
    st.floats(0, 20, allow_nan=False, allow_infinity=False),
    st.floats(900, 1020, allow_nan=False, allow_infinity=False),
    st.floats(0, 1000, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_et0_range(temp, rh, wind, pressure, rad):
    """**Validates: Requirements M4**
    Property 15: For temp 5–40°C, RH 10–100%, wind 0–20 m/s,
    radiation 0–1000 W/m² → 0.0 ≤ ET0 ≤ 15.0.
    """
    et0 = ET0Model.et0_fao56(temp, rh, wind, pressure, rad)
    assert 0.0 <= et0 <= 15.0, (
        f"ET0={et0!r} out of [0, 15] for temp={temp}, rh={rh}, " f"wind={wind}, pressure={pressure}, rad={rad}"
    )


# ── Property 16: Water Balance Closure ────────────────────────────────────────


@given(
    st.lists(st.floats(0, 20, allow_nan=False, allow_infinity=False), min_size=1, max_size=20),
    st.lists(st.floats(0, 15, allow_nan=False, allow_infinity=False), min_size=1, max_size=20),
    st.floats(0.2, 1.5, allow_nan=False, allow_infinity=False),
    st.floats(-50, 0, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_water_balance_closure(rains, et0s, kc, start):
    """**Validates: Requirements M4**
    Property 16: sum(rain_t - ET0_t * Kc) over n days ==
    soil_water_n - soil_water_0 to within 1e-6 (before clamping).
    """
    # Align lengths (zip stops at shortest)
    n = min(len(rains), len(et0s))
    rains = rains[:n]
    et0s = et0s[:n]
    end = ET0Model.water_balance_unclamped(rains, et0s, kc, start=start)
    expected = start + sum(r - e * kc for r, e in zip(rains, et0s))
    assert (
        abs(end - expected) < 1e-6
    ), f"Water balance mismatch: computed={end}, expected={expected}, diff={abs(end - expected)}"


# ── Property 17: Irrigation Amount Non-Negative ───────────────────────────────


@given(
    st.floats(0, 30, allow_nan=False, allow_infinity=False),  # rain_mm
    st.floats(5, 40, allow_nan=False, allow_infinity=False),  # temp_c
    st.floats(10, 100, allow_nan=False, allow_infinity=False),  # rh_pct
    st.floats(0, 20, allow_nan=False, allow_infinity=False),  # wind_ms
    st.floats(900, 1020, allow_nan=False, allow_infinity=False),  # pressure_hpa
    st.floats(0, 1000, allow_nan=False, allow_infinity=False),  # sw_wm2
)
@settings(max_examples=100)
def test_irrigation_amount_nonneg(rain, temp, rh, wind, pressure, rad):
    """**Validates: Requirements M4**
    Property 17: irrigation_amount >= 0.0 always.
    """
    model = ET0Model()
    advice = model.step(rain, temp, rh, wind, pressure, rad)
    assert advice.irrigation_amount_mm >= 0.0, f"irrigation_amount_mm={advice.irrigation_amount_mm!r} is negative"


# ── Property 18: Determinism (same inputs → same outputs) ────────────────────


@given(
    st.floats(0, 30, allow_nan=False, allow_infinity=False),
    st.floats(5, 40, allow_nan=False, allow_infinity=False),
    st.floats(10, 100, allow_nan=False, allow_infinity=False),
    st.floats(0, 20, allow_nan=False, allow_infinity=False),
    st.floats(900, 1020, allow_nan=False, allow_infinity=False),
    st.floats(0, 1000, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_determinism(rain, temp, rh, wind, pressure, rad):
    """**Validates: Requirements M4**
    Property 18: Same inputs twice → same ET0 and soil_water.
    (Reset soil_water to same starting point between calls.)
    """
    model_a = ET0Model()
    model_b = ET0Model()
    # Both start at soil_water=0.0 (default)
    a = model_a.step(rain, temp, rh, wind, pressure, rad)
    b = model_b.step(rain, temp, rh, wind, pressure, rad)
    assert a.et0_mm == b.et0_mm, f"ET0 differs: {a.et0_mm} vs {b.et0_mm}"
    assert a.soil_water_mm == b.soil_water_mm, f"soil_water_mm differs: {a.soil_water_mm} vs {b.soil_water_mm}"


# ── Parametrized boundary tests ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "temp,rh,wind,pressure,rad",
    [
        (5.0, 10.0, 0.0, 900.0, 0.0),  # minimum physical values
        (40.0, 100.0, 20.0, 1020.0, 1000.0),  # maximum physical values
        (20.0, 50.0, 2.0, 1013.0, 400.0),  # typical midpoint
    ],
)
def test_et0_boundary(temp, rh, wind, pressure, rad):
    """Boundary: ET0 at physical extremes always in [0, 15]."""
    et0 = ET0Model.et0_fao56(temp, rh, wind, pressure, rad)
    assert 0.0 <= et0 <= 15.0
