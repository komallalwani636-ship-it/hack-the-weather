# Implementation Plan: Conduit Sentinel

## Overview

This plan converts the Conduit Sentinel design into a sequence of coding tasks that a code-generation agent can execute incrementally. Tasks are organised by the 12 project phases (Phase 0–11). Each task builds on the previous ones, ends by wiring the new code into the existing structure, and references the specific requirements and design sections that drive it. Property-based test sub-tasks use `hypothesis` (Python) and are tagged with the property number from the design document.

---

## Tasks

### Phase 0 — Discovery & Data Audit

- [x] 1. Implement Conduit Collector foundation and data dictionary scaffold
  - [x] 1.1 Create `src/ingest/conduit.py` with a `ConduitCollector` class implementing the `Collector` protocol (`run() -> CollectionResult`); read `CONDUIT_EMAIL` and `CONDUIT_PASSWORD` from `os.environ`, raising `ValueError` naming the missing variable if either is absent; define three access-mode constants `REST_API`, `CSV_EXPORT`, `PAGE_SCRAPE`; write the single confirmed method and its retrieval steps to `docs/data-dictionary.md` on first run; include a ToS citation comment before any scraping function
    - _Requirements: 1.1, 1.6, 3.1, 3.2, 19.2_
  - [x] 1.2 Implement Bronze Layer write logic inside `ConduitCollector.run()`: save raw records to `data/bronze/conduit_YYYYMMDDTHHMMSSZ.parquet` (filename includes UTC ISO 8601 timestamp of download); deduplicate by `(source="conduit", timestamp_utc)` before writing; never overwrite an existing Bronze file on failure
    - _Requirements: 1.2, 3.5, 1.7_
  - [x] 1.3 Write `docs/data-dictionary.md` scaffold with sections for each sensor (name, unit, sampling interval, earliest/latest UTC timestamp, missing-data rate 0.00–100.00, JKUAT station latitude `−1.0982` and longitude `37.0144` to four decimal places); populate sensor rows from the first Conduit sample; note NASA POWER and Open-Meteo ERA5 as historical surrogates when Conduit history is absent
    - _Requirements: 1.3, 1.4, 1.5_

- [x] 2. Checkpoint — Phase 0 exit
  - Confirm a raw Conduit sample file exists in `data/bronze/`, `docs/data-dictionary.md` is populated, and access method is documented. Ask the user if questions arise.

---

### Phase 1 — Repository & Environment Setup

- [x] 3. Create repository skeleton and environment files
  - [x] 3.1 Create the full directory tree: `src/ingest/`, `src/processing/`, `src/models/`, `src/decision/`, `src/api/`, `src/llm/`, `src/alerts/`, `notebooks/`, `models/`, `web/`, `tests/`, `.github/workflows/`, `data/bronze/`, `data/silver/`, `data/gold/`; add `.gitkeep` files where needed; add a `.python-version` file pinning `3.11`
    - _Requirements: 2.4, 2.8_
  - [x] 3.2 Write `requirements.txt` pinning every Python dependency to an exact version (e.g. `lightgbm==4.3.0`, `hypothesis==6.100.0`, `fastapi==0.111.0`); write `.env.example` listing every required environment variable with an empty value and a comment stating where to obtain it; add `.env`, `*.key`, `*.pem`, and `**/secrets/` to `.gitignore`
    - _Requirements: 2.1, 2.3, 19.1_
  - [x] 3.3 Write `.github/workflows/ci.yml`: run `ruff` and `black --check` on `src/` and `tests/` on every PR; run `pytest` in a fresh Python 3.11 virtual environment; report status check on the PR before merge
    - _Requirements: 2.2, 2.5, 17.3, 17.6_
  - [x] 3.4 Create a pre-commit config (`.pre-commit-config.yaml`) including `ruff`, `black`, and `detect-secrets` hooks; configure `detect-secrets` to block commits where any staged file contains a string with Shannon entropy > 4.5 and length ≥ 20 matching a known secret pattern
    - _Requirements: 19.4_
  - [x] 3.5 Create `docs/decisions.md` with initial entries for every external service (Supabase, Open-Meteo, Gemini/Groq, Telegram, Hugging Face Hub) documenting free-tier limits and confirming zero cost risk; note Open-Meteo non-commercial constraint
    - _Requirements: 2.7, 20.1, 20.6_

- [x] 4. Checkpoint — Phase 1 exit
  - Run `pip install -r requirements.txt && pytest` in a fresh venv and confirm exit code 0. Ask the user if questions arise.

---

### Phase 2 — Ingestion & Storage

- [x] 5. Implement Open-Meteo and NASA POWER collectors
  - [x] 5.1 Create `src/ingest/openmeteo.py` with `OpenMeteoCollector` implementing the `Collector` protocol; fetch 7-day hourly forecast and ERA5 reanalysis (shortwave radiation, soil moisture proxy) for `JKUAT_LAT = -1.0982`, `JKUAT_LON = 37.0144`; apply retry logic: up to 3 attempts with exponential backoff 5→10→20 s for 5xx/network errors; no retry on 4xx (excluding 429); log errors to GitHub Actions step summary and exit non-zero after retries exhausted
    - _Requirements: 3.3, 3.6, 3.7_
  - [x] 5.2 Create `src/ingest/nasa_power.py` with `NASAPOWERCollector`; fetch daily historical data for JKUAT coordinates covering any date range not yet in the Bronze Layer; determine the missing range by comparing the latest stored UTC date in `data/bronze/` against the current UTC date
    - _Requirements: 3.4_

