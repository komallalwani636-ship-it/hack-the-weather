"""Property-based tests for M3 RadiationCalModel.

Validates: Requirements covering SI1145 → shortwave radiation (W/m²).
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.models.radiation_cal import RadiationCalModel

# ── Generators ───────────────────────────────────────────────────────────────

_vis = st.floats(0, 65535, allow_nan=False, allow_infinity=False)
_ir = st.floats(0, 65535, allow_nan=False, allow_infinity=False)
_uv = st.floats(0, 255, allow_nan=False, allow_infinity=False)

# ── Property 12: Physical Range ───────────────────────────────────────────────


@given(_vis, _ir, _uv)
@settings(max_examples=100)
def test_physical_range(v, i, u):
    """**Validates: Requirements M3**
    Property 12: For any SI1145 inputs (vis 0–65535, IR 0–65535, UV 0–255)
    output ∈ [0.0, 1400.0] W/m² (daylight mode, which enforces the upper bound).
    """
    out = RadiationCalModel().predict(v, i, u, daylight=True)
    assert 0.0 <= out.sw_wm2 <= 1400.0, f"sw_wm2={out.sw_wm2!r} out of [0, 1400] for vis={v}, ir={i}, uv={u}"


# ── Property 13: Non-Negativity (clamping enforced for adversarial inputs) ────


@given(
    st.floats(-1e6, 1e6, allow_nan=False, allow_infinity=False),
    _ir,
    _uv,
)
@settings(max_examples=100)
def test_non_negativity_adversarial(v, i, u):
    """**Validates: Requirements M3**
    Property 13: Output always ≥ 0.0.
    Even with adversarial (negative) intercept and vis values, clamping is enforced.
    """
    model = RadiationCalModel()
    # Force a large negative intercept to exercise the clamping path
    model.intercept = -1_000_000.0
    out = model.predict(v, i, u)
    assert out.sw_wm2 >= 0.0, f"sw_wm2={out.sw_wm2!r} is negative"


# ── Property 14: Monotonic Visible Index ──────────────────────────────────────


@given(_vis, _vis, _ir, _uv)
@settings(max_examples=100)
def test_monotonic_visible(v1, v2, i, u):
    """**Validates: Requirements M3**
    Property 14: Increasing visible index while IR/UV fixed at typical daytime
    values → output does not decrease.
    """
    lo, hi = sorted([v1, v2])
    model = RadiationCalModel()
    # Use daylight=True to keep clamping consistent
    a = model.predict(lo, i, u, daylight=True).sw_wm2
    b = model.predict(hi, i, u, daylight=True).sw_wm2
    assert b + 1e-6 >= a, f"Monotonicity violated: predict({lo}) → {a}, predict({hi}) → {b}"


# ── Parametrized boundary tests ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "vis,ir,uv,daylight",
    [
        (0, 0, 0, True),  # all-zero inputs → 0.0 W/m²
        (65535, 65535, 255, True),  # max inputs, daylight clamped to 1400
        (65535, 65535, 255, False),  # max inputs, no upper clamp
        (0, 0, 0, False),  # all-zero, no-daylight
    ],
)
def test_boundary_inputs(vis, ir, uv, daylight):
    """Boundary: outputs at extreme SI1145 values stay within physical range."""
    model = RadiationCalModel()
    out = model.predict(float(vis), float(ir), float(uv), daylight=daylight)
    assert out.sw_wm2 >= 0.0
    if daylight:
        assert out.sw_wm2 <= 1400.0
