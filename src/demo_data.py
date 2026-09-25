"""Deterministic, labelled demo snapshot used when live Parquet is empty.

Values are generated from a climatological JKUAT diurnal cycle and marked
`data_source = "demo_climatology"` so they are never presented as live Conduit data.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from src.processing.features import FeatureEngineer
from src.processing.qc import BronzeRecord, QCModule


def build_demo_silver(hours: int = 12, now: datetime | None = None) -> pd.DataFrame:
    now = now or datetime.now(tz=timezone.utc)
    rows = []
    for i in range(hours * 12):
        ts = now - timedelta(minutes=5 * (hours * 12 - i))
        hour = ts.hour + ts.minute / 60.0
        temp = 18.0 + 7.0 * np.sin((hour - 8) / 24 * 2 * np.pi)
        rh = float(np.clip(80 - 1.5 * (temp - 18), 40, 95))
        rain = 0.4 if 15 <= ts.hour <= 17 else 0.0
        rec = BronzeRecord(
            timestamp_utc=ts,
            source="demo_climatology",
            rain_gauge_1_mm=rain,
            rain_gauge_2_mm=rain,
            temp_bmx_c=temp,
            temp_mcp_c=temp + 0.2,
            temp_sht_c=temp - 0.1,
            temp_wetbulb_c=temp - 2.0,
            wbgt_c=temp + 2.0,
            wind_speed_ms=round(2.0 + 1.1 * max(0, np.sin((hour - 8) / 14 * np.pi)) + 0.2 * np.cos(i * 0.5), 1),
            wind_direction_deg=round(115.0 + 15.0 * np.sin(i * 0.3), 1),
            wind_gust_ms=round(3.5 + 1.4 * max(0, np.sin((hour - 8) / 14 * np.pi)) + 0.2 * np.cos(i * 0.4), 1),
            si1145_visible=int(max(0, 40000 * max(0, np.sin((hour - 6) / 12 * np.pi)))),
            si1145_ir=int(max(0, 30000 * max(0, np.sin((hour - 6) / 12 * np.pi)))),
            si1145_uv=int(max(0, 180 * max(0, np.sin((hour - 6) / 12 * np.pi)))),
            pressure_hpa=1012.0 - 0.3 * (hour - 12) / 12,
            humidity_sht_pct=rh,
        )
        rows.append(rec)
    qc = QCModule()
    silver = qc.process_batch(rows)
    df = pd.DataFrame([s.to_dict() for s in silver])
    df["data_source"] = "demo_climatology"
    return df


def build_demo_gold(silver: pd.DataFrame | None = None) -> pd.DataFrame:
    silver = silver if silver is not None else build_demo_silver()
    om = pd.DataFrame(
        {
            "timestamp_utc": silver["timestamp_utc"],
            "om_temp": silver["temp_sht_c"] + 0.8,
            "om_rh": silver["humidity_sht_pct"] - 1.5,
            "om_precip_prob": np.where(silver["rain_gauge_1_mm"] > 0, 60.0, 10.0),
            "om_sw_rad": silver["si1145_visible"] * (800 / 65535),
            "om_wind": silver["wind_speed_ms"],
            "om_precip": silver["rain_gauge_1_mm"],
        }
    )
    gold = FeatureEngineer().transform(silver, om)
    gold["data_source"] = "demo_climatology"
    return gold