- [x] 6. Implement ingestion scheduler and Supabase upsert
  - [x] 6.1 Create `src/ingest/scheduler.py` that orchestrates all three collectors in sequence; store all timestamps in UTC; deduplicate by `(source, timestamp_utc)` before writing Parquet; on failure log the error message and UTC timestamp to the GitHub Actions step summary and exit non-zero
    - _Requirements: 3.5, 3.7, 3.8_
  - [x] 6.2 Add Supabase upsert logic in `scheduler.py`: write to the `observations` table keyed on `(source, timestamp_utc)`; when Supabase is unavailable, fall back to Parquet only and include `"storage_fallback": "local_parquet"` in the health payload
    - _Requirements: 3.9, 20.4_
  - [x] 6.3 Create `.github/workflows/ingest.yml` as a cron workflow triggering `scheduler.py` at most once per hour; add a keep-alive scheduled ping to `GET /health` at least every 10 minutes; store all secrets as GitHub Actions encrypted secrets (no secret values in YAML)
    - _Requirements: 3.10, 17.5, 19.3_

- [x] 7. Checkpoint — Phase 2 exit
  - Run two consecutive scheduled ingest runs and confirm no duplicate UTC timestamps in the Bronze Layer Parquet files. Ask the user if questions arise.

---

### Phase 3 — Cleaning & Quality Control

- [x] 8. Implement QC Module
  - [x] 8.1 Create `src/processing/qc.py` with a `QCModule` class and a `process(record: BronzeRecord) -> SilverRecord` method; implement the six flag assignments in strict priority order `MISSING > RANGE_FAIL > CROSS_FAIL > SPIKE > FLATLINE > OK`; hard-code the physical range constants from the design table (humidity 0–100 %, pressure 800–1100 hPa, temperature −10–60 °C, wind 0–60 m/s, SI1145 vis/IR 0–65535, UV 0–255, WBGT −5–55 °C); never delete any Bronze record — total Silver count must equal total Bronze count
    - _Requirements: 4.1, 4.2, 4.7_
  - [x] 8.2 Implement cross-sensor checks inside `QCModule`: rain gauge disagreement `|gauge_1 − gauge_2| > 2 mm/h` → `CROSS_FAIL` on both gauges with the discrepancy logged (UTC timestamp + both values); temperature disagreement > 5 °C across any two of BMX/MCP/SHT → `CROSS_FAIL` on all available temperature readings for that timestamp
    - _Requirements: 4.5, 4.6_
  - [x] 8.3 Implement spike detection (rolling 30-min time-based median, flag if deviation > 5σ) and flatline detection (< 0.01 change for 10+ consecutive readings) in `QCModule`
    - _Requirements: 4.3, 4.4_
  - [x] 8.4 Implement `QCModule.report()` that produces a summary table (% records flagged per sensor per flag type) for use in QC report notebooks; write the Silver Layer Parquet to `data/silver/`
    - _Requirements: 4.8, 4.9_

- [ ] 9. Write property-based tests for QC Module (`tests/test_qc.py`)
  - [ ]* 9.1 Write property test for QC idempotence: for any Bronze record, `qc.process(qc.process(record))` must equal `qc.process(record)` — use `@given(bronze_record_strategy())` with `min_examples=100`
    - **Property 1: QC Idempotence**
    - **Validates: Requirements 4.1**
  - [ ]* 9.2 Write property test for QC completeness: for any batch of Bronze records, `len(silver_batch) == len(bronze_batch)` and every Silver record has a non-null `qc_flag`
    - **Property 2: QC Completeness (No Silent Drops)**
    - **Validates: Requirements 4.2, 4.7**
  - [ ]* 9.3 Write property test for QC flag exclusivity: construct records that trigger multiple flag conditions; assert exactly one flag is assigned per the priority order
    - **Property 3: QC Flag Exclusivity**
    - **Validates: Requirements 4.1, 4.3**

- [x] 10. Checkpoint — Phase 3 exit
  - Run `pytest tests/test_qc.py` and ensure all tests pass; run the QC report notebook and verify the flagged-% summary table is populated. Ask the user if questions arise.

---

### Phase 4 — EDA & Feature Engineering

