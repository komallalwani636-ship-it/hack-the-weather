"""Shared collector types."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, runtime_checkable


@dataclass
class CollectionResult:
    source: str
    records_fetched: int
    records_written: int
    records_skipped_duplicate: int
    errors: list[str]
    timestamp_utc: datetime

    def __post_init__(self) -> None:
        if self.timestamp_utc.tzinfo is None:
            raise ValueError("timestamp_utc must be timezone-aware (UTC).")


@runtime_checkable
class Collector(Protocol):
    def run(self) -> CollectionResult:  # pragma: no cover
        ...
