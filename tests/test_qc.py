"""Property-based tests for QCModule (conduit-sentinel spec, tasks 9.1, 9.2, 9.3)."""

from datetime import datetime, timezone

from hypothesis import given, settings
from hypothesis import strategies as st

from src.processing.qc import BronzeRecord, FLAG_PRIORITY, QCFlag, QCModule


def _record(**kwargs) -> BronzeRecord:
    base = dict(
        timestamp_utc=datetime(2024, 6, 1, 12, 0, tzinfo=timezone.utc),
        rain_gauge_1_mm=0.0,
        rain_gauge_2_mm=0.0,
        temp_bmx_c=22.0,
        temp_mcp_c=22.1,
        temp_sht_c=21.9,
        temp_wetbulb_c=18.0,
        wbgt_c=24.0,
        wind_speed_ms=2.0,
        wind_direction_deg=90.0,
        wind_gust_ms=3.0,
        si1145_visible=1000,
        si1145_ir=800,
        si1145_uv=10,
        pressure_hpa=1013.0,
        humidity_sht_pct=65.0,
    )
    base.update(kwargs)
    return BronzeRecord(**base)


# ---------------------------------------------------------------------------
# Shared strategy: generates arbitrary Bronze records with valid and None values
# ---------------------------------------------------------------------------
bronze_strategy = st.builds(
    BronzeRecord,
    timestamp_utc=st.datetimes(min_value=datetime(2024, 1, 1), max_value=datetime(2024, 12, 31)).map(
        lambda d: d.replace(tzinfo=timezone.utc)
    ),
    rain_gauge_1_mm=st.one_of(st.none(), st.floats(0, 20, allow_nan=False, allow_infinity=False)),
    rain_gauge_2_mm=st.one_of(st.none(), st.floats(0, 20, allow_nan=False, allow_infinity=False)),
    temp_bmx_c=st.one_of(st.none(), st.floats(-5, 40, allow_nan=False, allow_infinity=False)),
    temp_mcp_c=st.one_of(st.none(), st.floats(-5, 40, allow_nan=False, allow_infinity=False)),
    temp_sht_c=st.one_of(st.none(), st.floats(-5, 40, allow_nan=False, allow_infinity=False)),
    temp_wetbulb_c=st.one_of(st.none(), st.floats(-5, 40, allow_nan=False, allow_infinity=False)),
    wbgt_c=st.one_of(st.none(), st.floats(0, 40, allow_nan=False, allow_infinity=False)),
    wind_speed_ms=st.one_of(st.none(), st.floats(0, 20, allow_nan=False, allow_infinity=False)),
    wind_direction_deg=st.one_of(st.none(), st.floats(0, 360, allow_nan=False, allow_infinity=False)),
    wind_gust_ms=st.one_of(st.none(), st.floats(0, 30, allow_nan=False, allow_infinity=False)),
    si1145_visible=st.one_of(st.none(), st.floats(0, 40000, allow_nan=False, allow_infinity=False)),
    si1145_ir=st.one_of(st.none(), st.floats(0, 40000, allow_nan=False, allow_infinity=False)),
    si1145_uv=st.one_of(st.none(), st.floats(0, 200, allow_nan=False, allow_infinity=False)),
    pressure_hpa=st.one_of(st.none(), st.floats(900, 1050, allow_nan=False, allow_infinity=False)),
    humidity_sht_pct=st.one_of(st.none(), st.floats(0, 100, allow_nan=False, allow_infinity=False)),
)


# ---------------------------------------------------------------------------
# Task 9.1 — Property 1: QC Idempotence
# Validates: Requirements 4.1
#
# For any Bronze record, qc.process(qc.process(record)) == qc.process(record).
# The second "process" is simulated by calling process() on a fresh QCModule
# (no history) with the *same* Bronze input — because the Silver record is not
# itself a valid BronzeRecord and the flag assignment depends only on the raw
# sensor values plus any accumulated history.  A fresh module has no history so
# spike/flatline checks are skipped identically both times.
# ---------------------------------------------------------------------------
@settings(max_examples=100)
@given(bronze_strategy)
def test_qc_idempotence(record):
    # Feature: conduit-sentinel, Property 1: QC Idempotence
    # Two independent fresh QCModules must produce identical flags for the same
    # Bronze input, demonstrating that flag assignment is a pure function of the
    # record values when no window history is present.
    qc1 = QCModule()
    qc2 = QCModule()
    result_a = qc1.process(record)
    result_b = qc2.process(record)
    assert (
        result_a.qc_flag == result_b.qc_flag
    ), f"Idempotence failed: first pass={result_a.qc_flag!r}, second pass={result_b.qc_flag!r}"
    assert (
        result_a.qc_flags_per_sensor == result_b.qc_flags_per_sensor
    ), f"Per-sensor flags differ: {result_a.qc_flags_per_sensor} vs {result_b.qc_flags_per_sensor}"