- [x] 11. Implement Feature Engineer
  - [x] 11.1 Create `src/processing/features.py` with a `FeatureEngineer` class; implement all Gold Layer features from the design table: pressure tendency (1 h, 3 h, 6 h), rolling rainfall (1 h, 3 h, 24 h — `qc_flag = OK` only), humidity delta (1 h), temperature delta (1 h), wind gust ratio (prior 30-min window, sentinel −1 when mean wind = 0), hour-of-day `hour_sin` and `hour_cos`; set features to `NaN` with a logged count when insufficient lookback data exists; write output to `data/gold/features.parquet`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8_
  - [x] 11.2 Implement Open-Meteo join in `FeatureEngineer`: for each UTC hour join `om_temp`, `om_precip_prob`, `om_rh`, `om_sw_rad` from the forecast Parquet; log the count of missing Open-Meteo joins per UTC hour; set each missing column to `NaN`
    - _Requirements: 5.7_
  - [x] 11.3 Implement rolling 30-day bias correction in `FeatureEngineer`: compute per-variable per-UTC-hour rolling mean bias `(conduit_obs − om_forecast)`; produce bias-corrected columns `om_*_bc` and `bias_correction_delta_*`; use bias = 0.0 with `bias_correction_insufficient_data = True` when < 7 days of overlap; use partial correction with `bias_correction_partial_window = True` and `bias_correction_days_used` when 7–29 days available
    - _Requirements: 11.1, 11.2, 11.5, 11.6_
  - [x] 11.4 Update the Gold Layer data dictionary in `docs/data-dictionary.md` with every column name, its derivation formula or source, and its unit/description
    - _Requirements: 5.9_

- [ ] 12. Write property-based tests for Feature Engineer (`tests/test_features.py`)
  - [ ]* 12.1 Write property test for no-leakage invariant: for any time-series, assert that every input record timestamp used to compute feature at row t is ≤ t; use `@given(time_series_strategy())` and inspect `FeatureEngineer.audit_timestamps()`
    - **Property 4: Feature No-Leakage Invariant**
    - **Validates: Requirements 5.1**
  - [ ]* 12.2 Write property test for cyclical hour encoding round-trip: for any integer h in 0–23, decode `(hour_sin, hour_cos)` and assert the recovered hour equals h
    - **Property 5: Cyclical Hour Encoding Round-Trip**
    - **Validates: Requirements 5.6**
  - [ ]* 12.3 Write property test for rolling window metamorphic consistency: for any non-negative rainfall time-series, `|acc_1h[t+1] − acc_1h[t]| ≤ rain_rate_in_interval`
    - **Property 6: Rolling Window Metamorphic Consistency**
    - **Validates: Requirements 5.3**
  - [ ]* 12.4 Write property test for bias correction idempotence: applying `bias_correct(value, delta)` twice with the same delta returns the same result as once
    - **Property 22: Bias Correction Idempotence**
    - **Validates: Requirements 11.1**

- [x] 13. Checkpoint — Phase 4 exit
  - Run `pytest tests/test_features.py`; confirm `data/gold/features.parquet` is written with correct schema and the data dictionary is updated. Ask the user if questions arise.

---

### Phase 5 — Model Development & Training

- [x] 14. Implement M1 — RainRisk LightGBM Classifier (`src/models/rain_risk.py`)
  - [x] 14.1 Create `RainRiskModel` class: define two binary targets `rain_3h` (≥ 1 mm in next 3 h) and `rain_24h` (≥ 10 mm in next 24 h); implement `train(features_df)` using walk-forward validation with an expanding training window (no random shuffle); implement `predict(feature_vector) -> RainRiskPrediction` returning `p_rain_3h` and `p_rain_24h` in [0.0, 1.0]; when Open-Meteo features are all missing, predict using only Conduit features and set `data_quality_warning = "Open-Meteo features missing"`; when all features are unavailable, return a sentinel that the API layer converts to HTTP 503
    - _Requirements: 6.1, 6.4, 6.7, 6.8_
  - [x] 14.2 Implement MLflow logging in `RainRiskModel.train()`: log PR_AUC, recall at highest-precision point where precision ≥ 0.80, Brier score, training data date range, and hyperparameters; write a `models/m1_rain_risk/model_card.md` stating Conduit history length, gaps, geographic scope
    - _Requirements: 6.5, 6.6_

- [ ] 15. Write property-based tests for M1 (`tests/test_models/test_rain_risk.py`)
  - [ ]* 15.1 Write property test for probability range: for any feature vector (including partially missing), assert `0.0 ≤ p_rain_3h ≤ 1.0` and `0.0 ≤ p_rain_24h ≤ 1.0`
    - **Property 7: M1 Probability Range Invariant**
    - **Validates: Requirements 6.1**
  - [ ]* 15.2 Write property test for monotonic rain signal: construct base feature vectors and increase `rain_3h` while holding others constant; assert `p_rain_3h` does not decrease
    - **Property 8: M1 Monotonic Rain Signal**
    - **Validates: Requirements 6.2**

- [x] 16. Implement M2 — Anomaly Detection (`src/models/anomaly.py`)
  - [x] 16.1 Create `AnomalyModel` class: implement rolling z-score baseline with window configurable via `M2_WINDOW_HOURS` env var (default 24, valid range 1–168); combine with an Isolation Forest ensemble to produce `anomaly_score ∈ [0.0, 1.0]`; set `fault_flag = True` when `anomaly_score ≥ 0.5`; independently set `fault_flag = True` on both rain gauge readings when `|gauge_1 − gauge_2| > 2 mm/h`
    - _Requirements: 7.1, 7.2, 7.4_
  - [ ]* 16.2 Write property test for M2 idempotence: applying `AnomalyModel.score(reading)` twice returns the same `anomaly_score` and `fault_flag`
    - **Property 9: M2 Idempotence**
    - **Validates: Requirements 7.1**
  - [ ]* 16.3 Write property test for M2 score range: for any sensor reading (including extreme outliers), assert `0.0 ≤ anomaly_score ≤ 1.0`
    - **Property 10: M2 Score Range Invariant**
    - **Validates: Requirements 7.2**
  - [ ]* 16.4 Write property test for M2 rain gauge cross-check: for pairs where `|g1 − g2| > 2 mm/h`, assert `fault_flag = True`; for pairs where `|g1 − g2| ≤ 2 mm/h` and z-score is normal, assert `fault_flag = False`
    - **Property 11: M2 Rain Gauge Cross-Check Consistency**
    - **Validates: Requirements 7.3**

