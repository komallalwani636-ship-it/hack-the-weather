"""Gold-layer feature engineering (no future leakage)."""

from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
import pandas as pd

from src.paths import GOLD_DIR, ensure_data_dirs

logger = logging.getLogger(__name__)


def hour_encoding(hour: int) -> tuple[float, float]:
    hour = int(hour) % 24
    return math.sin(2 * math.pi * hour / 24), math.cos(2 * math.pi * hour / 24)


def decode_hour(sin_h: float, cos_h: float) -> int:
    recovered = round(math.atan2(sin_h, cos_h) * 24 / (2 * math.pi)) % 24
    return int(recovered)


def bias_correct(value: float, delta: float) -> float:
    return value + delta


class FeatureEngineer:
    def __init__(self) -> None:
        self.missing_counts: dict[str, int] = {}
        self.missing_om_joins: int = 0
        self._audit: list[dict[str, Any]] = []

    def audit_timestamps(self) -> list[dict[str, Any]]:
        return list(self._audit)

    def transform(
        self,
        silver: pd.DataFrame,
        openmeteo: pd.DataFrame | None = None,
    ) -> pd.DataFrame:
        if silver.empty:
            return silver.copy()
        df = silver.copy()
        df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True)
        df = df.sort_values("timestamp_utc").reset_index(drop=True)
        df["ok_rain"] = df.get("rain_gauge_1_mm")
        if "qc_flag" in df.columns:
            df.loc[df["qc_flag"] != "OK", "ok_rain"] = np.nan

        idx = df.set_index("timestamp_utc")
        for hours, col in [(1, "pressure_tendency_1h"), (3, "pressure_tendency_3h"), (6, "pressure_tendency_6h")]:
            shifted = idx["pressure_hpa"].reindex(idx.index - pd.Timedelta(hours=hours))
            idx[col] = idx["pressure_hpa"].to_numpy() - shifted.to_numpy()
        rain = idx["ok_rain"].astype(float)
        for hours, col in [(1, "rain_1h"), (3, "rain_3h"), (24, "rain_24h")]:
            idx[col] = rain.rolling(f"{hours}h", min_periods=1).sum()
            # require lookback span
            span = idx.index - idx.index[0]
            idx.loc[span < pd.Timedelta(hours=hours), col] = np.nan

        humidity = idx.get("humidity_sht_pct")
        temp = idx.get("temp_sht_c")
        if humidity is not None:
            shifted = humidity.reindex(idx.index - pd.Timedelta(hours=1))
            idx["humidity_delta_1h"] = humidity.to_numpy() - shifted.to_numpy()
        else:
            idx["humidity_delta_1h"] = np.nan
        if temp is not None:
            shifted = temp.reindex(idx.index - pd.Timedelta(hours=1))
            idx["temperature_delta_1h"] = temp.to_numpy() - shifted.to_numpy()
        else:
            idx["temperature_delta_1h"] = np.nan

        gust = idx.get("wind_gust_ms")
        wind = idx.get("wind_speed_ms")
        if gust is not None and wind is not None:
            mean_wind = wind.rolling("30min", min_periods=1).mean()
            max_gust = gust.rolling("30min", min_periods=1).max()
            ratio = np.where(mean_wind.to_numpy() == 0, -1.0, max_gust.to_numpy() / mean_wind.to_numpy())
            idx["wind_gust_ratio"] = ratio
        else:
            idx["wind_gust_ratio"] = np.nan

        hours = idx.index.hour
        sines, cosines = zip(*[hour_encoding(int(h)) for h in hours])
        idx["hour_sin"] = list(sines)
        idx["hour_cos"] = list(cosines)

        for col in [
            "pressure_tendency_1h",
            "pressure_tendency_3h",
            "pressure_tendency_6h",
            "rain_1h",
            "rain_3h",
            "rain_24h",
            "humidity_delta_1h",
            "temperature_delta_1h",
            "wind_gust_ratio",
        ]:
            self.missing_counts[col] = int(idx[col].isna().sum()) if col in idx else len(idx)
            if self.missing_counts[col]:
                logger.info("Feature %s missing for %s rows (insufficient lookback)", col, self.missing_counts[col])

        gold = idx.reset_index()
        gold = self._join_openmeteo(gold, openmeteo)
        gold = self._bias_correct(gold)
        gold["audit_max_input_ts"] = gold["timestamp_utc"]
        self._audit = [{"row_ts": ts, "max_input_ts": ts} for ts in gold["timestamp_utc"].tolist()]
        return gold

    def _join_openmeteo(self, gold: pd.DataFrame, openmeteo: pd.DataFrame | None) -> pd.DataFrame:
        for col in ["om_temp", "om_precip_prob", "om_rh", "om_sw_rad", "om_wind", "om_precip"]:
            if col not in gold.columns:
                gold[col] = np.nan
        if openmeteo is None or openmeteo.empty:
            self.missing_om_joins = len(gold)
            logger.info("Missing Open-Meteo joins: %s", self.missing_om_joins)
            return gold
        om = openmeteo.copy()
        om["timestamp_utc"] = pd.to_datetime(om["timestamp_utc"], utc=True)
        om["hour_key"] = om["timestamp_utc"].dt.floor("h")
        gold["hour_key"] = pd.to_datetime(gold["timestamp_utc"], utc=True).dt.floor("h")
        cols = [
            c
            for c in ["om_temp", "om_precip_prob", "om_rh", "om_sw_rad", "om_wind", "om_precip", "hour_key"]
            if c in om.columns
        ]
        merged = gold.merge(om[cols], on="hour_key", how="left", suffixes=("", "_om"))
        for col in ["om_temp", "om_precip_prob", "om_rh", "om_sw_rad", "om_wind", "om_precip"]:
            src = f"{col}_om"
            if src in merged.columns:
                merged[col] = merged[col].combine_first(merged[src])
        self.missing_om_joins = int(merged["om_temp"].isna().sum()) if "om_temp" in merged.columns else len(merged)
        logger.info("Missing Open-Meteo joins: %s", self.missing_om_joins)
        merged = merged.drop(columns=["hour_key"], errors="ignore")
        if "timestamp_utc" in merged.columns:
            merged = merged.drop_duplicates(subset=["timestamp_utc"], keep="last")
        return merged

    def _bias_correct(self, gold: pd.DataFrame) -> pd.DataFrame:
        mapping = {
            "temp": ("temp_sht_c", "om_temp"),
            "rh": ("humidity_sht_pct", "om_rh"),
            "wind": ("wind_speed_ms", "om_wind"),
            "sw_rad": ("si1145_visible", "om_sw_rad"),
            "precip": ("rain_gauge_1_mm", "om_precip"),
        }
        gold = gold.sort_values("timestamp_utc").copy()
        gold["bias_correction_days_used"] = 0
        for name, (obs_col, fcst_col) in mapping.items():
            if obs_col not in gold.columns or fcst_col not in gold.columns:
                gold[f"om_{name}_bc"] = gold.get(fcst_col, np.nan)
                gold[f"bias_correction_delta_{name}"] = 0.0
                continue
            tmp = gold.set_index("timestamp_utc")
            rolling = (tmp[obs_col].astype(float) - tmp[fcst_col].astype(float)).rolling("30D", min_periods=1).mean()
            overlap_days = tmp.dropna(subset=[obs_col, fcst_col]).index.normalize().nunique()
            gold["bias_correction_days_used"] = overlap_days
            if overlap_days < 7:
                delta = pd.Series(0.0, index=tmp.index)
                insufficient, partial = True, False
            elif overlap_days < 30:
                delta = rolling.fillna(0.0)
                insufficient, partial = False, True
            else:
                delta = rolling.fillna(0.0)
                insufficient, partial = False, False
            gold[f"bias_correction_delta_{name}"] = delta.to_numpy()
            gold[f"om_{name}_bc"] = tmp[fcst_col].to_numpy() + delta.to_numpy()
            gold["bias_correction_insufficient_data"] = insufficient
            gold["bias_correction_partial_window"] = partial
        # alias expected names
        gold["om_temp_bc"] = gold.get("om_temp_bc", gold.get("om_temp"))
        gold["om_rh_bc"] = gold.get("om_rh_bc", gold.get("om_rh"))
        gold["om_wind_bc"] = gold.get("om_wind_bc", gold.get("om_wind"))
        gold["om_sw_rad_bc"] = gold.get("om_sw_rad_bc", gold.get("om_sw_rad"))
        gold["om_precip_bc"] = gold.get("om_precip_bc", gold.get("om_precip"))
        return gold

    def write_gold(self, gold: pd.DataFrame, filename: str = "features.parquet") -> None:
        ensure_data_dirs()
        path = GOLD_DIR / filename
        gold.to_parquet(path, index=False)
        logger.info("Wrote Gold features to %s", path)
