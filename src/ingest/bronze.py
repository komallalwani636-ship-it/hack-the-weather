"""Bronze-layer Parquet write and timestamp index helpers."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from src.paths import BRONZE_DIR, ensure_data_dirs

logger = logging.getLogger(__name__)


def existing_timestamps(source: str) -> set[pd.Timestamp]:
    ensure_data_dirs()
    stamps: set[pd.Timestamp] = set()
    for parquet_file in BRONZE_DIR.glob(f"{source}_*.parquet"):
        try:
            df = pd.read_parquet(parquet_file, columns=["timestamp_utc"])
            for ts in pd.to_datetime(df["timestamp_utc"], utc=True):
                stamps.add(pd.Timestamp(ts))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not read Bronze file %s: %s", parquet_file, exc)
    return stamps


def write_bronze(source: str, records: list[dict], run_ts: datetime) -> Path | None:
    """Write records; never overwrite an existing file for this exact timestamp."""
    if not records:
        return None
    ensure_data_dirs()
    if run_ts.tzinfo is None:
        run_ts = run_ts.replace(tzinfo=timezone.utc)
    ts_str = run_ts.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = BRONZE_DIR / f"{source}_{ts_str}.parquet"
    if target.exists():
        logger.warning("Bronze file %s already exists; skipping overwrite.", target)
        return target
    df = pd.DataFrame(records)
    df["source"] = source
    df["ingested_at_utc"] = pd.Timestamp(run_ts)
    if "timestamp_utc" in df.columns:
        df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True)
    df.to_parquet(target, index=False, engine="pyarrow")
    logger.info("Wrote %d records to %s", len(df), target)
    return target


def latest_utc_date(source: str) -> datetime | None:
    stamps = existing_timestamps(source)
    if not stamps:
        return None
    latest = max(stamps)
    return latest.to_pydatetime()