- [x] 17. Implement M3 — Radiation Calibration (`src/models/radiation_cal.py`)
  - [x] 17.1 Create `RadiationCalModel` class: accept SI1145 visible (0–65535), IR (0–65535), UV (0–255); train a Ridge regression baseline and a LightGBM non-linear correction; label source: NASA POWER shortwave (primary), Open-Meteo as secondary when POWER unavailable; apply post-processing `max(0.0, raw_prediction)` for non-negativity; when SI1145 has `qc_flag != OK` at inference, return Open-Meteo hourly shortwave and set `radiation_source = "open_meteo_fallback"`; log MAE, R², date range, label source to MLflow; write `models/m3_radiation/model_card.md`
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6, 8.7_
  - [ ]* 17.2 Write property test for M3 physical range (daylight): for any SI1145 input combination during daylight hours, assert output ∈ [0.0, 1400.0] W/m²
    - **Property 12: M3 Physical Range**
    - **Validates: Requirements 8.1**
  - [ ]* 17.3 Write property test for M3 non-negativity: for any adversarial SI1145 input that would produce a negative raw prediction, assert clamped output ≥ 0.0
    - **Property 13: M3 Non-Negativity (Clamping)**
    - **Validates: Requirements 8.2**
  - [ ]* 17.4 Write property test for M3 monotonic visible index: fix IR and UV at typical daytime values; increase visible index; assert calibrated radiation output does not decrease
    - **Property 14: M3 Monotonic Visible Index**
    - **Validates: Requirements 8.3**

- [x] 18. Implement M4 — ET0 and Water Balance (`src/models/et0.py`)
  - [x] 18.1 Create `ET0Model` class: implement the FAO-56 Penman-Monteith equation exactly as specified in the design (Rn, G, T, u2, es−ea, Δ, γ); compute daily ET0 in mm/day; accept calibrated radiation from M3 output; maintain the water-balance accumulator `soil_water_t = clamp(soil_water_{t-1} + rain_t − ET0_t × Kc, −150.0, 0.0)` with `soil_water_0 = 0.0`; trigger irrigation advisory when `soil_water < deficit_threshold` (configurable −5 to −100 mm, default −20 mm); compute `irrigation_amount = max(0, abs(soil_water_t))`; set `action = "Irrigate {amount} mm before 08:00 Africa/Nairobi time"`
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 18.2 Implement sensor fallback in `ET0Model`: when any required input has `qc_flag != OK`, substitute the Open-Meteo forecast value and append the field name to `substituted_fields`; log mean absolute difference vs Open-Meteo ET0 and ERA5-Land soil moisture Pearson correlation to MLflow; write `models/m4_et0/model_card.md`
    - _Requirements: 9.4, 9.5, 9.6, 9.7_
  - [ ]* 18.3 Write property test for M4 ET0 physical range: for any inputs in Kenyan highland domain (temp 5–40 °C, RH 10–100 %, wind 0–20 m/s, radiation 0–1000 W/m²), assert `0.0 ≤ ET0 ≤ 15.0 mm/day`
    - **Property 15: M4 ET0 Physical Range**
    - **Validates: Requirements 9.1**
  - [ ]* 18.4 Write property test for M4 water balance closure: for any n-day sequence, assert `sum(rain_t − ET0_t × Kc) == soil_water_n − soil_water_0` to within 1e-6 (before clamping)
    - **Property 16: M4 Water Balance Closure**
    - **Validates: Requirements 9.2**
  - [ ]* 18.5 Write property test for M4 irrigation non-negativity and M4 idempotent recomputation
    - **Property 17: M4 Irrigation Non-Negativity** | **Property 18: M4 Idempotent Recomputation**
    - **Validates: Requirements 9.3, 9.4**

