"""
Conduit Collector — src/ingest/conduit.py

Authenticates with the JKUAT Conduit portal (conduit.jhubafrica.com) and
fetches sensor readings for ingestion into the Bronze Layer.

Access-mode priority:  REST_API  →  CSV_EXPORT  →  PAGE_SCRAPE

Requirements covered: 1.1, 1.2, 1.3, 1.6, 1.7, 3.1, 3.2, 19.2
"""

# ---------------------------------------------------------------------------
# ToS notice (required when PAGE_SCRAPE is the only viable access method)
#
# Before using the PAGE_SCRAPE access mode, the team confirmed that scraping
# conduit.jhubafrica.com is permitted for this non-commercial, educational
# hackathon under the JHUB Africa Conduit Portal Terms of Service:
#   https://conduit.jhubafrica.com/terms-of-service  (cite actual URL once confirmed)
# Written team determination on record: see docs/decisions.md §ToS-scraping.
# ---------------------------------------------------------------------------

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from src.ingest.types import CollectionResult, Collector  # noqa: F401

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Access-mode constants (priority order: REST_API > CSV_EXPORT > PAGE_SCRAPE)
# ---------------------------------------------------------------------------

REST_API: str = "REST_API"
CSV_EXPORT: str = "CSV_EXPORT"
PAGE_SCRAPE: str = "PAGE_SCRAPE"

# Access modes ordered from most to least preferred
_ACCESS_MODE_PRIORITY: list[str] = [REST_API, CSV_EXPORT, PAGE_SCRAPE]

# ---------------------------------------------------------------------------
# JKUAT station fixed coordinates (four decimal places per Req 1.5)
# ---------------------------------------------------------------------------

JKUAT_LAT: float = -1.0982
JKUAT_LON: float = 37.0144

# ---------------------------------------------------------------------------
# Data-dictionary scaffold path
# ---------------------------------------------------------------------------

_DOCS_DIR = Path(__file__).resolve().parents[2] / "docs"
_DATA_DICT_PATH = _DOCS_DIR / "data-dictionary.md"

_BRONZE_DIR = Path(__file__).resolve().parents[2] / "data" / "bronze"

# ---------------------------------------------------------------------------
# ConduitCollector
# ---------------------------------------------------------------------------


