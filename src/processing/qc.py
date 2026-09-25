"""Quality-control module: flag, never drop Bronze records."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import pandas as pd

from src.constants import (
    FLATLINE_COUNT,
    FLATLINE_DELTA,
    RANGE_BOUNDS,
    RAIN_GAUGE_CROSS_MM,
    SENSOR_COLUMNS,
    SPIKE_SIGMA,
    SPIKE_WINDOW_MINUTES,
    TEMP_CROSS_C,
)
from src.paths import SILVER_DIR, ensure_data_dirs

logger = logging.getLogger(__name__)

FLAG_PRIORITY = ["MISSING", "RANGE_FAIL", "CROSS_FAIL", "SPIKE", "FLATLINE", "OK"]


class QCFlag(str, Enum):
    OK = "OK"
    RANGE_FAIL = "RANGE_FAIL"
    SPIKE = "SPIKE"
    FLATLINE = "FLATLINE"
    CROSS_FAIL = "CROSS_FAIL"
    MISSING = "MISSING"


def _rank(flag: str) -> int:
    return FLAG_PRIORITY.index(flag)


def _worse(a: str, b: str) -> str:
    return a if _rank(a) < _rank(b) else b


@dataclass
class BronzeRecord:
    timestamp_utc: datetime
    source: str = "conduit"
    rain_gauge_1_mm: Optional[float] = None
    rain_gauge_2_mm: Optional[float] = None
    temp_bmx_c: Optional[float] = None
    temp_mcp_c: Optional[float] = None
    temp_sht_c: Optional[float] = None
    temp_wetbulb_c: Optional[float] = None
    wbgt_c: Optional[float] = None
    wind_speed_ms: Optional[float] = None
    wind_direction_deg: Optional[float] = None
    wind_gust_ms: Optional[float] = None
    si1145_visible: Optional[float] = None
    si1145_ir: Optional[float] = None
    si1145_uv: Optional[float] = None
    pressure_hpa: Optional[float] = None
    humidity_sht_pct: Optional[float] = None
    raw_payload: dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "BronzeRecord":
        known = {k: data.get(k) for k in cls.__dataclass_fields__ if k != "raw_payload"}
        known["raw_payload"] = data.get("raw_payload") or {}
        if known.get("timestamp_utc") is None:
            known["timestamp_utc"] = datetime.now(tz=timezone.utc)
        if getattr(known["timestamp_utc"], "tzinfo", None) is None:
            known["timestamp_utc"] = known["timestamp_utc"].replace(tzinfo=timezone.utc)
        return cls(**known)


@dataclass
class SilverRecord:
    timestamp_utc: datetime
    source: str
    rain_gauge_1_mm: Optional[float]
    rain_gauge_2_mm: Optional[float]
    temp_bmx_c: Optional[float]
    temp_mcp_c: Optional[float]
    temp_sht_c: Optional[float]
    temp_wetbulb_c: Optional[float]
    wbgt_c: Optional[float]
    wind_speed_ms: Optional[float]
    wind_direction_deg: Optional[float]
    wind_gust_ms: Optional[float]
    si1145_visible: Optional[float]
    si1145_ir: Optional[float]
    si1145_uv: Optional[float]
    pressure_hpa: Optional[float]
    humidity_sht_pct: Optional[float]
    qc_flag: str
    qc_flags_per_sensor: dict[str, str]
    qc_processed_at_utc: datetime

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp_utc": self.timestamp_utc,
            "source": self.source,
            "rain_gauge_1_mm": self.rain_gauge_1_mm,
            "rain_gauge_2_mm": self.rain_gauge_2_mm,
            "temp_bmx_c": self.temp_bmx_c,
            "temp_mcp_c": self.temp_mcp_c,
            "temp_sht_c": self.temp_sht_c,
            "temp_wetbulb_c": self.temp_wetbulb_c,
            "wbgt_c": self.wbgt_c,
            "wind_speed_ms": self.wind_speed_ms,
            "wind_direction_deg": self.wind_direction_deg,
            "wind_gust_ms": self.wind_gust_ms,
            "si1145_visible": self.si1145_visible,
            "si1145_ir": self.si1145_ir,
            "si1145_uv": self.si1145_uv,
            "pressure_hpa": self.pressure_hpa,
            "humidity_sht_pct": self.humidity_sht_pct,
            "qc_flag": self.qc_flag,
            "qc_flags_per_sensor": self.qc_flags_per_sensor,
            "qc_processed_at_utc": self.qc_processed_at_utc,
        }


class QCModule:
    def __init__(self) -> None:
        self._history: list[BronzeRecord] = []
        self._last_batch: list[SilverRecord] = []

    def process(self, record: BronzeRecord) -> SilverRecord:
        if isinstance(record, dict):
            record = BronzeRecord.from_dict(record)
        flags = {col: self._flag_point(col, getattr(record, col, None), record) for col in SENSOR_COLUMNS}
        self._apply_cross_checks(record, flags)
        self._apply_spike_flatline(record, flags)
        overall = "OK"
        for flag in flags.values():
            overall = _worse(overall, flag)
        silver = SilverRecord(
            timestamp_utc=record.timestamp_utc,
            source=record.source,
            rain_gauge_1_mm=record.rain_gauge_1_mm,
            rain_gauge_2_mm=record.rain_gauge_2_mm,
            temp_bmx_c=record.temp_bmx_c,
            temp_mcp_c=record.temp_mcp_c,
            temp_sht_c=record.temp_sht_c,
            temp_wetbulb_c=record.temp_wetbulb_c,
            wbgt_c=record.wbgt_c,
            wind_speed_ms=record.wind_speed_ms,
            wind_direction_deg=record.wind_direction_deg,
            wind_gust_ms=record.wind_gust_ms,
            si1145_visible=record.si1145_visible,
            si1145_ir=record.si1145_ir,
            si1145_uv=record.si1145_uv,
            pressure_hpa=record.pressure_hpa,
            humidity_sht_pct=record.humidity_sht_pct,
            qc_flag=overall,
            qc_flags_per_sensor=flags,
            qc_processed_at_utc=datetime.now(tz=timezone.utc),
        )
        return silver

    def process_batch(self, records: list[BronzeRecord]) -> list[SilverRecord]:
        self._history = list(records)
        out = [self.process(r) for r in records]
        self._last_batch = out
        return out

    def _flag_point(self, column: str, value: Any, record: BronzeRecord) -> str:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return QCFlag.MISSING.value
        bounds = RANGE_BOUNDS.get(column)
        if bounds is not None:
            lo, hi = bounds
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                return QCFlag.RANGE_FAIL.value
            if numeric < lo or numeric > hi:
                return QCFlag.RANGE_FAIL.value
        return QCFlag.OK.value

    def _apply_cross_checks(self, record: BronzeRecord, flags: dict[str, str]) -> None:
        g1, g2 = record.rain_gauge_1_mm, record.rain_gauge_2_mm
        if g1 is not None and g2 is not None:
            if abs(float(g1) - float(g2)) > RAIN_GAUGE_CROSS_MM:
                logger.info(
                    "Rain gauge CROSS_FAIL at %s: %s vs %s",
                    record.timestamp_utc,
                    g1,
                    g2,
                )
                if flags["rain_gauge_1_mm"] not in ("MISSING", "RANGE_FAIL"):
                    flags["rain_gauge_1_mm"] = QCFlag.CROSS_FAIL.value
                if flags["rain_gauge_2_mm"] not in ("MISSING", "RANGE_FAIL"):
                    flags["rain_gauge_2_mm"] = QCFlag.CROSS_FAIL.value
        temps = {
            "temp_bmx_c": record.temp_bmx_c,
            "temp_mcp_c": record.temp_mcp_c,
            "temp_sht_c": record.temp_sht_c,
        }
        available = {k: float(v) for k, v in temps.items() if v is not None}
        if len(available) >= 2:
            vals = list(available.values())
            if max(vals) - min(vals) > TEMP_CROSS_C:
                for key in available:
                    if flags[key] not in ("MISSING", "RANGE_FAIL"):
                        flags[key] = QCFlag.CROSS_FAIL.value

    def _apply_spike_flatline(self, record: BronzeRecord, flags: dict[str, str]) -> None:
        if not self._history:
            return
        ts = pd.Timestamp(record.timestamp_utc)
        window_start = ts - pd.Timedelta(minutes=SPIKE_WINDOW_MINUTES)
        peers = [
            r
            for r in self._history
            if pd.Timestamp(r.timestamp_utc) <= ts and pd.Timestamp(r.timestamp_utc) >= window_start
        ]
        for col in SENSOR_COLUMNS:
            if flags[col] in ("MISSING", "RANGE_FAIL", "CROSS_FAIL"):
                continue
            series = [getattr(r, col) for r in peers if getattr(r, col) is not None]
            value = getattr(record, col)
            if value is None or len(series) < 5:
                continue
            median = float(pd.Series(series).median())
            std = float(pd.Series(series).std(ddof=0) or 0.0)
            if std > 0 and abs(float(value) - median) > SPIKE_SIGMA * std:
                flags[col] = QCFlag.SPIKE.value
                continue
            chronological = sorted(self._history, key=lambda r: r.timestamp_utc)
            vals = [getattr(r, col) for r in chronological if getattr(r, col) is not None]
            if len(vals) >= FLATLINE_COUNT:
                tail = vals[-FLATLINE_COUNT:]
                if max(tail) - min(tail) < FLATLINE_DELTA:
                    # In physical meteorology, rain gauges resting at 0.0 mm during dry weather
                    # or solar pyranometers reading 0 at night are normal physical states, not hardware failures!
                    if col in ("rain_gauge_1_mm", "rain_gauge_2_mm") and max(tail) == 0.0:
                        continue
                    if col.startswith("si1145_") and max(tail) == 0:
                        continue
                    flags[col] = QCFlag.FLATLINE.value

    def report(self, records: list[SilverRecord] | None = None) -> pd.DataFrame:
        batch = records if records is not None else self._last_batch
        rows = []
        for col in SENSOR_COLUMNS:
            counts = {f: 0 for f in FLAG_PRIORITY}
            for rec in batch:
                flag = rec.qc_flags_per_sensor.get(col, rec.qc_flag)
                counts[flag] = counts.get(flag, 0) + 1
            total = max(len(batch), 1)
            rows.append({"sensor": col, **{k: round(100.0 * v / total, 2) for k, v in counts.items()}})
        return pd.DataFrame(rows)

    def write_silver(self, records: list[SilverRecord], filename: str = "silver.parquet") -> None:
        ensure_data_dirs()
        df = pd.DataFrame([r.to_dict() for r in records])
        path = SILVER_DIR / filename
        df.to_parquet(path, index=False)
        logger.info("Wrote %d Silver records to %s", len(df), path)