- [x] 19. Implement M5 — Heat Stress Classifier (`src/models/heat.py`)
  - [x] 19.1 Create `HeatStressModel` class: implement WBGT threshold mapping `Low < 28 °C`, `Moderate 28–31.99 °C`, `High 32–34.99 °C`, `Extreme ≥ 35 °C`; when `qc_flag != OK` on WBGT, compute estimated WBGT using the Bernard simplified formula `WBGT_est = 0.567·T + 0.393·e + 3.94` and set `wbgt_source = "estimated"`; write `models/m5_heat/model_card.md` citing the ISO 7933 standard and local adaptations
    - _Requirements: 10.1, 10.2, 10.3, 10.7_
  - [ ]* 19.2 Write property test for M5 threshold boundary coverage: for any WBGT value including exact boundaries (28.0, 32.0, 35.0 °C) and values just below/above, assert exactly one of `Low|Moderate|High|Extreme` is returned
    - **Property 19: M5 Threshold Boundary Coverage**
    - **Validates: Requirements 10.1, 10.2**
  - [ ]* 19.3 Write property test for M5 monotonic risk: for any w1 < w2, assert `risk(w2) ≥ risk(w1)` under the ordering `Low < Moderate < High < Extreme`
    - **Property 20: M5 Monotonic Risk**
    - **Validates: Requirements 10.2**
  - [ ]* 19.4 Write property test for M5 estimated WBGT bounds: for any temp in [0, 50] °C and RH in [0, 100] %, assert estimated WBGT ∈ [−5, 55] °C
    - **Property 21: M5 Estimated WBGT Bounds**
    - **Validates: Requirements 10.3**

- [x] 20. Checkpoint — Phase 5 exit
  - Run all model tests: `pytest tests/test_models/`. Confirm MLflow runs logged and each model card written. Ask the user if questions arise.

---

### Phase 6 — Decision Engine

- [x] 21. Implement Decision Engine rules (`src/decision/rules.py`)
  - [x] 21.1 Create the `Advisory` dataclass with fields `{id: UUID4, type, severity, location, valid_from, valid_until, action, reason, evidence}`; implement `DecisionEngine.evaluate(model_outputs) -> list[Advisory]` with the four rules from the design: (a) `p_rain_3h > 0.70` → `rain_risk / warning / valid_until = now+3h / action = "Delay spraying or harvest drying operations"`; (b) `p_rain_24h > 0.50 AND p_rain_3h ≤ 0.70` → `rain_risk / info`; (c) `water_balance < threshold` → `irrigation / watch / valid_until = now+24h`; (d) `WBGT High or Extreme` → `heat_stress / warning`; (e) `WBGT Low or Moderate` → `heat_stress / info`; return an empty list when no rules fire; allow multiple advisories to fire simultaneously
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 12.8, 12.9_
  - [x] 21.2 Implement evidence attachment: the `evidence` dict stores raw model output values exactly as received from models — no rounding, no transformation; include `observation_timestamp_utc` and `qc_flag` status of all sensor inputs; implement cool-down bypass for M5 level transitions (any change in risk level generates a new advisory immediately regardless of cool-down)
    - _Requirements: 12.4, 12.7, 10.6_
  - [x] 21.3 Write fixture-based unit tests in `tests/test_decision.py` covering every rule with known weather scenarios; verify `type`, `severity`, `valid_from`, `valid_until`, and `action` for each
    - _Requirements: 12.6_
  - [ ]* 21.4 Write property test for Decision Engine evidence integrity: for any model outputs, assert `advisory.evidence[key] == model_output[key]` with no numeric transformation
    - **Property 23: Decision Engine Evidence Integrity**
    - **Validates: Requirements 12.1, 12.7**
  - [ ]* 21.5 Write property test for Decision Engine threshold completeness: for any combination of `p_rain_3h ∈ [0,1]`, `water_balance ∈ [−150, 0]`, `WBGT ∈ [−5, 55]`, assert `evaluate()` returns a list (possibly empty) and never raises
    - **Property 24: Decision Engine Threshold Completeness**
    - **Validates: Requirements 12.8**
  - [ ]* 21.6 Write property test for Decision Engine severity monotonicity: increasing `p_rain_3h` through 0.50 and 0.70 thresholds, assert `rain_risk` advisory severity is non-decreasing under `info < watch < warning`
    - **Property 25: Decision Engine Severity Monotonicity**
    - **Validates: Requirements 12.3, 12.5**

- [x] 22. Checkpoint — Phase 6 exit
  - Run `pytest tests/test_decision.py`. Ask the user if questions arise.

---

### Phase 7 — FastAPI REST API

- [x] 23. Implement FastAPI application and core endpoints (`src/api/main.py`)
  - [x] 23.1 Scaffold `src/api/main.py` with FastAPI app, Pydantic schemas in `src/api/schemas.py`, CORS middleware restricted to `FRONTEND_ORIGIN` env var (HTTP 403 for other origins), and a `SlowAPI` or custom rate limiter (60 req/60 s rolling window per IP → HTTP 429 + `Retry-After` header); auto-generate OpenAPI docs at `/docs`
    - _Requirements: 13.7, 13.9, 13.10_
  - [x] 23.2 Implement `GET /health`: respond within 200 ms with `{"status": "ok", "data_last_updated_utc": "<ISO-8601>", "storage_fallback": null | "local_parquet"}`
    - _Requirements: 13.2, 20.4_
  - [x] 23.3 Implement `GET /observations/latest`: return the most recent `qc_flag = OK` reading per sensor with anomaly score from M2; when no OK reading exists for a sensor, return `null` value and set `data_quality_warning`; cache response for 60 s (second call within TTL responds within 100 ms)
    - _Requirements: 13.3, 13.8, 7.5_
  - [x] 23.4 Implement `GET /observations?from=<ISO>&to=<ISO>`: return Silver Layer records with `qc_flag` values; respond HTTP 422 when `from > to` or range > 7 days; include descriptive error body for each case
    - _Requirements: 13.4, 13.11, 13.12_
  - [x] 23.5 Implement `GET /forecast`: return 7-day bias-corrected forecast with `temp_raw`, `temp_bc`, `bias_correction_delta`, `rh_raw`, `rh_bc`, `sw_rad_raw`, `sw_rad_bc`, `precip_prob`, `bias_correction_insufficient_data`, `bias_correction_partial_window`; set `using_cached_forecast = true` and `cache_age_hours` when using cached data; display "Using cached forecast data" notice when Open-Meteo is unavailable
    - _Requirements: 11.3, 20.2_
  - [x] 23.6 Implement `GET /risk/rain`: return `p_rain_3h`, `p_rain_24h`, `feature_timestamp_utc`, `data_quality_warning`; return HTTP 503 with `{"error": "insufficient_data", "detail": "No features available for inference"}` when all features are unavailable
    - _Requirements: 13.5, 6.8_
  - [x] 23.7 Implement `GET /irrigation` and `GET /advisories`: irrigation endpoint returns ET0, water balance, irrigation required flag, amount, action, Kc, substituted_fields, date; advisories endpoint returns all active advisories ordered by `valid_from` descending with full evidence objects
    - _Requirements: 13.6_

