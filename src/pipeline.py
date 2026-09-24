"""Bronze → Silver → Gold batch job for local and CI use."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import pandas as pd

from src.paths import BRONZE_DIR, GOLD_DIR, ensure_data_dirs
from src.processing.features import FeatureEngineer
from src.processing.qc import BronzeRecord, QCModule

logger = logging.getLogger(__name__)


def load_bronze() -> pd.DataFrame:
    ensure_data_dirs()
    files = sorted(BRONZE_DIR.glob("*.parquet"))
    if not files:
        return pd.DataFrame()
    return pd.concat([pd.read_parquet(path) for path in files], ignore_index=True)


def run_pipeline() -> dict[str, int]:
    bronze = load_bronze()
    if bronze.empty:
        logger.warning("No Bronze files; skipping QC/features.")
        return {"bronze": 0, "silver": 0, "gold": 0}
    records = []
    for row in bronze.to_dict(orient="records"):
        try:
            records.append(BronzeRecord.from_dict(row))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping bronze row: %s", exc)
    qc = QCModule()
    silver = qc.process_batch(records)
    qc.write_silver(silver, filename="silver.parquet")
    silver_df = pd.DataFrame([s.to_dict() for s in silver])
    om = bronze[bronze["source"] == "openmeteo"] if "source" in bronze.columns else pd.DataFrame()
    gold = FeatureEngineer().transform(silver_df, om if not om.empty else None)
    ensure_data_dirs()
    gold.to_parquet(GOLD_DIR / "features.parquet", index=False)
    logger.info(
        "Pipeline complete at %s: bronze=%s silver=%s gold=%s",
        datetime.now(tz=timezone.utc).isoformat(),
        len(bronze),
        len(silver),
        len(gold),
    )
    return {"bronze": len(bronze), "silver": len(silver), "gold": len(gold)}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    run_pipeline()


if __name__ == "__main__":
    main()
