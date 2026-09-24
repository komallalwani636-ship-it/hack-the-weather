"""Property-based tests for M5 HeatStressModel.

Validates: Requirements covering WBGT heat-stress classification (ISO 7933 adapted).
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.models.heat import LEVEL_ORDER, LEVELS, HeatStressModel

# ── Property 19: Threshold Boundary Coverage (exactly one level returned) ────


@given(st.floats(-5, 55, allow_nan=False, allow_infinity=False))
@settings(max_examples=100)
def test_threshold_coverage(wbgt):
    """**Validates: Requirements M5**
    Property 19: For any WBGT float (including exact boundaries 28.0, 32.0, 35.0),
    exactly one of Low/Moderate/High/Extreme is returned.
    """
    level = HeatStressModel.classify(wbgt)
    assert level in LEVELS, f"classify({wbgt}) returned unknown level {level!r}"
    # Verify exactly-one: every other LEVELS entry is different (classify is deterministic)
    count = sum(1 for lv in LEVELS if lv == level)
    assert count == 1  # LEVELS list has no duplicates


@pytest.mark.parametrize(
    "wbgt,expected",
    [
        (27.999, "Low"),
        (28.0, "Moderate"),  # exact boundary
        (31.999, "Moderate"),
        (32.0, "High"),  # exact boundary
        (34.999, "High"),
        (35.0, "Extreme"),  # exact boundary
        (-5.0, "Low"),  # minimum WBGT
        (55.0, "Extreme"),  # maximum WBGT
    ],
)
def test_exact_boundary_classification(wbgt, expected):
    """Parametrized boundary: exact threshold values map to correct levels."""
    assert HeatStressModel.classify(wbgt) == expected


# ── Property 20: Monotonic Risk ───────────────────────────────────────────────


@given(
    st.floats(-5, 54, allow_nan=False, allow_infinity=False),
    st.floats(0.01, 5, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_monotonic_risk(w1, delta):
    """**Validates: Requirements M5**
    Property 20: For w1 < w2, risk(w2) >= risk(w1) under
    Low < Moderate < High < Extreme ordering.
    """
    w2 = min(w1 + delta, 55.0)
    level_1 = HeatStressModel.classify(w1)
    level_2 = HeatStressModel.classify(w2)
    assert LEVEL_ORDER[level_2] >= LEVEL_ORDER[level_1], (
        f"Monotonicity violated: classify({w1})={level_1} "
        f"(order {LEVEL_ORDER[level_1]}) > classify({w2})={level_2} "
        f"(order {LEVEL_ORDER[level_2]})"
    )


# ── Property 21: Estimated WBGT Bounds ───────────────────────────────────────


@given(
    st.floats(0, 50, allow_nan=False, allow_infinity=False),
    st.floats(0, 100, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_estimated_wbgt_bounds(temp, rh):
    """**Validates: Requirements M5**
    Property 21: For temp 0–50°C and RH 0–100%, estimated WBGT ∈ [-5, 55]°C.
    """
    value = HeatStressModel.estimated_wbgt(temp, rh)
    assert -5.0 <= value <= 55.0, f"estimated_wbgt({temp}, {rh}) = {value!r} out of [-5, 55]"


# ── Parametrized boundary tests ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "temp,rh",
    [
        (0.0, 0.0),  # minimum temp and RH
        (50.0, 100.0),  # maximum temp and RH
        (35.0, 80.0),  # typical hot humid day
        (20.0, 50.0),  # moderate conditions
    ],
)
def test_estimated_wbgt_boundary(temp, rh):
    """Boundary: estimated WBGT stays within physical clamp bounds."""
    value = HeatStressModel.estimated_wbgt(temp, rh)
    assert -5.0 <= value <= 55.0