- [ ] 24. Write API property-based tests (`tests/test_api.py`)
  - [ ]* 24.1 Write property test for observation round-trip: for any Silver Layer observation written at timestamp t, `GET /observations?from=t&to=t` must return exactly that observation
    - **Property 26: API Observation Round-Trip**
    - **Validates: Requirements 13.1**
  - [ ]* 24.2 Write property test for endpoint schema conformance: for any valid parameter combination on each of the seven GET endpoints, assert HTTP 200 and JSON body conforming to OpenAPI schema
    - **Property 27: API Endpoint Schema Conformance**
    - **Validates: Requirements 13.2**

- [x] 25. Checkpoint — Phase 7 exit
  - Run `pytest tests/test_api.py`; load Swagger UI at `/docs` and confirm all eight endpoints render without errors. Ask the user if questions arise.

---

### Phase 8 — LLM Assistant & Telegram Bot

- [x] 26. Implement LLM Explainer (`src/llm/explainer.py`)
  - [x] 26.1 Create `LLMExplainer` class with `explain(question: str) -> AssistantResponse`; implement function-calling over the five internal API tools (`get_observations_latest`, `get_rain_risk`, `get_irrigation`, `get_advisories`, `get_forecast`); use the system prompt verbatim from the design (numbers from tools only; say when data missing; same language as question; no credentials in prompts); LLM provider priority: Gemini (`GEMINI_API_KEY`) → Groq (`GROQ_API_KEY`) → templated fallback; cancel LLM call after 15 s and return templated response with `timeout_fallback = True`
    - _Requirements: 14.1, 14.2, 14.6, 14.7_
  - [x] 26.2 Implement Swahili detection and fallback: detect if question contains ≥ 1 valid Swahili sentence; request Swahili response from LLM; if the LLM response contains no valid Swahili sentences, respond in English and set `language_fallback = True`; implement templated fallback string assembled from tool-call results without calling the LLM, set `response_type = "templated"`, return within 2 s when LLM returns HTTP 429 or 503
    - _Requirements: 14.4, 14.5_
  - [x] 26.3 Implement `POST /assistant` route in `src/api/main.py` wiring `LLMExplainer.explain()`; log every tool-call input and output per request for traceability
    - _Requirements: 14.3_
  - [ ]* 26.4 Write property test for LLM no-invented numbers: for any submitted question, mock the LLM to return a response and assert every number in the response is traceable to a logged tool-call result from the same session
    - **Property 28: LLM No Invented Numbers**
    - **Validates: Requirements 14.1, 14.3**
  - [ ]* 26.5 Write property test for LLM fallback availability: mock LLM to return HTTP 429; assert a non-empty `response_type = "templated"` response arrives within 2 s
    - **Property 29: LLM Fallback Availability**
    - **Validates: Requirements 14.2, 14.4**