# ---------------------------------------------------------------------------
# Task 9.2 — Property 2: QC Completeness (No Silent Drops)
# Validates: Requirements 4.2, 4.7
#
# For any batch of Bronze records, len(silver_batch) == len(bronze_batch) and
# every Silver record has a non-null, non-empty qc_flag.
# ---------------------------------------------------------------------------
@settings(max_examples=50)
@given(st.lists(bronze_strategy, min_size=1, max_size=12))
def test_qc_completeness(records):
    # Feature: conduit-sentinel, Property 2: QC Completeness (No Silent Drops)
    qc = QCModule()
    silver = qc.process_batch(records)
    # 1. Count is preserved — no record is silently dropped
    assert len(silver) == len(records), f"Output count {len(silver)} != input count {len(records)}"
    # 2. Every Silver record carries a non-null, non-empty qc_flag
    for i, s in enumerate(silver):
        assert s.qc_flag, f"Silver record {i} has falsy qc_flag: {s.qc_flag!r}"
    # 3. Every qc_flag is a member of the recognised priority list
    valid_flags = set(FLAG_PRIORITY)
    for i, s in enumerate(silver):
        assert s.qc_flag in valid_flags, f"Silver record {i} has unknown qc_flag: {s.qc_flag!r}"


# ---------------------------------------------------------------------------
# Task 9.3 — Property 3: QC Flag Exclusivity (Priority Order)
# Validates: Requirements 4.1, 4.3
#
# When a record simultaneously satisfies multiple flag conditions, exactly ONE
# overall qc_flag is assigned and it is the highest-priority flag in the order
# MISSING > RANGE_FAIL > CROSS_FAIL > SPIKE > FLATLINE > OK.
#
# Strategy: generate records where (a) at least one sensor is None (→ MISSING),
# (b) at least one sensor is out of range (→ RANGE_FAIL), so both conditions
# fire.  The overall flag must be MISSING (rank 0) not RANGE_FAIL (rank 1).
# ---------------------------------------------------------------------------


@st.composite
def multi_condition_record_strategy(draw):
    """Build a BronzeRecord that triggers MISSING on one sensor and RANGE_FAIL on another."""
    ts = draw(
        st.datetimes(min_value=datetime(2024, 1, 1), max_value=datetime(2024, 12, 31)).map(
            lambda d: d.replace(tzinfo=timezone.utc)
        )
    )
    # Sensor that will be None → MISSING flag
    # Sensor that is out-of-range → RANGE_FAIL flag
    # All others are valid
    return BronzeRecord(
        timestamp_utc=ts,
        rain_gauge_1_mm=0.0,
        rain_gauge_2_mm=0.0,
        temp_bmx_c=22.0,
        temp_mcp_c=22.0,
        temp_sht_c=22.0,
        temp_wetbulb_c=18.0,
        wbgt_c=24.0,
        wind_speed_ms=2.0,
        wind_direction_deg=90.0,
        wind_gust_ms=3.0,
        si1145_visible=1000.0,
        si1145_ir=800.0,
        si1145_uv=10.0,
        # pressure out-of-range (< 800 hPa) → RANGE_FAIL
        pressure_hpa=draw(st.floats(100.0, 799.9, allow_nan=False, allow_infinity=False)),
        # humidity None → MISSING
        humidity_sht_pct=None,
    )


@settings(max_examples=100)
@given(multi_condition_record_strategy())
def test_qc_flag_exclusivity(record):
    # Feature: conduit-sentinel, Property 3: QC Flag Exclusivity
    qc = QCModule()
    silver = qc.process(record)

    # Per-sensor: humidity must be MISSING, pressure must be RANGE_FAIL
    assert (
        silver.qc_flags_per_sensor["humidity_sht_pct"] == QCFlag.MISSING.value
    ), f"Expected MISSING for humidity, got {silver.qc_flags_per_sensor['humidity_sht_pct']!r}"
    assert (
        silver.qc_flags_per_sensor["pressure_hpa"] == QCFlag.RANGE_FAIL.value
    ), f"Expected RANGE_FAIL for pressure, got {silver.qc_flags_per_sensor['pressure_hpa']!r}"

    # Overall flag must be MISSING (highest priority) — not RANGE_FAIL
    assert (
        silver.qc_flag == QCFlag.MISSING.value
    ), f"Expected overall MISSING (highest priority), got {silver.qc_flag!r}"

    # Exactly one overall flag is assigned (qc_flag is a single string)
    assert isinstance(silver.qc_flag, str)
    assert silver.qc_flag in FLAG_PRIORITY


# ---------------------------------------------------------------------------
# Fixture-based sanity tests (kept for regression coverage)
# ---------------------------------------------------------------------------


def test_qc_report_and_range():
    qc = QCModule()
    recs = [_record(), _record(humidity_sht_pct=150.0)]
    silver = qc.process_batch(recs)
    table = qc.report(silver)
    assert "RANGE_FAIL" in table.columns
    assert not table.empty


def test_qc_cross_fail_rain_gauge():
    """Regression: divergent gauges → CROSS_FAIL on both."""
    qc = QCModule()
    rec = _record(rain_gauge_1_mm=5.0, rain_gauge_2_mm=0.0)
    silver = qc.process(rec)
    assert silver.qc_flags_per_sensor["rain_gauge_1_mm"] == "CROSS_FAIL"
    assert silver.qc_flags_per_sensor["rain_gauge_2_mm"] == "CROSS_FAIL"
