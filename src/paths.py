"""Repository path constants."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs"
DATA_DIR = ROOT / "data"
BRONZE_DIR = DATA_DIR / "bronze"
SILVER_DIR = DATA_DIR / "silver"
GOLD_DIR = DATA_DIR / "gold"
MODELS_DIR = ROOT / "models"


def ensure_data_dirs() -> None:
    for path in (BRONZE_DIR, SILVER_DIR, GOLD_DIR, MODELS_DIR):
        path.mkdir(parents=True, exist_ok=True)