- [x] 27. Implement Telegram Bot (`src/alerts/telegram.py`)
  - [x] 27.1 Create `TelegramBot` class: read `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (comma-separated list) exclusively from env vars; on each `warning` advisory, send the formatted message (type, severity, action, rain probabilities if applicable, valid_until in EAT) to all subscribed chat IDs; implement a 60-minute per-`(type, chat_id)` cool-down using the `telegram_deliveries` Supabase table; bypass cool-down on advisory type change; retry on HTTP 429/5xx with exponential backoff 2→4→8 s (3 attempts); after retries exhausted, log the failure (advisory id, chat id, UTC timestamp) and discard
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [x] 27.2 Implement the offline queue in `TelegramBot`: when Telegram API is unavailable, queue unsent warning advisories in memory (max 50; drop oldest on overflow); retry delivery on connectivity restoration up to 3 times within a 30-minute window
    - _Requirements: 20.5_
  - [ ]* 27.3 Write property test for Telegram de-duplication: for any advisory type T sent to chat C at time ts, assert no second message of type T is sent to C within 60 minutes of ts
    - **Property 30: Telegram De-duplication Invariant**
    - **Validates: Requirements 15.2**
  - [ ]* 27.4 Write property test for Telegram delivery completeness: for any warning advisory generated more than 60 min after the last delivery of the same type to a chat ID, assert exactly one message is delivered
    - **Property 31: Telegram Delivery Completeness**
    - **Validates: Requirements 15.1**

- [x] 28. Checkpoint — Phase 8 exit
  - Run `pytest tests/test_llm.py tests/test_telegram.py`; submit 10 test questions via `POST /assistant` and confirm zero invented numbers in responses; trigger a test advisory and confirm one Telegram message received on a phone. Ask the user if questions arise.

---

### Phase 9 — React Dashboard

- [x] 29. Scaffold React frontend (`web/`)
  - [x] 29.1 Initialise a Vite + React + TypeScript project in `web/` with Tailwind CSS, Recharts, and Leaflet dependencies; configure the API base URL from a `VITE_API_URL` env var; set up React Router with six routes: `/` (Live Station Panel), `/map`, `/irrigation`, `/alerts`, `/ask`, `/how-it-works`; create `src/context/AppContext.tsx` with the `AppState` interface and `useReducer`-based state management (no external state library)
    - _Requirements: 16.1_
  - [x] 29.2 Implement the global polling loop in `AppContext`: `setInterval(fetchAll, 60_000)` calling all API endpoints; update all state slices via a single reducer dispatch; show the offline banner when `!apiAvailable` or cached data is older than 24 h
    - _Requirements: 16.9, 16.12_
  - [x] 29.3 Implement UTC→`Africa/Nairobi` timestamp conversion utility using `Intl.DateTimeFormat` with `timeZone: "Africa/Nairobi"` and "(EAT)" suffix; use this utility for every displayed timestamp throughout the app
    - _Requirements: 16.11_

- [x] 30. Implement Dashboard screens
  - [x] 30.1 Implement `LiveStationPanel` (`web/src/pages/LiveStationPanel.tsx`): render one `SensorCard` per sensor showing current value, a Recharts `LineChart` sparkline of the past 24 h, UTC update timestamp, and a `QualityBadge` coloured per the mapping: `OK` → `bg-green-500`, `SPIKE/FLATLINE` → `bg-yellow-400`, `RANGE_FAIL/CROSS_FAIL` → `bg-orange-500`, `MISSING` → `bg-red-600`; include accessible labels with all colour-coded badges (WCAG 2.1 AA, 4.5:1 contrast minimum)
    - _Requirements: 16.2, 16.10_
  - [x] 30.2 Implement `MapView` (`web/src/pages/MapView.tsx`): render a Leaflet map with OpenStreetMap tiles; place a fixed marker at `JKUAT_LAT = -1.0982`, `JKUAT_LON = 37.0144`; when active advisories exist, render `AdvisoryMarker` components coloured by severity (`info` = blue, `watch` = yellow, `warning` = red)
    - _Requirements: 16.3_
  - [x] 30.3 Implement `IrrigationPlanner` (`web/src/pages/IrrigationPlanner.tsx`): render a `CropSelector` (predefined crop types and growth stages from the M4 model card); display a Recharts `BarChart` of the 7-day irrigation plan in mm/day computed by `GET /irrigation` with the user-selected Kc; call the API on crop/stage change
    - _Requirements: 16.4_
  - [x] 30.4 Implement `AlertsFeed` (`web/src/pages/AlertsFeed.tsx`): display all active advisories ordered by `valid_from` descending; each `AdvisoryCard` shows type, severity badge, action text, and `data_last_updated` timestamp; poll via the 60-s loop
    - _Requirements: 16.5_
  - [x] 30.5 Implement `AskSentinel` (`web/src/pages/AskSentinel.tsx`): text input submits to `POST /assistant`; display LLM response in a `MessageBubble`; when `response_type = "templated"`, show a notice "AI assistant is temporarily unavailable; showing data summary"
    - _Requirements: 16.6_
  - [x] 30.6 Implement `HowItWorks` (`web/src/pages/HowItWorks.tsx`): render the Data → Insight → Action → Impact pipeline populating each stage with actual live numbers fetched from the API (not static placeholder text)
    - _Requirements: 16.7_
  - [x] 30.7 Verify mobile responsiveness: confirm the full app renders without horizontal scrolling at 375 px viewport width using Tailwind's mobile-first defaults; use `sm:` breakpoint for two-column sensor grid and `md:` for sidebar navigation
    - _Requirements: 16.8_

- [x] 31. Checkpoint — Phase 9 exit
  - Manually verify each of the six screens at 375 px width; confirm polling updates LiveStationPanel and AlertsFeed every 60 s without a full reload; confirm offline banner appears when API URL is unreachable. Ask the user if questions arise.

---

### Phase 10 — Deployment & CI/CD

- [x] 32. Containerise and configure deployment
  - [x] 32.1 Write a `Dockerfile` at the repository root: build and start the FastAPI application with Uvicorn; do not embed any secret values — all secrets injected at runtime via environment variables; confirm `/health` responds within 5 s on a warm instance from a different network
    - _Requirements: 17.1, 17.4, 17.8_
  - [x] 32.2 Update `.github/workflows/ci.yml` with a `deploy` job that runs only after lint, type-check, and test steps all pass on push to `main`; deploy the Docker image to Render or Hugging Face Spaces and the `web/` build to Vercel or Netlify using the appropriate CLI or API; inject secrets from GitHub Actions encrypted secrets
    - _Requirements: 17.2, 17.3, 19.3_
  - [x] 32.3 Write `README.md` with a step-by-step quickstart (clone → copy `.env.example` → fill credentials → single command to run full stack locally in ≤ 15 min); include attribution for Conduit/JHUB Africa, Open-Meteo, NASA POWER, and OpenStreetMap with links to their terms of use; confirm live OpenAPI docs page at `/docs` loads all eight endpoints on the deployed URL
    - _Requirements: 17.7, 18.6, 17.9_

- [x] 33. Checkpoint — Phase 10 exit
  - Access the deployed API `/health` from a different network; confirm HTTP 200 within 5 s; open the live Dashboard URL; confirm the Vite build loads. Ask the user if questions arise.

---

### Phase 11 — Validation, Docs & Pitch

- [x] 34. Validation and documentation
  - [x] 34.1 Run the M1 back-test on all available historical rain events and write `docs/validation_report.md` documenting: number of events tested, hits, misses, mean lead time in hours for correct warnings
    - _Requirements: 18.1_
  - [x] 34.2 Write `docs/impact.md` describing: target user groups, specific decisions enabled, expected behaviour/outcome changes, and estimated cost (water, crop loss, safety risk) of not having the system
    - _Requirements: 18.2_
  - [x] 34.3 Write `docs/demo-script.md` with a step-by-step 3-minute demo walkthrough covering: live data update, triggered rain-risk advisory, Telegram alert receipt, irrigation planner, and AI assistant chat; include a cached-snapshot fallback mode activated by a single URL parameter or keystroke for offline demo conditions
    - _Requirements: 18.3, 18.4_
  - [x] 34.4 Write the Devpost submission text in `docs/devpost.md` structured to address all five judging criteria (Problem & Relevance, Innovation, Technical & Conduit use, Scalability, Impact) with specific verifiable claims mapped to system features
    - _Requirements: 18.5_
  - [x] 34.5 Final validation: from a fresh clone, follow the README quickstart, run all tests (confirm all pass), and view the dashboard at a local URL — all steps must be in the README
    - _Requirements: 18.7_

- [x] 35. Final checkpoint — all phases complete
  - Ensure all tests pass, all docs are present, demo rehearsed twice, Devpost text drafted. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but all 31 correctness properties are covered by those optional sub-tasks — they represent meaningful quality assurance.
- Each task references specific requirements for traceability; requirement numbers map to the 20 requirements in `requirements.md`.
- Property numbers (e.g. **Property 7**) map directly to the "Correctness Properties" section of `design.md`.
- All PBT sub-tasks use `hypothesis` with `@settings(max_examples=100)` via the CI profile defined in `tests/conftest.py`.
- `fast-check` is used for TypeScript PBTs in the `web/` directory (not listed separately as the frontend design does not define formal correctness properties).
- Checkpoints are included after each phase boundary; each is a non-coding gate task that should pause for human verification before the next phase begins.
- The dependency graph below schedules only leaf coding sub-tasks; top-level phase tasks and checkpoints are excluded.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 2, "tasks": ["5.1", "5.2"] },
    { "id": 3, "tasks": ["6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3"] },
    { "id": 5, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 7, "tasks": ["11.1", "11.2"] },
    { "id": 8, "tasks": ["11.3", "11.4", "12.1", "12.2", "12.3", "12.4"] },
    { "id": 9, "tasks": ["14.1", "16.1", "17.1", "18.1", "19.1"] },
    { "id": 10, "tasks": ["14.2", "15.1", "15.2", "16.2", "16.3", "16.4", "17.2", "17.3", "17.4", "18.2", "18.3", "18.4", "18.5", "19.2", "19.3", "19.4"] },
    { "id": 11, "tasks": ["21.1", "21.2"] },
    { "id": 12, "tasks": ["21.3", "21.4", "21.5", "21.6"] },
    { "id": 13, "tasks": ["23.1"] },
    { "id": 14, "tasks": ["23.2", "23.3", "23.4", "23.5", "23.6", "23.7"] },
    { "id": 15, "tasks": ["24.1", "24.2", "26.1", "26.2"] },
    { "id": 16, "tasks": ["26.3", "27.1", "27.2"] },
    { "id": 17, "tasks": ["26.4", "26.5", "27.3", "27.4"] },
    { "id": 18, "tasks": ["29.1"] },
    { "id": 19, "tasks": ["29.2", "29.3"] },
    { "id": 20, "tasks": ["30.1", "30.2", "30.3", "30.4", "30.5", "30.6"] },
    { "id": 21, "tasks": ["30.7", "32.1"] },
    { "id": 22, "tasks": ["32.2"] },
    { "id": 23, "tasks": ["32.3"] },
    { "id": 24, "tasks": ["34.1", "34.2", "34.3", "34.4"] },
    { "id": 25, "tasks": ["34.5"] }
  ]
}
```
