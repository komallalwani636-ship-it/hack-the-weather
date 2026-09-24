"""NASA POWER daily historical collector."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from src.constants import JKUAT_LAT, JKUAT_LON
from src.ingest.bronze import existing_timestamps, latest_utc_date, write_bronze
from src.ingest.http_retry import request_with_retry, write_actions_summary
from src.ingest.types import CollectionResult

logger = logging.getLogger(__name__)

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = "T2M,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR"


class NASAPOWERCollector:
    SOURCE = "nasa_power"

    def run(self, sleep=None) -> CollectionResult:
        run_ts = datetime.now(tz=timezone.utc)
        errors: list[str] = []
        latest = latest_utc_date(self.SOURCE)
        start = (latest + timedelta(days=1)).date() if latest else (run_ts.date() - timedelta(days=365))
        end = run_ts.date() - timedelta(days=1)
        if start > end:
            return CollectionResult(
                source=self.SOURCE,
                records_fetched=0,
                records_written=0,
                records_skipped_duplicate=0,
                errors=errors,
                timestamp_utc=run_ts,
            )

        kwargs = {}
        if sleep is not None:
            kwargs["sleep"] = sleep
        try:
            records = self._fetch(start.strftime("%Y%m%d"), end.strftime("%Y%m%d"), **kwargs)
        except Exception as exc:  # noqa: BLE001
            msg = f"[{run_ts.isoformat()}] NASA POWER fetch failed: {exc}"
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
        unique = []
        skipped = 0
        import pandas as pd

        for rec in records:
            ts = pd.Timestamp(pd.to_datetime(rec["timestamp_utc"], utc=True))
            if ts in existing:
                skipped += 1
            else:
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

    def _fetch(self, start: str, end: str, **retry_kwargs) -> list[dict]:
        params = {
            "parameters": PARAMETERS,
            "community": "AG",
            "longitude": JKUAT_LON,
            "latitude": JKUAT_LAT,
            "start": start,
            "end": end,
            "format": "JSON",
        }
        response = request_with_retry("GET", POWER_URL, params=params, timeout=60, **retry_kwargs)
        response.raise_for_status()
        payload = response.json()
        parameter = payload.get("properties", {}).get("parameter", {})
        dates = set()
        for series in parameter.values():
            dates.update(series.keys())
        records = []
        for day in sorted(dates):
            if day.startswith("HEADER"):
                continue
            ts = datetime.strptime(day, "%Y%m%d").replace(tzinfo=timezone.utc)
            records.append(
                {
                    "timestamp_utc": ts,
                    "t2m": _val(parameter, "T2M", day),
                    "rh2m": _val(parameter, "RH2M", day),
                    "ws2m": _val(parameter, "WS2M", day),
                    "sw_dwn": _val(parameter, "ALLSKY_SFC_SW_DWN", day),
                    "precip": _val(parameter, "PRECTOTCORR", day),
                    "raw_payload": {k: series.get(day) for k, series in parameter.items()},
                }
            )
        return records


def _val(parameter: dict, name: str, day: str):
    series = parameter.get(name) or {}
    value = series.get(day)
    if value is None or value == -999:
        return None
    return value
