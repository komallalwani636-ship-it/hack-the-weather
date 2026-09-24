"""Orchestrate collectors, write Bronze, optionally upsert to Supabase."""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone

from src.ingest.conduit import ConduitCollector
from src.ingest.http_retry import write_actions_summary
from src.ingest.nasa_power import NASAPOWERCollector
from src.ingest.openmeteo import OpenMeteoCollector
from src.ingest.types import CollectionResult
from src.paths import BRONZE_DIR, ensure_data_dirs

logger = logging.getLogger(__name__)

STORAGE_FALLBACK_PARQUET = "local_parquet"


def health_payload(storage_fallback: str | None = None) -> dict:
    ensure_data_dirs()
    latest = None
    for path in BRONZE_DIR.glob("*.parquet"):
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        if latest is None or mtime > latest:
            latest = mtime
    return {
        "status": "ok",
        "data_last_updated_utc": latest.isoformat() if latest else None,
        "storage_fallback": storage_fallback,
    }


def upsert_supabase(records: list[dict], source: str) -> bool:
    url = os.environ.get("SUPABASE_URL") or ""
    key = os.environ.get("SUPABASE_KEY") or ""
    if not url or not key:
        return False
    try:
        from supabase import create_client

        client = create_client(url, key)
        rows = []
        for rec in records:
            rows.append(
                {
                    "source": source,
                    "timestamp_utc": (
                        rec["timestamp_utc"].isoformat()
                        if hasattr(rec["timestamp_utc"], "isoformat")
                        else str(rec["timestamp_utc"])
                    ),
                    "sensor_data": {k: v for k, v in rec.items() if k != "raw_payload"},
                    "qc_flags": {},
                }
            )
        if rows:
            client.table("observations").upsert(rows, on_conflict="source,timestamp_utc").execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Supabase upsert failed: %s", exc)
        return False


def run_all() -> list[CollectionResult]:
    collectors = [
        ("conduit", lambda: ConduitCollector().run()),
        ("openmeteo", lambda: OpenMeteoCollector().run()),
        ("nasa_power", lambda: NASAPOWERCollector().run()),
    ]
    results: list[CollectionResult] = []
    fatal = False
    for name, fn in collectors:
        try:
            result = fn()
        except ValueError as exc:
            msg = f"[{datetime.now(tz=timezone.utc).isoformat()}] {name}: {exc}"
            logger.error(msg)
            write_actions_summary(msg)
            raise
        results.append(result)
        if result.errors:
            for err in result.errors:
                write_actions_summary(err)
            fatal = True
        # Best-effort serving upsert; parquet is source of truth on failure.
        if result.records_written:
            latest = sorted(BRONZE_DIR.glob(f"{name}_*.parquet"))
            if latest:
                try:
                    import pandas as pd

                    rows = pd.read_parquet(latest[-1]).to_dict(orient="records")
                    upsert_supabase(rows, name)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Could not upsert %s: %s", name, exc)
    if fatal:
        sys.exit(1)
    return results


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    run_all()


if __name__ == "__main__":
    main()
