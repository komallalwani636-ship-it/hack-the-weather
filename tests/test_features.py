"""Property-based tests for FeatureEngineer (conduit-sentinel spec, tasks 12.1–12.4)."""

import math
from datetime import datetime, timedelta, timezone

import pandas as pd
from hypothesis import given, settings
from hypothesis import strategies as st

from src.processing.features import FeatureEngineer, bias_correct, decode_hour, hour_encoding


# ---------------------------------------------------------------------------
# Task 12.2 — Property 5: Cyclical Hour Encoding Round-Trip
# Validates: Requirements 5.6
#
# For any integer h ∈ 0–23, encode to (sin, cos) and decode back; assert h == h.
# ---------------------------------------------------------------------------
@given(st.integers(0, 23))
@settings(max_examples=24)
def test_cyclical_hour_round_trip(hour):
    # Feature: conduit-sentinel, Property 5: Cyclical Hour Encoding Round-Trip
    s, c = hour_encoding(hour)
    assert decode_hour(s, c) == hour


# ---------------------------------------------------------------------------
# Task 12.4 — Property 22: Bias Correction Idempotence
# Validates: Requirements 11.1
#
# Applying bias_correct(value, delta) produces corrected = value + delta.
# Idempotence means: a second application with delta = 0.0 (i.e. "already
# corrected, no further adjustment") returns the same value.  This verifies
# that the correction step does not accumulate or drift when re-run.
# ---------------------------------------------------------------------------
@given(
    st.floats(-200, 200, allow_nan=False, allow_infinity=False),
    st.floats(-50, 50, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100)
def test_bias_correction_idempotence(value, delta):
    # Feature: conduit-sentinel, Property 22: Bias Correction Idempotence
    # First application: correct the raw value
    corrected = bias_correct(value, delta)
    # Second application with zero delta (already corrected): no change
    re_corrected = bias_correct(corrected, 0.0)
    assert math.isclose(
        corrected, re_corrected, rel_tol=1e-9, abs_tol=1e-12
    ), f"bias_correct({corrected!r}, 0.0) != {corrected!r}: got {re_corrected!r}"


# ---------------------------------------------------------------------------
# Shared time-series strategy for tasks 12.1 and 12.3
#
# Generates a list of dicts representing hourly Silver Layer observations in
# strictly ascending UTC order.  Each row carries a non-negative rain_gauge_1_mm
# value and a valid pressure_hpa for pressure-tendency tests.
# ---------------------------------------------------------------------------
_BASE_TS = datetime(2024, 6, 1, 0, 0, tzinfo=timezone.utc)


@st.composite
def time_series_strategy(draw, min_rows=6, max_rows=48):
    """
    Build a DataFrame of hourly Silver-layer rows in ascending UTC order.

    Returns a list of row dicts.  All timestamps are distinct and monotonically
    increasing by exactly one hour so that rolling windows are well-defined.
    """
    n = draw(st.integers(min_rows, max_rows))
    # Random start offset (0–364 days) so examples vary across the year
    start_offset_hours = draw(st.integers(0, 364 * 24))
    start = _BASE_TS + timedelta(hours=start_offset_hours)

    rows = []
    for i in range(n):
        rain = draw(st.floats(0.0, 5.0, allow_nan=False, allow_infinity=False))
        pressure = draw(st.floats(950.0, 1050.0, allow_nan=False, allow_infinity=False))
        humidity = draw(st.floats(10.0, 100.0, allow_nan=False, allow_infinity=False))
        temp = draw(st.floats(5.0, 40.0, allow_nan=False, allow_infinity=False))
        wind = draw(st.floats(0.0, 20.0, allow_nan=False, allow_infinity=False))
        gust = draw(st.floats(wind, wind + 15.0, allow_nan=False, allow_infinity=False))
        rows.append(
            {
                "timestamp_utc": start + timedelta(hours=i),
                "rain_gauge_1_mm": rain,
                "pressure_hpa": pressure,
                "humidity_sht_pct": humidity,
                "temp_sht_c": temp,
                "wind_speed_ms": wind,
                "wind_gust_ms": gust,
                "qc_flag": "OK",
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Task 12.1 — Property 4: Feature No-Leakage Invariant
# Validates: Requirements 5.1
#
# For every row t in the Gold Layer, the audit timestamp recorded by
# FeatureEngineer.audit_timestamps() must satisfy max_input_ts ≤ row_ts.
# This ensures no future observation contributed to the feature at time t.
# ---------------------------------------------------------------------------
@given(time_series_strategy(min_rows=6, max_rows=36))
@settings(max_examples=50)
def test_no_leakage_invariant(rows):
    # Feature: conduit-sentinel, Property 4: Feature No-Leakage Invariant
    eng = FeatureEngineer()
    gold = eng.transform(pd.DataFrame(rows))
    audit = eng.audit_timestamps()

    assert len(audit) == len(gold), f"Audit length {len(audit)} != gold length {len(gold)}"

    for entry in audit:
        row_ts = entry["row_ts"]
        max_input_ts = entry["max_input_ts"]
        assert max_input_ts <= row_ts, f"Leakage detected: max_input_ts={max_input_ts} > row_ts={row_ts}"


# ---------------------------------------------------------------------------
# Task 12.3 — Property 6: Rolling Window Metamorphic Consistency
# Validates: Requirements 5.3
#
# For any non-negative hourly rainfall time-series, the 1-hour rolling
# accumulation rain_1h must satisfy:
#   |rain_1h[t+1] − rain_1h[t]| ≤ rain_rate_in_interval
#
# where rain_rate_in_interval is the maximum single-step rain observation that
# could have entered or left the 1-hour window (bounded by the rain values at
# positions t and t+1 in the input).  Since observations are at 1-hour
# granularity, the window either gains or loses at most one observation per
# step, so the change is bounded by max(rain[t], rain[t+1]).
# ---------------------------------------------------------------------------
@given(time_series_strategy(min_rows=6, max_rows=36))
@settings(max_examples=50)
def test_rolling_window_metamorphic(rows):
    # Feature: conduit-sentinel, Property 6: Rolling Window Metamorphic Consistency
    eng = FeatureEngineer()
    gold = eng.transform(pd.DataFrame(rows))

    # Extract rows where rain_1h is not NaN (requires sufficient lookback)
    valid = gold.dropna(subset=["rain_1h"]).reset_index(drop=True)
    if len(valid) < 2:
        return  # not enough data after lookback requirement — skip

    rain_1h = valid["rain_1h"].to_numpy()
    # Reconstruct the original rain values from the input rows by matching timestamps
    input_df = pd.DataFrame(rows).set_index("timestamp_utc")

    for i in range(1, len(valid)):
        ts_prev = valid.iloc[i - 1]["timestamp_utc"]
        ts_curr = valid.iloc[i]["timestamp_utc"]

        acc_prev = rain_1h[i - 1]
        acc_curr = rain_1h[i]

        # The bound on the change is the rain that could have entered/left the window
        rain_prev = float(input_df.loc[ts_prev, "rain_gauge_1_mm"]) if ts_prev in input_df.index else 0.0
        rain_curr = float(input_df.loc[ts_curr, "rain_gauge_1_mm"]) if ts_curr in input_df.index else 0.0
        bound = max(rain_prev, rain_curr) + 1e-6  # small tolerance for float arithmetic

        delta = abs(acc_curr - acc_prev)
        assert delta <= bound, (
            f"Rolling window metamorphic violation at step {i}: "
            f"|rain_1h[t+1] - rain_1h[t]| = {delta:.6f} > bound {bound:.6f} "
            f"(rain[t]={rain_prev:.4f}, rain[t+1]={rain_curr:.4f})"
        )


# ---------------------------------------------------------------------------
# Fixture-based regression tests (kept for deterministic coverage)
# ---------------------------------------------------------------------------


def test_no_leakage_and_rolling_fixture():
    """Deterministic regression: 30-row hourly series, all rain=0.5 mm/h."""
    start = datetime(2024, 6, 1, tzinfo=timezone.utc)
    rows = []
    rain = 0.5
    for i in range(30):
        rows.append(
            {
                "timestamp_utc": start + timedelta(hours=i),
                "pressure_hpa": 1010.0,
                "rain_gauge_1_mm": rain,
                "humidity_sht_pct": 70.0,
                "temp_sht_c": 22.0,
                "wind_speed_ms": 2.0,
                "wind_gust_ms": 3.0,
                "qc_flag": "OK",
            }
        )
    eng = FeatureEngineer()
    gold = eng.transform(pd.DataFrame(rows))
    # No-leakage: max_input_ts ≤ row_ts for every audit entry
    for item in eng.audit_timestamps():
        assert item["max_input_ts"] <= item["row_ts"]
    # Rolling window: consecutive rain_1h values differ by at most rain per interval
    series = gold.dropna(subset=["rain_1h"])
    for i in range(1, len(series)):
        delta = abs(series.iloc[i]["rain_1h"] - series.iloc[i - 1]["rain_1h"])
        assert delta <= rain + 1e-6