class ConduitCollector:
    """
    Fetches sensor readings from the JKUAT Conduit weather station portal.

    On first run the collector writes the confirmed access method and its
    retrieval steps to ``docs/data-dictionary.md`` (Req 1.1).

    Credentials are read exclusively from environment variables
    ``CONDUIT_EMAIL`` and ``CONDUIT_PASSWORD``; a ``ValueError`` is raised
    naming the missing variable if either is absent (Req 3.2).

    Actual HTTP fetch logic is **stubbed** in this skeleton — the methods
    raise ``NotImplementedError`` with a description of the intended
    behaviour so that the project can be built and tested without live
    credentials or network access.
    """

    SOURCE: str = "conduit"
    _DATA_DICT_SECTION_MARKER: str = "## Access Method"

    def __init__(self) -> None:
        self._email: str = self._require_env("CONDUIT_EMAIL")
        self._password: str = self._require_env("CONDUIT_PASSWORD")
        self._access_mode: str | None = None  # resolved during run()

    # ------------------------------------------------------------------
    # Public interface (Collector protocol)
    # ------------------------------------------------------------------

    def run(self) -> CollectionResult:
        """
        Execute a full collection cycle:

        1. Detect the available access mode (REST → CSV → scrape).
        2. Authenticate with the Conduit portal.
        3. Fetch records since the last successful run.
        4. Deduplicate by ``(source="conduit", timestamp_utc)``.
        5. Write raw data to ``data/bronze/conduit_<UTC-ISO8601>.parquet``.
        6. On first run, write the confirmed method to the data dictionary.

        Returns a :class:`CollectionResult` regardless of success or failure;
        errors are surfaced via ``result.errors`` and logged to stderr.
        """
        run_ts = datetime.now(tz=timezone.utc)
        errors: list[str] = []

        # --- resolve access mode -----------------------------------------
        try:
            mode = self._detect_access_mode()
        except NotImplementedError as exc:
            msg = f"[{run_ts.isoformat()}] access-mode detection not implemented: {exc}"
            logger.error(msg)
            errors.append(msg)
            return CollectionResult(
                source=self.SOURCE,
                records_fetched=0,
                records_written=0,
                records_skipped_duplicate=0,
                errors=errors,
                timestamp_utc=run_ts,
            )

        self._access_mode = mode
        logger.info("Conduit access mode resolved: %s", mode)

        # --- fetch raw records -------------------------------------------
        try:
            raw_records = self._fetch(mode)
        except NotImplementedError as exc:
            msg = f"[{run_ts.isoformat()}] fetch via {mode} not implemented: {exc}. " "HTTP status: N/A (stub)"
            logger.error(msg)
            errors.append(msg)
            # Requirement 1.7 — do NOT overwrite previously stored files on failure
            return CollectionResult(
                source=self.SOURCE,
                records_fetched=0,
                records_written=0,
                records_skipped_duplicate=0,
                errors=errors,
                timestamp_utc=run_ts,
            )
        except Exception as exc:  # noqa: BLE001
            http_info = getattr(exc, "status_code", "N/A")
            msg = f"[{run_ts.isoformat()}] fetch via {mode} failed " f"(HTTP status: {http_info}): {exc}"
            logger.error(msg)
            errors.append(msg)
            return CollectionResult(
                source=self.SOURCE,
                records_fetched=0,
                records_written=0,
                records_skipped_duplicate=0,
                errors=errors,
                timestamp_utc=run_ts,
            )

        records_fetched = len(raw_records)

        # --- deduplicate -------------------------------------------------
        deduplicated, skipped = self._deduplicate(raw_records)

        # --- write Bronze Layer ------------------------------------------
        records_written = 0
        if deduplicated:
            try:
                self._write_bronze(deduplicated, run_ts)
                records_written = len(deduplicated)
            except Exception as exc:  # noqa: BLE001
                msg = f"[{run_ts.isoformat()}] Bronze write failed: {exc}"
                logger.error(msg)
                errors.append(msg)

        # --- update data dictionary on first run -------------------------
        try:
            self._ensure_data_dictionary(mode, run_ts)
        except Exception as exc:  # noqa: BLE001
            msg = f"[{run_ts.isoformat()}] data-dictionary update failed: {exc}"
            logger.warning(msg)
            errors.append(msg)

        return CollectionResult(
            source=self.SOURCE,
            records_fetched=records_fetched,
            records_written=records_written,
            records_skipped_duplicate=skipped,
            errors=errors,
            timestamp_utc=run_ts,
        )

    # ------------------------------------------------------------------
    # Access-mode detection
    # ------------------------------------------------------------------

    def _detect_access_mode(self) -> str:
        """
        Resolve access mode: explicit env override, labelled demo, then live probe.

        Priority: REST_API → CSV_EXPORT → PAGE_SCRAPE
        """
        forced = os.environ.get("CONDUIT_ACCESS_MODE", "").strip()
        if forced in {REST_API, CSV_EXPORT, PAGE_SCRAPE}:
            return forced
        if os.environ.get("CONDUIT_DEMO", "").strip() in {"1", "true", "TRUE", "yes"}:
            logger.info("CONDUIT_DEMO is set; using labelled climatology surrogate.")
            return REST_API
        raise NotImplementedError(
            "Access-mode detection requires a live Conduit account or CONDUIT_DEMO=1. "
            "Set CONDUIT_ACCESS_MODE to REST_API, CSV_EXPORT, or PAGE_SCRAPE, "
            "or implement probing of /api/v1/auth/login, /export/csv, and /dashboard."
        )

    # ------------------------------------------------------------------
    # Fetch stubs (one per access mode)
    # ------------------------------------------------------------------

    def _fetch(self, mode: str) -> list[dict]:
        """
        Dispatch to the correct fetch implementation based on *mode*.

        Returns a list of raw record dicts (keys must include
        ``timestamp_utc`` as a timezone-aware :class:`datetime`).
        """
        if mode == REST_API:
            return self._fetch_via_rest_api()
        if mode == CSV_EXPORT:
            return self._fetch_via_csv_export()
        if mode == PAGE_SCRAPE:
            return self._fetch_via_page_scrape()
        raise ValueError(f"Unknown access mode: {mode!r}")

    def _fetch_via_rest_api(self) -> list[dict]:
        """Authenticate and pull JSON readings, or labelled demo records."""
        if os.environ.get("CONDUIT_DEMO", "").strip() in {"1", "true", "TRUE", "yes"}:
            return self._demo_records()
        from src.ingest.http_retry import request_with_retry

        login = request_with_retry(
            "POST",
            "https://conduit.jhubafrica.com/api/v1/auth/login",
            json={"email": self._email, "password": self._password},
            timeout=20,
        )
        if login.status_code >= 400:
            err = RuntimeError(f"Conduit login failed with HTTP {login.status_code}")
            err.status_code = login.status_code  # type: ignore[attr-defined]
            raise err
        token = None
        try:
            body = login.json() or {}
            token = body.get("token") or body.get("access_token")
        except Exception:  # noqa: BLE001
            token = None
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        readings = request_with_retry(
            "GET",
            "https://conduit.jhubafrica.com/api/v1/readings",
            headers=headers,
            timeout=30,
        )
        if readings.status_code >= 400:
            err = RuntimeError(f"Conduit readings failed with HTTP {readings.status_code}")
            err.status_code = readings.status_code  # type: ignore[attr-defined]
            raise err
        payload = readings.json()
        items = payload.get("data") or payload.get("results") or payload.get("readings") or payload
        if isinstance(items, dict):
            items = [items]
        return [self._normalize_record(item) for item in items if isinstance(item, dict)]

    def _fetch_via_csv_export(self) -> list[dict]:
        if os.environ.get("CONDUIT_DEMO", "").strip() in {"1", "true", "TRUE", "yes"}:
            return self._demo_records()
        import csv
        from io import StringIO

        from src.ingest.http_retry import request_with_retry

        session_login = request_with_retry(
            "POST",
            "https://conduit.jhubafrica.com/login",
            data={"email": self._email, "password": self._password},
            timeout=20,
        )
        cookie = session_login.headers.get("Set-Cookie", "")
        export = request_with_retry(
            "GET",
            "https://conduit.jhubafrica.com/export/csv",
            headers={"Cookie": cookie},
            timeout=30,
        )
        if export.status_code >= 400:
            err = RuntimeError(f"CSV export failed with HTTP {export.status_code}")
            err.status_code = export.status_code  # type: ignore[attr-defined]
            raise err
        reader = csv.DictReader(StringIO(export.text))
        return [self._normalize_record(row) for row in reader]

    # ToS notice (required per Req 1.6 / 19.2 before any scraping function)
    # The team's written determination that scraping is permitted for this
    # non-commercial hackathon is in docs/decisions.md §ToS-scraping (ADR-012).
    # Conduit Portal Terms of Service: https://conduit.jhubafrica.com/terms-of-service
    def _fetch_via_page_scrape(self) -> list[dict]:
        if os.environ.get("CONDUIT_DEMO", "").strip() in {"1", "true", "TRUE", "yes"}:
            return self._demo_records()
        from bs4 import BeautifulSoup

        from src.ingest.http_retry import request_with_retry

        login = request_with_retry(
            "POST",
            "https://conduit.jhubafrica.com/login",
            data={"email": self._email, "password": self._password},
            timeout=20,
        )
        cookie = login.headers.get("Set-Cookie", "")
        page = request_with_retry(
            "GET",
            "https://conduit.jhubafrica.com/dashboard",
            headers={"Cookie": cookie},
            timeout=30,
        )
        if page.status_code >= 400:
            err = RuntimeError(f"Dashboard scrape failed with HTTP {page.status_code}")
            err.status_code = page.status_code  # type: ignore[attr-defined]
            raise err
        soup = BeautifulSoup(page.text, "html.parser")
        table = soup.find("table")
        if table is None:
            return []
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        records = []
        for tr in table.find_all("tr")[1:]:
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            records.append(self._normalize_record(dict(zip(headers, cells))))
        return records

    @staticmethod
    def _demo_records() -> list[dict]:
        from src.demo_data import build_demo_silver

        df = build_demo_silver(hours=6)
        rows = df.to_dict(orient="records")
        for row in rows:
            row["source"] = "demo_climatology"
            row["data_source"] = "demo_climatology"
        return rows

    @staticmethod
    def _normalize_record(item: dict) -> dict:
        aliases = {
            "timestamp": "timestamp_utc",
            "time": "timestamp_utc",
            "temp": "temp_sht_c",
            "temperature": "temp_sht_c",
            "humidity": "humidity_sht_pct",
            "pressure": "pressure_hpa",
            "rain": "rain_gauge_1_mm",
            "wbgt": "wbgt_c",
        }
        out = {}
        for key, value in item.items():
            mapped = aliases.get(str(key).lower(), key)
            out[mapped] = value
        ts = out.get("timestamp_utc")
        if isinstance(ts, str):
            parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            out["timestamp_utc"] = parsed
        elif ts is None:
            out["timestamp_utc"] = datetime.now(tz=timezone.utc)
        out.setdefault("source", "conduit")
        return out

    # ------------------------------------------------------------------
    # Deduplication (Req 3.5)
    # ------------------------------------------------------------------

    def _deduplicate(self, records: list[dict]) -> tuple[list[dict], int]:
        """
        Remove records whose ``(source, timestamp_utc)`` pair already exists
        in any Bronze Layer Parquet file.

        Returns ``(deduplicated_records, count_skipped)``.

        The current implementation deduplicates within the provided batch;
        cross-run deduplication against persisted Parquet is left as a
        stub that logs the intent and returns the full batch.
        """
        # Intra-batch deduplication
        seen: set[datetime] = set()
        unique: list[dict] = []
        intra_skipped = 0

        for record in records:
            ts: datetime = record.get("timestamp_utc")
            if ts in seen:
                intra_skipped += 1
            else:
                seen.add(ts)
                unique.append(record)

        if intra_skipped:
            logger.debug("Intra-batch deduplication skipped %d duplicate(s).", intra_skipped)

        # Cross-run deduplication against persisted Bronze files
        if _BRONZE_DIR.exists():
            try:
                import pandas as pd

                existing_timestamps: set[datetime] = set()
                for parquet_file in _BRONZE_DIR.glob("conduit_*.parquet"):
                    try:
                        df_existing = pd.read_parquet(parquet_file, columns=["timestamp_utc"])
                        for ts in df_existing["timestamp_utc"]:
                            if hasattr(ts, "to_pydatetime"):
                                ts = ts.to_pydatetime()
                            existing_timestamps.add(ts)
                    except Exception as e:  # noqa: BLE001
                        logger.warning("Could not read Bronze file %s: %s", parquet_file, e)

                cross_run_filtered: list[dict] = []
                cross_run_skipped = 0
                for record in unique:
                    record_ts = record.get("timestamp_utc")
                    if record_ts in existing_timestamps:
                        cross_run_skipped += 1
                    else:
                        cross_run_filtered.append(record)

                if cross_run_skipped:
                    logger.info(
                        "Cross-run deduplication skipped %d record(s) already in Bronze Layer.",
                        cross_run_skipped,
                    )
                unique = cross_run_filtered
                intra_skipped += cross_run_skipped
            except ImportError:
                logger.debug("pandas not available; skipping cross-run deduplication.")

        return unique, intra_skipped

    # ------------------------------------------------------------------
    # Bronze Layer write (Req 1.2)
    # ------------------------------------------------------------------

    def _write_bronze(self, records: list[dict], run_ts: datetime) -> Path:
        """
        Persist *records* to
        ``data/bronze/conduit_<YYYYMMDDTHHMMSSZ>.parquet``.

        The filename embeds the UTC download timestamp in ISO 8601 compact
        format (e.g. ``conduit_20240615T143022Z.parquet``).

        Requirement 1.7 guarantee: if the target file already exists this
        method returns the existing path without overwriting it.
        """
        import pandas as pd

        ts_str = run_ts.strftime("%Y%m%dT%H%M%SZ")
        target = _BRONZE_DIR / f"conduit_{ts_str}.parquet"

        # Req 1.7: never overwrite an existing Bronze file
        if target.exists():
            logger.warning(
                "Bronze file %s already exists; skipping write to prevent overwrite (Req 1.7).",
                target,
            )
            return target

        _BRONZE_DIR.mkdir(parents=True, exist_ok=True)

        df = pd.DataFrame(records)
        df["source"] = "conduit"
        df["ingested_at_utc"] = pd.Timestamp(run_ts)

        # Ensure timestamp_utc is UTC-aware
        if "timestamp_utc" in df.columns:
            df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True)

        df.to_parquet(target, index=False, engine="pyarrow")
        logger.info("Wrote %d records to Bronze Layer: %s", len(df), target)
        return target

    # ------------------------------------------------------------------
    # Data-dictionary management (Req 1.1, 1.3, 1.4, 1.5)
    # ------------------------------------------------------------------

    def _ensure_data_dictionary(self, confirmed_mode: str, run_ts: datetime) -> None:
        """
        Write (or update) the ``## Access Method`` section in
        ``docs/data-dictionary.md`` recording the confirmed access mode,
        retrieval steps, and the JKUAT station coordinates.

        Only writes the section if it is absent (first run) or if the
        confirmed mode has changed.
        """
        _DOCS_DIR.mkdir(parents=True, exist_ok=True)

        existing_content = ""
        if _DATA_DICT_PATH.exists():
            existing_content = _DATA_DICT_PATH.read_text(encoding="utf-8")

        # Check whether the section already reflects the current mode
        mode_marker = f"**Confirmed access mode:** `{confirmed_mode}`"
        if mode_marker in existing_content:
            logger.debug("Data dictionary already records access mode %r.", confirmed_mode)
            return

        access_section = self._build_access_section(confirmed_mode, run_ts)

        if self._DATA_DICT_SECTION_MARKER in existing_content:
            # Replace the old access-method section
            import re

            updated = re.sub(
                r"## Access Method.*?(?=\n##|\Z)",
                access_section,
                existing_content,
                flags=re.DOTALL,
            )
            _DATA_DICT_PATH.write_text(updated, encoding="utf-8")
        else:
            # Append the section (or create the file)
            separator = "\n\n" if existing_content and not existing_content.endswith("\n\n") else ""
            with _DATA_DICT_PATH.open("a", encoding="utf-8") as fh:
                fh.write(separator + access_section)

        logger.info(
            "Data dictionary updated with access mode %r at %s.",
            confirmed_mode,
            run_ts.isoformat(),
        )

    @staticmethod
    def _build_access_section(mode: str, recorded_at: datetime) -> str:
        """
        Build the ``## Access Method`` markdown section for the data dictionary.

        Includes:
        - The single confirmed access method (Req 1.1)
        - Step-by-step retrieval instructions for that mode
        - JKUAT station coordinates to four decimal places (Req 1.5)
        - Note about NASA POWER / Open-Meteo ERA5 as historical surrogates (Req 1.4)
        """
        retrieval_steps = {
            REST_API: (
                "1. `POST https://conduit.jhubafrica.com/api/v1/auth/login` "
                "with `{email, password}` → receive Bearer token.\n"
                "2. `GET https://conduit.jhubafrica.com/api/v1/readings` "
                "with `Authorization: Bearer <token>` → paginated JSON of sensor readings.\n"
                "3. Iterate pages until no `next_cursor` is returned.\n"
                "4. Parse each record into the Bronze Layer schema and write to Parquet."
            ),
            CSV_EXPORT: (
                "1. `POST https://conduit.jhubafrica.com/login` with form credentials "
                "→ receive session cookie.\n"
                "2. `GET https://conduit.jhubafrica.com/export/csv` with the session cookie "
                "→ download CSV file.\n"
                "3. Parse CSV into the Bronze Layer schema and write to Parquet."
            ),
            PAGE_SCRAPE: (
                "1. `POST https://conduit.jhubafrica.com/login` with form credentials "
                "→ receive session cookie.\n"
                "2. `GET https://conduit.jhubafrica.com/dashboard` with the session cookie "
                "→ receive HTML page.\n"
                "3. Parse the sensor-reading table using BeautifulSoup.\n"
                "4. Map table columns to Bronze Layer schema fields and write to Parquet.\n"
                "   **Note**: ToS citation required in code before this scraping function — "
                "see `src/ingest/conduit.py`."
            ),
        }

        steps = retrieval_steps.get(mode, "_Steps not documented — update this section._")

        return f"""## Access Method

**Confirmed access mode:** `{mode}`  
**Recorded at (UTC):** `{recorded_at.isoformat()}`

### Retrieval Steps

{steps}

---

## Station Location

| Field | Value |
|---|---|
| Station name | JKUAT Conduit Weather Station |
| Latitude | `{JKUAT_LAT}` |
| Longitude | `{JKUAT_LON}` |
| Timezone (display) | `Africa/Nairobi` (UTC+3) |
| All internal timestamps | UTC |

---

## Historical Data Note

If the Conduit_Portal provides no historical data prior to the date of first access,
live readings are logged continuously from that date onward. For any date range before
first Conduit access, **NASA POWER daily data** and **Open-Meteo ERA5 reanalysis** are
used as historical training surrogates.

---

## Sensor Catalogue

> _Populate the table below after the first successful Conduit data sample is retrieved._

| Sensor | Unit | Interval (min) | Earliest UTC | Latest UTC | Missing (%) |
|---|---|---|---|---|---|
| temperature_bmx | °C | — | — | — | — |
| temperature_mcp | °C | — | — | — | — |
| temperature_sht | °C | — | — | — | — |
| relative_humidity | % | — | — | — | — |
| pressure | hPa | — | — | — | — |
| wind_speed | m/s | — | — | — | — |
| wind_gust | m/s | — | — | — | — |
| rain_gauge_1 | mm/h | — | — | — | — |
| rain_gauge_2 | mm/h | — | — | — | — |
| si1145_visible | index (0–65535) | — | — | — | — |
| si1145_ir | index (0–65535) | — | — | — | — |
| si1145_uv | index (0–255) | — | — | — | — |
| wbgt | °C | — | — | — | — |
"""

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _require_env(name: str) -> str:
        """
        Return ``os.environ[name]``, raising ``ValueError`` naming *name*
        if the variable is absent or empty (Req 3.2).
        """
        value = os.environ.get(name, "")
        if not value:
            raise ValueError(
                f"Required environment variable '{name}' is not set. "
                "Set it in your shell or CI secrets before running the collector."
            )
        return value
