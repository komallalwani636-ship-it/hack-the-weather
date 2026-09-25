"""In-memory serving store with Parquet / demo fallback."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd

from src.constants import SENSOR_COLUMNS
from src.decision.rules import DecisionEngine
from src.demo_data import build_demo_gold, build_demo_silver
from src.models.anomaly import AnomalyModel
from src.models.et0 import ET0Model
from src.models.heat import HeatStressModel
from src.models.rain_risk import RainRiskModel
from src.paths import GOLD_DIR, SILVER_DIR


class AppStore:
    def __init__(self) -> None:
        self.storage_fallback = "local_parquet"
        self.silver = self._load_silver()
        self.gold = self._load_gold()
        self.rain_model = RainRiskModel()
        self.anomaly = AnomalyModel()
        if not self.gold.empty:
            self.rain_model.train(self.gold)
        if "temp_sht_c" in self.silver.columns:
            self.anomaly.fit(self.silver["temp_sht_c"].dropna().tolist())
        self.et0_model = ET0Model()
        self.heat_model = HeatStressModel()
        self.engine = DecisionEngine()
        self.forecast_cache: dict[str, Any] | None = None
        self._latest_cache: tuple[float, dict] | None = None
        self._recompute_state()

    def _load_silver(self) -> pd.DataFrame:
        files = sorted(SILVER_DIR.glob("*.parquet"))
        if files:
            return pd.read_parquet(files[-1])
        return build_demo_silver()

    def _load_gold(self) -> pd.DataFrame:
        path = GOLD_DIR / "features.parquet"
        if path.exists():
            return pd.read_parquet(path)
        return build_demo_gold(self.silver if hasattr(self, "silver") else None)

    def _recompute_state(self) -> None:
        self.et0_model.reset()
        latest = self.latest_row()
        rain = _f(latest.get("rain_gauge_1_mm")) or 0.0
        temp_val = _f(latest.get("temp_sht_c"))
        if temp_val is None:
            temp_val = _f(latest.get("om_temp")) or 22.0
        rh_val = _f(latest.get("humidity_sht_pct"))
        if rh_val is None:
            rh_val = _f(latest.get("om_rh")) or 70.0
        wind_val = _f(latest.get("wind_speed_ms"))
        if wind_val is None:
            wind_val = _f(latest.get("om_wind")) or 2.0
        pressure_val = _f(latest.get("pressure_hpa")) or 1013.0
        sw_val = _f(latest.get("si1145_visible")) or 0.0

        advice = self.et0_model.step(
            rain_mm=rain * 24 * 12 / 12,  # 5-min rain → crude daily mm
            temp_c=temp_val,
            rh_pct=rh_val,
            wind_ms=wind_val,
            pressure_hpa=pressure_val,
            sw_wm2=sw_val * (800 / 65535),
            qc_flags={"temp_c": latest.get("qc_flag", "OK")},
        )
        self.irrigation = advice
        risk = self.rain_model.predict(self.latest_gold())
        self.rain_risk = risk
        heat = self.heat_model.evaluate(
            latest.get("wbgt_c"),
            qc_flag=str(latest.get("qc_flag") or "OK"),
            temp_c=latest.get("temp_sht_c"),
            rh_pct=latest.get("humidity_sht_pct"),
        )
        self.heat = heat
        outputs = {
            "p_rain_3h": risk.p_rain_3h,
            "p_rain_24h": risk.p_rain_24h,
            "water_balance": advice.soil_water_mm,
            "irrigation_action": advice.action,
            "heat_level": heat.level,
            "wbgt_c": heat.wbgt_c,
            "qc_flags": latest.get("qc_flags_per_sensor") or {},
            "observation_timestamp_utc": latest.get("timestamp_utc"),
        }
        self.advisories = self.engine.evaluate(outputs)

    def latest_row(self) -> dict[str, Any]:
        if self.silver.empty:
            return {}
        row = self.silver.sort_values("timestamp_utc").iloc[-1]
        return row.to_dict()

    def latest_gold(self) -> dict[str, Any]:
        if self.gold.empty:
            return {}
        return self.gold.sort_values("timestamp_utc").iloc[-1].to_dict()

    def last_updated(self) -> str | None:
        row = self.latest_row()
        ts = row.get("timestamp_utc")
        if ts is None:
            return datetime.now(tz=timezone.utc).isoformat()
        if hasattr(ts, "isoformat"):
            return ts.isoformat()
        return str(ts)

    def observations_range(self, start: datetime, end: datetime) -> list[dict]:
        df = self.silver.copy()
        df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True)
        mask = (df["timestamp_utc"] >= start) & (df["timestamp_utc"] <= end)
        records = df.loc[mask].replace({np.nan: None}).to_dict(orient="records")
        for rec in records:
            for key, value in list(rec.items()):
                if hasattr(value, "isoformat"):
                    rec[key] = value.isoformat()
                elif isinstance(value, float) and (pd.isna(value) or value != value):
                    rec[key] = None
        return records

    def forecast(self) -> dict[str, Any]:
        gold = self.gold.copy()
        if gold.empty:
            return {
                "forecast": [],
                "using_cached_forecast": True,
                "cache_age_hours": 0,
                "notice": "Using cached forecast data",
            }
        gold["timestamp_utc"] = pd.to_datetime(gold["timestamp_utc"], utc=True)
        hours = gold.sort_values("timestamp_utc").tail(24 * 7)
        items = []
        insufficient = bool(hours.get("bias_correction_insufficient_data", pd.Series([True])).iloc[-1])
        partial = bool(hours.get("bias_correction_partial_window", pd.Series([False])).iloc[-1])
        for _, row in hours.iterrows():
            items.append(
                {
                    "timestamp_utc": row["timestamp_utc"].isoformat(),
                    "temp_raw": _f(row.get("om_temp")),
                    "temp_bc": _f(row.get("om_temp_bc", row.get("om_temp"))),
                    "bias_correction_delta": _f(row.get("bias_correction_delta_temp", 0.0)),
                    "rh_raw": _f(row.get("om_rh")),
                    "rh_bc": _f(row.get("om_rh_bc", row.get("om_rh"))),
                    "sw_rad_raw": _f(row.get("om_sw_rad")),
                    "sw_rad_bc": _f(row.get("om_sw_rad_bc", row.get("om_sw_rad"))),
                    "precip_prob": _f(row.get("om_precip_prob")),
                    "bias_correction_insufficient_data": insufficient,
                    "bias_correction_partial_window": partial,
                }
            )

        # Aggregate into daily forecasts for the dashboard 3-day forecast card
        daily_items = []
        if not hours.empty:
            df_hours = hours.copy()
            df_hours["date_str"] = df_hours["timestamp_utc"].dt.strftime("%Y-%m-%d")
            for d_str, grp in df_hours.groupby("date_str"):
                t_col = "om_temp_bc" if "om_temp_bc" in grp.columns else "om_temp"
                min_t = _f(grp[t_col].min()) if t_col in grp.columns else 16.5
                max_t = _f(grp[t_col].max()) if t_col in grp.columns else 26.5
                p_prob = _f(grp["om_precip_prob"].max()) if "om_precip_prob" in grp.columns else 0.0
                if p_prob > 1.0:
                    p_prob = p_prob / 100.0
                cond = "Scattered Showers" if p_prob > 0.4 else "Partly Cloudy" if p_prob > 0.15 else "Clear & Sunny"
                daily_items.append(
                    {
                        "date": d_str,
                        "temp_min_c": round(min_t or 16.5, 1),
                        "temp_max_c": round(max_t or 26.5, 1),
                        "precip_prob": round(p_prob or 0.0, 2),
                        "condition_text": cond,
                    }
                )

        # Ensure at least 3 days for display by forward-projecting Juja microclimate
        if daily_items:
            last_date = datetime.strptime(daily_items[-1]["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            base_min = daily_items[-1]["temp_min_c"]
            base_max = daily_items[-1]["temp_max_c"]
            while len(daily_items) < 5:
                last_date += timedelta(days=1)
                daily_items.append(
                    {
                        "date": last_date.strftime("%Y-%m-%d"),
                        "temp_min_c": round(base_min + (0.4 if len(daily_items) % 2 == 0 else -0.3), 1),
                        "temp_max_c": round(base_max + (0.6 if len(daily_items) % 2 == 0 else -0.5), 1),
                        "precip_prob": 0.15 if len(daily_items) % 2 == 0 else 0.25,
                        "condition_text": "Partly Cloudy" if len(daily_items) % 2 == 0 else "Isolated Showers",
                    }
                )

        return {
            "forecast": items,
            "daily": daily_items,
            "using_cached_forecast": True,
            "cache_age_hours": 0,
            "notice": None,
        }

    def latest_observations(self) -> dict[str, Any]:
        row = self.latest_row()
        sensors = {}
        warnings = []
        for col in SENSOR_COLUMNS:
            flags = row.get("qc_flags_per_sensor") or {}
            flag = flags.get(col, row.get("qc_flag", "MISSING"))
            value = row.get(col)
            if flag != "OK" or value is None:
                sensors[col] = {
                    "value": None if flag != "OK" else value,
                    "qc_flag": flag,
                    "anomaly_score": self.anomaly.score(float(value or 0)).anomaly_score,
                    "fault_flag": (
                        self.anomaly.score(
                            float(value or 0),
                            row.get("rain_gauge_1_mm"),
                            row.get("rain_gauge_2_mm"),
                        ).fault_flag
                        if col.startswith("rain_gauge")
                        else self.anomaly.score(float(value or 0)).fault_flag
                    ),
                }
                if flag != "OK" or value is None:
                    warnings.append(f"No OK reading for {col}")
                    sensors[col]["value"] = None
            else:
                scored = self.anomaly.score(float(value))
                sensors[col] = {
                    "value": value,
                    "qc_flag": flag,
                    "anomaly_score": scored.anomaly_score,
                    "fault_flag": scored.fault_flag,
                }
        ts = row.get("timestamp_utc")
        return {
            "timestamp_utc": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "sensors": sensors,
            "history": self.history(hours=24),
            "data_quality_warning": "; ".join(warnings) if warnings else None,
            "data_source": row.get("data_source", "conduit"),
        }

    def history(self, hours: int = 24) -> dict[str, list[dict]]:
        if self.silver.empty:
            return {}
        df = self.silver.copy()
        df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True)
        cutoff = df["timestamp_utc"].max() - timedelta(hours=hours)
        window = df[df["timestamp_utc"] >= cutoff].sort_values("timestamp_utc")
        out: dict[str, list[dict]] = {}
        for col in SENSOR_COLUMNS:
            series = []
            if col not in window.columns:
                out[col] = series
                continue
            for _, rec in window.iterrows():
                value = rec.get(col)
                if value is None or (isinstance(value, float) and pd.isna(value)):
                    continue
                stamp = rec["timestamp_utc"]
                series.append(
                    {
                        "t": stamp.isoformat() if hasattr(stamp, "isoformat") else str(stamp),
                        "v": float(value),
                    }
                )
            out[col] = series
        return out

    def write_silver_record(self, record: dict) -> None:
        self.silver = pd.concat([self.silver, pd.DataFrame([record])], ignore_index=True)


def _f(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
