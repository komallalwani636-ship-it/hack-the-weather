"""
Unit tests for src/ingest/conduit.py — ConduitCollector (Task 1.1).

Tests are intentionally offline: no network calls are made.
They validate:
  - Environment-variable validation (ValueError on missing creds)
  - Access-mode constants are defined and distinct
  - CollectionResult dataclass contract
  - Collector protocol satisfaction
  - Intra-batch deduplication logic
  - Data-dictionary scaffold generation
  - run() error-path returns a valid CollectionResult (no crash)
"""

from datetime import datetime, timezone

import pytest

from src.ingest.conduit import (
    CSV_EXPORT,
    JKUAT_LAT,
    JKUAT_LON,
    PAGE_SCRAPE,
    REST_API,
    CollectionResult,
    Collector,
    ConduitCollector,
    _ACCESS_MODE_PRIORITY,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def env_with_creds(monkeypatch):
    """Provide valid (dummy) credentials via environment variables."""
    monkeypatch.setenv("CONDUIT_EMAIL", "test@example.com")
    monkeypatch.setenv("CONDUIT_PASSWORD", "s3cr3t")


@pytest.fixture()
def collector(env_with_creds):
    """Return a ConduitCollector instance with dummy credentials."""
    return ConduitCollector()


# ---------------------------------------------------------------------------
# 1. Access-mode constants
# ---------------------------------------------------------------------------


class TestAccessModeConstants:
    def test_constants_are_strings(self):
        assert isinstance(REST_API, str)
        assert isinstance(CSV_EXPORT, str)
        assert isinstance(PAGE_SCRAPE, str)

    def test_constants_are_distinct(self):
        assert len({REST_API, CSV_EXPORT, PAGE_SCRAPE}) == 3

    def test_priority_order_starts_with_rest_api(self):
        assert _ACCESS_MODE_PRIORITY[0] == REST_API

    def test_priority_order_ends_with_page_scrape(self):
        assert _ACCESS_MODE_PRIORITY[-1] == PAGE_SCRAPE

    def test_priority_contains_all_three(self):
        assert set(_ACCESS_MODE_PRIORITY) == {REST_API, CSV_EXPORT, PAGE_SCRAPE}


# ---------------------------------------------------------------------------
# 2. Environment-variable validation (Req 3.2)
# ---------------------------------------------------------------------------


class TestEnvVarValidation:
    def test_missing_email_raises_value_error(self, monkeypatch):
        monkeypatch.delenv("CONDUIT_EMAIL", raising=False)
        monkeypatch.setenv("CONDUIT_PASSWORD", "pw")
        with pytest.raises(ValueError, match="CONDUIT_EMAIL"):
            ConduitCollector()

    def test_missing_password_raises_value_error(self, monkeypatch):
        monkeypatch.setenv("CONDUIT_EMAIL", "user@example.com")
        monkeypatch.delenv("CONDUIT_PASSWORD", raising=False)
        with pytest.raises(ValueError, match="CONDUIT_PASSWORD"):
            ConduitCollector()

    def test_empty_email_raises_value_error(self, monkeypatch):
        monkeypatch.setenv("CONDUIT_EMAIL", "")
        monkeypatch.setenv("CONDUIT_PASSWORD", "pw")
        with pytest.raises(ValueError, match="CONDUIT_EMAIL"):
            ConduitCollector()

    def test_empty_password_raises_value_error(self, monkeypatch):
        monkeypatch.setenv("CONDUIT_EMAIL", "user@example.com")
        monkeypatch.setenv("CONDUIT_PASSWORD", "")
        with pytest.raises(ValueError, match="CONDUIT_PASSWORD"):
            ConduitCollector()

    def test_both_present_does_not_raise(self, env_with_creds):
        # Should construct without error
        c = ConduitCollector()
        assert c is not None


# ---------------------------------------------------------------------------
# 3. CollectionResult dataclass
# ---------------------------------------------------------------------------


class TestCollectionResult:
    def test_valid_construction(self):
        ts = datetime.now(tz=timezone.utc)
        result = CollectionResult(
            source="conduit",
            records_fetched=10,
            records_written=8,
            records_skipped_duplicate=2,
            errors=[],
            timestamp_utc=ts,
        )
        assert result.source == "conduit"
        assert result.records_fetched == 10
        assert result.records_written == 8
        assert result.records_skipped_duplicate == 2
        assert result.errors == []
        assert result.timestamp_utc == ts

    def test_naive_datetime_raises(self):
        naive_ts = datetime(2024, 1, 1, 12, 0, 0)  # no tzinfo
        with pytest.raises(ValueError, match="timezone-aware"):
            CollectionResult(
                source="conduit",
                records_fetched=0,
                records_written=0,
                records_skipped_duplicate=0,
                errors=[],
                timestamp_utc=naive_ts,
            )

    def test_errors_field_accepts_list(self):
        ts = datetime.now(tz=timezone.utc)
        result = CollectionResult(
            source="conduit",
            records_fetched=0,
            records_written=0,
            records_skipped_duplicate=0,
            errors=["something went wrong"],
            timestamp_utc=ts,
        )
        assert len(result.errors) == 1


# ---------------------------------------------------------------------------
# 4. Collector protocol
# ---------------------------------------------------------------------------


class TestCollectorProtocol:
    def test_conduit_collector_satisfies_protocol(self, collector):
        """ConduitCollector must be recognised as a Collector at runtime."""
        assert isinstance(collector, Collector)

    def test_protocol_requires_run_method(self):
        class _Missing:
            pass

        assert not isinstance(_Missing(), Collector)


# ---------------------------------------------------------------------------
# 5. Station coordinates
# ---------------------------------------------------------------------------


class TestStationCoordinates:
    def test_latitude_four_decimal_places(self):
        # Must be expressible to four decimal places without rounding error
        assert round(JKUAT_LAT, 4) == JKUAT_LAT

    def test_longitude_four_decimal_places(self):
        assert round(JKUAT_LON, 4) == JKUAT_LON

    def test_latitude_in_kenya_range(self):
        assert -5.0 <= JKUAT_LAT <= 5.0  # Kenya spans roughly ±5 °N/S

    def test_longitude_in_kenya_range(self):
        assert 33.0 <= JKUAT_LON <= 42.0  # Kenya longitude band


# ---------------------------------------------------------------------------
# 6. Intra-batch deduplication
# ---------------------------------------------------------------------------


class TestDeduplication:
    def test_no_duplicates_returns_all(self, collector):
        ts1 = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        ts2 = datetime(2024, 6, 1, 10, 5, 0, tzinfo=timezone.utc)
        records = [
            {"timestamp_utc": ts1, "temp": 22.0},
            {"timestamp_utc": ts2, "temp": 22.5},
        ]
        unique, skipped = collector._deduplicate(records)
        assert len(unique) == 2
        assert skipped == 0

    def test_duplicate_timestamps_removed(self, collector):
        ts = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        records = [
            {"timestamp_utc": ts, "temp": 22.0},
            {"timestamp_utc": ts, "temp": 22.0},  # duplicate
        ]
        unique, skipped = collector._deduplicate(records)
        assert len(unique) == 1
        assert skipped == 1

    def test_mixed_batch_deduplication(self, collector):
        ts_a = datetime(2024, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
        ts_b = datetime(2024, 6, 1, 11, 0, 0, tzinfo=timezone.utc)
        records = [
            {"timestamp_utc": ts_a},
            {"timestamp_utc": ts_a},  # dup
            {"timestamp_utc": ts_b},
            {"timestamp_utc": ts_b},  # dup
            {"timestamp_utc": ts_b},  # dup
        ]
        unique, skipped = collector._deduplicate(records)
        assert len(unique) == 2
        assert skipped == 3

    def test_empty_batch_returns_empty(self, collector):
        unique, skipped = collector._deduplicate([])
        assert unique == []
        assert skipped == 0


# ---------------------------------------------------------------------------
# 7. run() — error path returns valid CollectionResult (no crash)
# ---------------------------------------------------------------------------


class TestRunErrorPath:
    def test_run_returns_collection_result_on_stub_error(self, collector):
        """
        Since _detect_access_mode raises NotImplementedError (stub),
        run() must still return a CollectionResult (not propagate the exception)
        and populate the errors list.
        """
        result = collector.run()
        assert isinstance(result, CollectionResult)
        assert result.source == "conduit"
        assert result.records_fetched == 0
        assert result.records_written == 0
        assert len(result.errors) >= 1

    def test_run_result_has_utc_timestamp(self, collector):
        result = collector.run()
        assert result.timestamp_utc.tzinfo is not None
        assert result.timestamp_utc.tzinfo == timezone.utc


# ---------------------------------------------------------------------------
# 8. Data-dictionary scaffold generation
# ---------------------------------------------------------------------------


class TestDataDictionary:
    def test_build_access_section_contains_mode(self, collector):
        ts = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        section = ConduitCollector._build_access_section(REST_API, ts)
        assert REST_API in section

    def test_build_access_section_contains_coordinates(self, collector):
        ts = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        section = ConduitCollector._build_access_section(CSV_EXPORT, ts)
        assert str(JKUAT_LAT) in section
        assert str(JKUAT_LON) in section

    def test_build_access_section_mentions_nasa_power_surrogate(self):
        ts = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        section = ConduitCollector._build_access_section(PAGE_SCRAPE, ts)
        assert "NASA POWER" in section

    def test_build_access_section_includes_tos_note_for_scrape(self):
        ts = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        section = ConduitCollector._build_access_section(PAGE_SCRAPE, ts)
        assert "ToS" in section or "terms" in section.lower()

    def test_build_access_section_includes_sensor_table_for_all_modes(self):
        ts = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        for mode in (REST_API, CSV_EXPORT, PAGE_SCRAPE):
            section = ConduitCollector._build_access_section(mode, ts)
            assert "Sensor Catalogue" in section

    def test_ensure_data_dictionary_creates_file(self, collector, tmp_path, monkeypatch):
        """On first run the data dictionary file should be created."""
        import src.ingest.conduit as conduit_mod

        monkeypatch.setattr(conduit_mod, "_DOCS_DIR", tmp_path)
        monkeypatch.setattr(conduit_mod, "_DATA_DICT_PATH", tmp_path / "data-dictionary.md")

        ts = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        collector._ensure_data_dictionary(REST_API, ts)

        data_dict = tmp_path / "data-dictionary.md"
        assert data_dict.exists()
        content = data_dict.read_text(encoding="utf-8")
        assert REST_API in content

    def test_ensure_data_dictionary_idempotent(self, collector, tmp_path, monkeypatch):
        """Calling _ensure_data_dictionary twice with the same mode must not duplicate the section."""
        import src.ingest.conduit as conduit_mod

        monkeypatch.setattr(conduit_mod, "_DOCS_DIR", tmp_path)
        data_dict_path = tmp_path / "data-dictionary.md"
        monkeypatch.setattr(conduit_mod, "_DATA_DICT_PATH", data_dict_path)

        ts = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        collector._ensure_data_dictionary(REST_API, ts)
        collector._ensure_data_dictionary(REST_API, ts)

        content = data_dict_path.read_text(encoding="utf-8")
        # The section header should appear exactly once
        assert content.count("## Access Method") == 1


class TestDemoMode:
    def test_demo_run_fetches_records(self, env_with_creds, tmp_path, monkeypatch):
        monkeypatch.setenv("CONDUIT_DEMO", "1")
        import src.ingest.conduit as conduit_mod

        monkeypatch.setattr(conduit_mod, "_BRONZE_DIR", tmp_path)
        monkeypatch.setattr(conduit_mod, "_DOCS_DIR", tmp_path)
        monkeypatch.setattr(conduit_mod, "_DATA_DICT_PATH", tmp_path / "data-dictionary.md")
        result = ConduitCollector().run()
        assert result.records_fetched > 0
        assert not result.errors
