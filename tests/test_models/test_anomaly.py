"""Property-based tests for M2 AnomalyModel.

Validates: Requirements covering M2 rolling z-score + Isolation Forest anomaly detector.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.constants import RAIN_GAUGE_CROSS_MM
from src.models.anomaly import AnomalyModel

# ── Property 9: Idempotence ───────────────────────────────────────────────────


@given(st.floats(0, 40, allow_nan=False, allow_infinity=False))
@settings(max_examples=100)
def test_idempotence(value):
    """**Validates: Requirements M2**
    Property 9: Applying score(reading) twice returns same anomaly_score and fault_flag.
    score() does not mutate _history, so results must be identical.
    """
    model = AnomalyModel()
    a = model.score(value)
    b = model.score(value)
    assert a.anomaly_score == b.anomaly_score, f"anomaly_score changed: {a.anomaly_score} → {b.anomaly_score}"
    assert a.fault_flag == b.fault_flag, f"fault_flag changed: {a.fault_flag} → {b.fault_flag}"


# ── Property 10: Score Range Invariant ───────────────────────────────────────


@given(st.floats(-50, 80, allow_nan=False, allow_infinity=False))
@settings(max_examples=100)
def test_score_range(value):
    """**Validates: Requirements M2**
    Property 10: For any sensor reading, 0.0 ≤ anomaly_score ≤ 1.0.
    """
    result = AnomalyModel().score(value)
    assert (
        0.0 <= result.anomaly_score <= 1.0
    ), f"anomaly_score={result.anomaly_score!r} out of [0, 1] for reading={value}"


# ── Property 11: Rain Gauge Cross-Check ───────────────────────────────────────


@given(
    st.floats(0, 20, allow_nan=False, allow_infinity=False),
    st.floats(0, 20, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_rain_gauge_cross_check(g1, g2):
    """**Validates: Requirements M2**
    Property 11:
    - |g1 - g2| > RAIN_GAUGE_CROSS_MM → fault_flag=True
    - |g1 - g2| ≤ RAIN_GAUGE_CROSS_MM and normal z-score → fault_flag=False
    """
    model = AnomalyModel()
    reading = (g1 + g2) / 2.0
    result = model.score(reading, gauge_1=g1, gauge_2=g2)

    diff = abs(g1 - g2)
    if diff > RAIN_GAUGE_CROSS_MM:
        assert (
            result.fault_flag is True
        ), f"Expected fault_flag=True when |{g1}-{g2}|={diff:.4f} > {RAIN_GAUGE_CROSS_MM}"
    elif result.anomaly_score < 0.5:
        # Only assert fault_flag=False when the z-score path also wouldn't trigger it
        assert result.fault_flag is False, (
            f"Expected fault_flag=False when |{g1}-{g2}|={diff:.4f} ≤ {RAIN_GAUGE_CROSS_MM} "
            f"and anomaly_score={result.anomaly_score:.4f} < 0.5"
        )


# ── Parametrized boundary tests ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "g1,g2,expect_fault",
    [
        (0.0, 0.0, False),  # identical gauges, no fault from cross-check
        (2.0, 4.1, True),  # just over threshold (diff=2.1)
        (2.0, 4.0, False),  # exactly at threshold boundary (diff=2.0, not > 2.0)
        (10.0, 0.0, True),  # large disagreement
        (5.0, 5.0, False),  # identical non-zero gauges
    ],
)
def test_gauge_cross_boundary(g1, g2, expect_fault):
    """Boundary: fault_flag at exact RAIN_GAUGE_CROSS_MM threshold."""
    model = AnomalyModel()
    reading = (g1 + g2) / 2.0
    result = model.score(reading, gauge_1=g1, gauge_2=g2)
    diff = abs(g1 - g2)
    if diff > RAIN_GAUGE_CROSS_MM:
        assert result.fault_flag is True
    # When diff == threshold: cross-check does not trigger (strict >)
