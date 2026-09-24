"""
Open-Meteo collector.

Free-tier note: Open-Meteo is for non-commercial use. This hackathon use is
documented in docs/decisions.md (ADR-002).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from src.constants import JKUAT_LAT, JKUAT_LON
from src.ingest.bronze import existing_timestamps, write_bronze
from src.ingest.http_retry import request_with_retry, write_actions_summary
from src.ingest.types import CollectionResult

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ERA5_URL = "https://archive-api.open-meteo.com/v1/archive"


class OpenMeteoCollector:
    SOURCE = "openmeteo"

    def run(self, sleep=None) -> CollectionResult:
        run_ts = datetime.now(tz=timezone.utc)
        errors: list[str] = []
        records: list[dict] = []
        kwargs = {}
        if sleep is not None:
            kwargs["sleep"] = sleep
        try:
            records.extend(self._fetch_forecast(**kwargs))
            records.extend(self._fetch_era5(**kwargs))
        except Exception as exc:  # noqa: BLE001
            msg = f"[{run_ts.isoformat()}] Open-Meteo fetch failed: {exc}"
            logger.error(msg)
            errors.append(msg)
            write_actions_summary(msg)
            return CollectionResult(
                source=self.SOURCE,
                records_fetched=0,
                records_written=0,
                records_skipped_duplicate=0,
                errors=errors,
                timestamp_utc=run_ts,
            )

        existing = existing_timestamps(self.SOURCE)
        unique: list[dict] = []
        skipped = 0
        seen: set = set()
        for rec in records:
            ts = pd_ts(rec["timestamp_utc"])
            if ts in existing or ts in seen:
                skipped += 1
                continue
            seen.add(ts)
            unique.append(rec)

        written = 0
        if unique:
            write_bronze(self.SOURCE, unique, run_ts)
            written = len(unique)
        return CollectionResult(
            source=self.SOURCE,
            records_fetched=len(records),
            records_written=written,
            records_skipped_duplicate=skipped,
            errors=errors,
            timestamp_utc=run_ts,
        )

    def _fetch_forecast(self, **retry_kwargs) -> list[dict]:
        params = {
            "latitude": JKUAT_LAT,
            "longitude": JKUAT_LON,
            "hourly": ",".join(
                [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "precipitation_probability",
                    "precipitation",
                    "wind_speed_10m",
                    "shortwave_radiation",
                    "et0_fao_evapotranspiration",
                ]
            ),
            "forecast_days": 7,
            "timezone": "UTC",
        }
        response = request_with_retry("GET", FORECAST_URL, params=params, **retry_kwargs)
        response.raise_for_status()
        return _hourly_records(response.json(), kind="forecast")

    def _fetch_era5(self, **retry_kwargs) -> list[dict]:
        end = datetime.now(tz=timezone.utc).date()
        start = end - timedelta(days=14)
        params = {
            "latitude": JKUAT_LAT,
            "longitude": JKUAT_LON,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "hourly": ",".join(
                [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "precipitation",
                    "wind_speed_10m",
                    "shortwave_radiation",
                    "soil_moisture_0_to_7cm",
                    "et0_fao_evapotranspiration",
                ]
            ),
            "timezone": "UTC",
        }
        response = request_with_retry("GET", ERA5_URL, params=params, **retry_kwargs)
        response.raise_for_status()
        return _hourly_records(response.json(), kind="era5")


def pd_ts(value) -> object:
    import pandas as pd

    return pd.Timestamp(pd.to_datetime(value, utc=True))


def _hourly_records(payload: dict, kind: str) -> list[dict]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    records = []
    for i, t in enumerate(times):
        ts = datetime.fromisoformat(t.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        records.append(
            {
                "timestamp_utc": ts,
                "kind": kind,
                "om_temp": _idx(hourly.get("temperature_2m"), i),
                "om_rh": _idx(hourly.get("relative_humidity_2m"), i),
                "om_precip_prob": _idx(hourly.get("precipitation_probability"), i),
                "om_precip": _idx(hourly.get("precipitation"), i),
                "om_wind": _idx(hourly.get("wind_speed_10m"), i),
                "om_sw_rad": _idx(hourly.get("shortwave_radiation"), i),
                "om_et0": _idx(hourly.get("et0_fao_evapotranspiration"), i),
                "om_soil_moisture": _idx(hourly.get("soil_moisture_0_to_7cm"), i),
                "raw_payload": {k: _idx(v, i) for k, v in hourly.items() if k != "time"},
            }
        )
    return records


def _idx(values, i):
    if not values or i >= len(values):
        return None
    return values[i]
