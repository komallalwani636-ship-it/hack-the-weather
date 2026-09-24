# Requirements Document

## Introduction

Conduit Sentinel is a hyper-local climate intelligence service that ingests live data from the JKUAT Conduit weather station and free satellite/reanalysis sources, then produces farm irrigation advice, heavy-rain and heat-stress early warnings, and a plain-language AI assistant. The system is delivered as a React dashboard, Telegram alert bot, and REST API. Every tool, API, and service used must be free. Target users are smallholder farmers, the JKUAT farm and campus community, water managers, and students.

The requirements below cover all twelve implementation phases: data discovery and audit, repository setup, ingestion and storage, cleaning and quality control, exploratory analysis and feature engineering, model development and training (five ML models), the decision engine, the API layer, the LLM assistant and Telegram alerts, the frontend dashboard, deployment and CI/CD, and final validation with documentation and pitch preparation.

---

## Glossary

- **Conduit_Portal**: The web portal at `conduit.jhubafrica.com` operated by JHUB Africa that exposes JKUAT weather-station sensor readings.
- **Conduit_Collector**: The Python module (`src/ingest/conduit.py`) that authenticates with and pulls data from the Conduit_Portal.
- **Open_Meteo_Collector**: The Python module (`src/ingest/openmeteo.py`) that fetches hourly forecast and ERA5 reanalysis data from the Open-Meteo free API.
- **NASA_POWER_Collector**: The Python module (`src/ingest/nasa_power.py`) that fetches daily historical meteorological data from the NASA POWER API.
- **Ingestion_Scheduler**: The GitHub Actions cron workflow (`ingest.yml`) that triggers collectors on a schedule.
- **Bronze_Layer**: The raw, unmodified ingested data stored as Parquet files in `data/bronze/`.
- **Silver_Layer**: Cleaned, unit-normalised, QC-flagged data stored as Parquet files in `data/silver/`.
- **Gold_Layer**: Model-ready feature tables stored as Parquet files in `data/gold/`.
- **QC_Module**: The Python module (`src/processing/qc.py`) that applies physical range checks, spike/flatline detection, and cross-sensor validation, writing `qc_flag` columns.
- **Feature_Engineer**: The Python module (`src/processing/features.py`) that derives engineered features from Silver_Layer data.
- **M1_RainRisk**: The LightGBM classifier model that estimates the probability of rain ≥ 1 mm in the next 3 hours and ≥ 10 mm in the next 24 hours.
- **M2_Anomaly**: The rolling-z-score and Isolation Forest model that detects sensor anomalies and faults.
- **M3_RadiationCal**: The Ridge/LightGBM regression model that converts SI1145 indices (visible, IR, UV) to calibrated shortwave radiation in W/m².
- **M4_ET0**: The FAO-56 Penman-Monteith implementation and daily water-balance model that computes reference evapotranspiration (ET0) and irrigation need in mm.
- **M5_HeatStress**: The rule-based heat-stress classifier that maps WBGT and forecast temperature/humidity to a risk level category.
- **Decision_Engine**: The Python module (`src/decision/`) that converts model outputs into structured advisory objects.
- **Advisory**: A structured object with fields `{id, type, severity, location, valid_from, valid_to, action, reason, evidence}` produced by the Decision_Engine.
- **API_Server**: The FastAPI application (`src/api/main.py`) that exposes REST endpoints and auto-generated OpenAPI documentation.
- **LLM_Explainer**: The Python module (`src/llm/explainer.py`) that uses function-calling over API endpoints to answer plain-language questions without fabricating values.
- **Telegram_Bot**: The Python module (`src/alerts/telegram.py`) that sends de-duplicated warning advisories to subscribed Telegram chat IDs.
- **Dashboard**: The React + Vite + Tailwind frontend application in `web/` that displays live readings, a map with advisory markers, the irrigation planner, the alerts feed, and the AI assistant chat.
- **Data_Dictionary**: The file `docs/data-dictionary.md` documenting sensor names, units, sampling intervals, date ranges, and missing-data rates.
- **Model_Card**: A per-model document describing training data, known limitations, and evaluation metrics.
- **UTC**: Coordinated Universal Time, used for all internal timestamps.
- **Africa_Nairobi**: The IANA timezone identifier `Africa/Nairobi` (UTC+3), used for all display timestamps.
- **ET0**: Reference evapotranspiration computed by FAO-56 Penman-Monteith, in mm/day.
- **WBGT**: Wet-bulb globe temperature, a composite heat-stress index available as a direct sensor reading from the Conduit station.
- **QC_Flag**: A column appended to Silver_Layer records indicating data quality status; valid values are `OK`, `RANGE_FAIL`, `SPIKE`, `FLATLINE`, `CROSS_FAIL`, or `MISSING`.
- **PR_AUC**: Precision-recall area under the curve, the primary evaluation metric for M1_RainRisk.
- **Brier_Score**: A probability calibration metric for M1_RainRisk; lower is better.
- **Walk_Forward_Validation**: A time-based cross-validation strategy where the training window expands and the test window advances chronologically; random shuffling is never used.
- **HF_Hub**: Hugging Face Hub, used as the free model registry and large-dataset host.
- **Supabase**: The free-tier Postgres database service used as the serving database.
- **MLflow**: The local-file-store experiment tracking system used during model development.

---

## Requirements

### Requirement 1: Data Discovery and Access Documentation

**User Story:** As a developer, I want to document exactly how Conduit sensor data is accessed, so that all team members and automated agents can reliably fetch data without manual intervention.

#### Acceptance Criteria

1. WHEN a developer creates a Conduit account and logs in, THE Conduit_Collector SHALL confirm whether data is accessible via API endpoint, CSV export, or page scraping, and record exactly one confirmed access method and its retrieval steps in `docs/data-dictionary.md`.
2. WHEN a Conduit data sample is downloaded, THE Conduit_Collector SHALL store the raw file in `data/bronze/` with a filename that includes the UTC timestamp of the download in ISO 8601 format (YYYYMMDDTHHMMSSZ).
3. THE Data_Dictionary SHALL document the following for each available sensor: sensor name, physical unit, sampling interval in minutes, earliest available timestamp in ISO 8601 UTC format, latest available timestamp in ISO 8601 UTC format, and percentage of missing records expressed as a value between 0.00 and 100.00.
4. WHEN the Conduit_Portal provides no historical data prior to the date of first access, THE Conduit_Collector SHALL log live readings at each available sampling interval continuously from the time of first access, and the Data_Dictionary SHALL note that NASA POWER and Open-Meteo ERA5 are used as historical training surrogates for any date range before first access.
5. THE Data_Dictionary SHALL record the latitude and longitude of the JKUAT Conduit station each to four decimal places (e.g. ±DD.DDDD), and these coordinates SHALL be the fixed values used for all external data requests.
6. WHEN page scraping is the only available access method, THE Conduit_Collector SHALL include a code comment citing the Conduit portal's terms of service URL and the team's written determination that scraping is permitted for the hackathon purpose before any scraping function is defined.
7. IF the confirmed access method recorded in `docs/data-dictionary.md` is unavailable or returns no data during a retrieval attempt, THEN THE Conduit_Collector SHALL log an error message indicating the access method, the UTC timestamp of the failure, and the HTTP status code or failure reason, and SHALL NOT overwrite any previously stored raw files in `data/bronze/`.

---

### Requirement 2: Repository and Environment Setup

**User Story:** As a developer, I want a reproducible project environment and a clean repository structure, so that any team member can check out the repo and run the project on a fresh machine.

#### Acceptance Criteria

1. THE Repository SHALL contain a `requirements.txt` that pins every Python dependency to an exact version (e.g., `lightgbm==4.3.0`), so that `pip install -r requirements.txt` installs a reproducible environment.
2. WHEN `pip install -r requirements.txt && pytest` is executed in a fresh Python 3.11 virtual environment with no pre-installed packages, or in GitHub Actions CI, THE CI_Workflow SHALL exit with code 0.
3. THE Repository SHALL contain a `.env.example` file listing every required environment variable name with an empty value and a comment describing where to obtain the value and the exact source instruction (e.g., "Sign up at X, then copy the API key from Settings → API"); the `.env` file itself SHALL be listed in `.gitignore`.
4. THE Repository SHALL follow the directory structure defined in the architecture document: `src/ingest/`, `src/processing/`, `src/models/`, `src/decision/`, `src/api/`, `src/llm/`, `src/alerts/`, `notebooks/`, `models/`, `web/`, `tests/`, `.github/workflows/`, `data/bronze/`, `data/silver/`, `data/gold/`.
5. WHEN a pull request is opened against the `main` branch, THE CI_Workflow SHALL run `ruff` and `black --check` on all Python files under `src/` and `tests/` and fail the check if any lint or formatting error is found.
6. WHEN Phase 1 work begins, THE Repository SHALL already contain a GitHub issue for each of the twelve phases, with a title matching the phase name and a body containing at least one bullet point referencing the relevant exit criteria from the architecture document.
7. IF a dependency, service, or account with any anticipated monetary cost is required, THEN THE Developer SHALL document the cost risk in `docs/decisions.md` and obtain written team confirmation (as a comment on the PR or issue) before adding it to `requirements.txt` or any workflow file.
8. THE `requirements.txt` SHALL specify Python 3.11.x as the runtime baseline via a `python_requires` constraint or a `.python-version` file in the repository root.

---

### Requirement 3: Data Ingestion and Scheduled Collection

**User Story:** As a data engineer, I want automated, idempotent data collection from all sources on an hourly schedule, so that the serving database and Parquet files are always current without duplicate records.

#### Acceptance Criteria

1. WHEN the Ingestion_Scheduler cron fires, THE Conduit_Collector SHALL authenticate using credentials read from the `CONDUIT_EMAIL` and `CONDUIT_PASSWORD` environment variables and fetch all records available since the last successful run.
2. IF `CONDUIT_EMAIL` or `CONDUIT_PASSWORD` environment variables are not set at startup, THEN THE Conduit_Collector SHALL raise a `ValueError` naming the missing variable, log the error to the GitHub Actions step summary, and exit with a non-zero code without attempting any network request.
3. WHEN the Ingestion_Scheduler cron fires, THE Open_Meteo_Collector SHALL fetch the current 7-day hourly forecast and the most recent ERA5 reanalysis records (including shortwave radiation and soil moisture proxy) for the JKUAT station coordinates.
4. WHEN the Ingestion_Scheduler cron fires, THE NASA_POWER_Collector SHALL fetch daily historical meteorological data for the JKUAT station coordinates covering any date range not already present in the Bronze_Layer, determined by comparing the latest stored timestamp against the current UTC date.
5. WHEN a collector writes records to the Bronze_Layer, THE Ingestion_Scheduler SHALL store each record's timestamp in UTC and SHALL NOT create a duplicate record if a record with the same source and UTC timestamp already exists in the Bronze_Layer Parquet file.
6. WHEN a collector fetch fails due to a network error or HTTP 5xx response, THE Collector SHALL retry up to three times with exponential backoff starting at 5 seconds (delays: 5 s, 10 s, 20 s) before marking the run as failed. WHEN a collector fetch fails due to an HTTP 4xx response (excluding 429), THE Collector SHALL NOT retry and SHALL immediately mark the run as failed with the status code logged.
7. WHEN a collector run fails after all retries, THE Ingestion_Scheduler SHALL write the error message and UTC timestamp to a GitHub Actions step summary and exit with a non-zero code so the failure is visible in the Actions dashboard.
8. WHEN two consecutive scheduled Ingestion_Scheduler runs complete successfully, THE Bronze_Layer SHALL contain no duplicate UTC timestamps for the same data source.
9. WHEN data is written to Supabase, THE Ingestion_Scheduler SHALL use an upsert operation keyed on `(source, timestamp_utc)` so that re-running the job does not create duplicate rows.
10. THE Ingestion_Scheduler SHALL run at a maximum frequency of once per hour to stay within free-tier rate limits of all data providers.

---

### Requirement 4: Data Cleaning and Quality Control

**User Story:** As a data scientist, I want every sensor reading to carry a machine-readable quality flag, so that models and advisories only use data that has passed physical validation.

#### Acceptance Criteria

1. WHEN the QC_Module processes a Bronze_Layer record, THE QC_Module SHALL write the record to the Silver_Layer with a `qc_flag` column set to exactly one of: `OK`, `RANGE_FAIL`, `SPIKE`, `FLATLINE`, `CROSS_FAIL`, or `MISSING`, applying the flags in priority order: `MISSING` > `RANGE_FAIL` > `CROSS_FAIL` > `SPIKE` > `FLATLINE` > `OK`.
2. THE QC_Module SHALL assign `qc_flag = RANGE_FAIL` to any record where relative humidity is outside the range 0–100 %, atmospheric pressure is outside 800–1100 hPa, or any sensor reading exceeds the physical maximum stated in the Data_Dictionary for that sensor.
3. WHEN a sensor reading deviates from the rolling time-based 30-minute median by more than five standard deviations, THE QC_Module SHALL assign `qc_flag = SPIKE` to that record.
4. WHEN a sensor produces values that change by less than 0.01 (in the sensor's native unit) for ten or more consecutive readings, THE QC_Module SHALL assign `qc_flag = FLATLINE` to those records.
5. WHEN the two rain gauge readings for the same timestamp differ by more than 2 mm/h, THE QC_Module SHALL assign `qc_flag = CROSS_FAIL` to both gauge readings and log the discrepancy with the UTC timestamp and the two values.
6. WHEN temperature readings from two or more of the BMX, MCP, and SHT sensors are all available for the same timestamp and any two of the available readings differ by more than 5 °C, THE QC_Module SHALL assign `qc_flag = CROSS_FAIL` to all available temperature readings for that timestamp.
7. THE QC_Module SHALL NEVER silently delete any Bronze_Layer record; all records, including those with `qc_flag != OK`, SHALL be present in the Silver_Layer, and the total record count in the Silver_Layer SHALL equal the total record count in the Bronze_Layer.
8. IF downstream models or the Decision_Engine require sensor data, THEN THE Feature_Engineer SHALL filter to only records where `qc_flag = OK` unless the explicit purpose is anomaly analysis.
9. WHEN a QC report notebook is executed, THE QC_Module SHALL produce a summary table showing the percentage of records flagged per sensor per flag type for the available date range.

#### Correctness Properties

- **Idempotence**: Applying QC_Module to the same Bronze_Layer record twice SHALL produce the same Silver_Layer record both times (the QC transform is a pure function of its inputs).
- **Completeness**: For all Bronze_Layer records, a corresponding Silver_Layer record SHALL exist with a non-null `qc_flag`; no record shall be silently dropped (record count Bronze = record count Silver).
- **Flag Exclusivity**: For each Silver_Layer record, exactly one `qc_flag` value SHALL be assigned per the priority ordering in criterion 1.

---

### Requirement 5: Feature Engineering

**User Story:** As a data scientist, I want a Gold_Layer feature table derived from clean sensor readings, so that ML models can be trained without target leakage.

#### Acceptance Criteria

1. THE Feature_Engineer SHALL produce a `data/gold/features.parquet` file containing only features computed from data at time ≤ t for each row t, with no future data leakage.
2. THE Feature_Engineer SHALL compute the following pressure-tendency features for each timestamp t: pressure change over the prior 1 hour, prior 3 hours, and prior 6 hours, all in hPa.
3. THE Feature_Engineer SHALL compute rolling rainfall accumulation over the prior 1 hour, prior 3 hours, and prior 24 hours using only `qc_flag = OK` rain gauge readings within each respective time-based rolling window.
4. THE Feature_Engineer SHALL compute the humidity delta and temperature delta over the prior 1 hour for each timestamp.
5. THE Feature_Engineer SHALL compute the wind gust ratio as the ratio of the maximum wind gust to the mean wind speed over the prior time-based 30-minute window; WHEN mean wind speed is zero, THE Feature_Engineer SHALL set the wind gust ratio to a sentinel value of -1.
6. THE Feature_Engineer SHALL encode the hour of day as two cyclical features: `sin(2π × hour / 24)` and `cos(2π × hour / 24)`.
7. WHEN Open-Meteo hourly forecast features (temperature, precipitation probability, relative humidity, shortwave radiation) are available for the same UTC hour as a Conduit observation, THE Feature_Engineer SHALL join them; WHEN they are not available, THE Feature_Engineer SHALL set each missing Open-Meteo feature to `NaN` and log the count of missing Open-Meteo joins per UTC hour.
8. WHEN a feature value cannot be computed due to insufficient preceding data, THE Feature_Engineer SHALL set the affected feature to `NaN` and log the count of missing feature values per column. The minimum lookback required for each feature is: pressure tendency (1 h, 3 h, 6 h windows require 1, 3, 6 hours respectively), rolling rainfall (1, 3, 24 hours), humidity/temperature delta (1 hour), wind gust ratio (30 minutes).
9. THE Gold_Layer data dictionary SHALL list every column name, its derivation formula or source, and its physical unit or description.

#### Correctness Properties

- **No Leakage Invariant**: For all rows in `features.parquet`, the timestamp of every input record used to compute a feature SHALL be strictly less than or equal to the row's own timestamp t.
- **Cyclical Encoding Round-Trip**: For any integer hour h in 0–23, `round(atan2(sin_hour, cos_hour) × 24 / (2π)) mod 24 = h`.
- **Rolling Window Metamorphic**: For any two consecutive non-NaN rainfall accumulation values at times t and t+1, the 1-hour rolling accumulation at t+1 SHALL differ from t by at most the rain rate observed in the single interval between t and t+1.

---

### Requirement 6: Rain-Risk Nowcast Model (M1)

**User Story:** As a farmer, I want a probabilistic forecast of heavy rain in the next 3 and 24 hours, so that I can decide whether to delay field operations such as spraying or harvest drying.

#### Acceptance Criteria

1. THE M1_RainRisk model SHALL output two probability values per inference: `p_rain_3h` (probability of ≥ 1 mm rainfall in the next 3 hours) and `p_rain_24h` (probability of ≥ 10 mm rainfall in the next 24 hours), both in the range [0.0, 1.0].
2. WHEN M1_RainRisk is evaluated on the held-out time period using Walk_Forward_Validation, THE M1_RainRisk model SHALL achieve a PR_AUC greater than or equal to the persistence baseline PR_AUC on the same held-out period, or the Model_Card SHALL explicitly state that the model does not beat the baseline and the system falls back to the persistence baseline.
3. WHEN M1_RainRisk is evaluated on the held-out time period, THE M1_RainRisk model SHALL achieve a Brier_Score less than or equal to the persistence baseline Brier_Score, or the Model_Card SHALL document the underperformance and the fallback strategy.
4. THE M1_RainRisk model SHALL be trained using Walk_Forward_Validation with no random shuffling of the time series.
5. WHEN M1_RainRisk training is executed, THE MLflow run SHALL log: PR_AUC, the recall value at the highest-precision operating point on the PR curve where precision ≥ 0.80, Brier_Score, training data date range, and model hyperparameters.
6. THE M1_RainRisk Model_Card SHALL state the Conduit history length used, any gaps in training data, and the geographic scope (JKUAT station only).
7. WHEN Open-Meteo forecast features are unavailable at inference time but at least one Conduit feature is available, THE M1_RainRisk model SHALL produce a prediction using only the available Conduit features and SHALL include a `data_quality_warning` field in the response set to `"Open-Meteo features missing"`.
8. WHEN all model input features are unavailable at inference time, THE M1_RainRisk model SHALL return an error response with HTTP 503 and a body containing `{"error": "insufficient_data", "detail": "No features available for inference"}` rather than producing a prediction.

#### Correctness Properties

- **Probability Range Invariant**: For all inputs, `0.0 ≤ p_rain_3h ≤ 1.0` and `0.0 ≤ p_rain_24h ≤ 1.0`.
- **Monotonic Rain Signal**: WHEN 3-hour rolling rainfall is increased while all other features are held constant, `p_rain_3h` SHALL not decrease.
- **Calibration Property**: For predictions grouped into decile bins of `p_rain_3h`, the mean observed rain occurrence rate within each bin SHALL be within 0.15 of the bin's midpoint probability on the held-out set.

---

### Requirement 7: Anomaly and Sensor-Fault Detection Model (M2)

**User Story:** As a data engineer, I want automated detection of sensor anomalies and faults, so that degraded readings are flagged before they reach model inputs or user-facing displays.

#### Acceptance Criteria

1. THE M2_Anomaly model SHALL assign an anomaly score in the range [0.0, 1.0] to each sensor reading, where higher scores indicate greater likelihood of a fault or anomaly.
2. WHEN the two rain gauges disagree by more than 2 mm/h for the same timestamp, THE M2_Anomaly model SHALL set a `fault_flag = True` for both gauge readings, independent of the anomaly score.
3. WHEN M2_Anomaly is evaluated on a dataset with known injected faults, THE M2_Anomaly model SHALL achieve a precision of at least 0.70 and a recall of at least 0.60 on detecting the injected faults.
4. THE M2_Anomaly model SHALL use a rolling z-score baseline combined with an Isolation Forest ensemble; a `fault_flag = True` SHALL be set when the anomaly score is ≥ 0.5; the rolling window SHALL be configurable via an environment variable with a default of 24 hours and a valid range of 1–168 hours.
5. WHEN M2_Anomaly produces a fault_flag for a sensor reading, THE API_Server SHALL include the fault_flag and the anomaly score in the `/observations/latest` response for that reading.
6. THE M2_Anomaly Model_Card SHALL document the fault-injection methodology used to evaluate precision and recall, including the types and rates of injected faults.

#### Correctness Properties

- **Idempotence**: Applying M2_Anomaly to the same sensor reading twice SHALL produce the same anomaly score and fault_flag both times.
- **Score Range Invariant**: For all inputs, `0.0 ≤ anomaly_score ≤ 1.0`.
- **Rain Gauge Cross-Check Consistency**: For all pairs of simultaneous rain gauge readings where `|gauge_1 - gauge_2| > 2 mm/h`, `fault_flag = True` SHALL be set; for all pairs where `|gauge_1 - gauge_2| ≤ 2 mm/h` and neither triggers the z-score rule, `fault_flag = False`.

---

### Requirement 8: Radiation Calibration Model (M3)

**User Story:** As a data scientist, I want the SI1145 sensor indices converted to calibrated shortwave radiation in W/m², so that ET0 calculations and solar-energy estimates use physically meaningful values.

#### Acceptance Criteria

1. THE M3_RadiationCal model SHALL accept SI1145 visible index (integer, 0–65535), IR index (integer, 0–65535), and UV index (integer, 0–255) as inputs and output a calibrated shortwave radiation estimate in W/m².
2. WHEN M3_RadiationCal is evaluated on the held-out time period, THE M3_RadiationCal model SHALL achieve a Mean Absolute Error (MAE) of no more than 50 W/m² and an R² of at least 0.80 against shortwave radiation labels, or the Model_Card SHALL document the underperformance honestly.
3. THE M3_RadiationCal model SHALL be trained using only SI1145 readings with `qc_flag = OK`.
4. WHEN M3_RadiationCal training is executed, THE MLflow run SHALL log: MAE, R², training data date range, and the label source; WHEN both NASA POWER and Open-Meteo labels are available, NASA POWER SHALL be used as the primary label source.
5. IF M3_RadiationCal produces a negative shortwave radiation estimate, THEN THE M3_RadiationCal model SHALL clamp the output to 0.0 W/m² and log a warning with the raw negative prediction value.
6. THE M3_RadiationCal Model_Card SHALL note that SI1145 outputs are uncalibrated indices and document the label source used for supervision.
7. WHEN the SI1145 sensor is degraded (`qc_flag != OK`) at inference time, THE M3_RadiationCal model SHALL return the Open-Meteo shortwave radiation value for the same UTC hour as a fallback and SHALL set `radiation_source = "open_meteo_fallback"` in the response.

#### Correctness Properties

- **Physical Range Invariant**: For all inputs during daylight hours, the calibrated radiation output SHALL be in the range [0.0, 1400.0] W/m².
- **Non-Negativity**: For all inputs, the output SHALL be ≥ 0.0 W/m² (enforced by clamping).
- **Monotonic Visible Index**: WHEN the SI1145 visible index is increased while IR and UV are held constant at typical daytime values, the calibrated radiation output SHALL not decrease.

---

### Requirement 9: ET0 and Water-Balance Model (M4)

**User Story:** As a farmer, I want to know how much water my crops need and whether I should irrigate, so that I can reduce water waste and avoid crop stress.

#### Acceptance Criteria

1. THE M4_ET0 model SHALL compute daily reference evapotranspiration (ET0) in mm/day using the FAO-56 Penman-Monteith equation, taking as inputs: Conduit temperature (°C), relative humidity (%), wind speed (m/s), atmospheric pressure (hPa), and M3_RadiationCal-calibrated shortwave radiation (W/m²).
2. THE M4_ET0 model SHALL maintain a daily water-balance accumulator as: `soil_water_t = clamp(soil_water_{t-1} + rain_t - ET0_t × Kc, min=-150.0, max=0.0)`, where `rain_t` is the daily `qc_flag = OK` rainfall total, `ET0_t` is the FAO-56 daily ET0, `Kc` is the crop coefficient supplied by the user, and `soil_water_0 = 0.0 mm` at initialisation.
3. WHEN the daily water balance falls below a configurable deficit threshold (configurable in the range −5.0 to −100.0 mm, default −20 mm), THE M4_ET0 model SHALL compute an irrigation recommendation of `max(0, abs(water_balance))` mm and set the irrigation advisory action to `"Irrigate {amount} mm before 08:00 Africa/Nairobi time"`.
4. WHEN M4_ET0 daily ET0 is compared to the Open-Meteo ET0 field for the same day and location, THE M4_ET0 model SHALL log the mean absolute difference in mm/day and include the comparison in the MLflow run.
5. WHEN ERA5-Land soil moisture is available for the same coordinates and date, THE M4_ET0 model SHALL compute the Pearson correlation between the water-balance soil-water estimate and the ERA5-Land soil moisture anomaly and log it to MLflow.
6. THE M4_ET0 Model_Card SHALL list all FAO-56 constants and equations used, the default Kc values per crop type supported by the irrigation planner, and any assumptions made when sensor data is missing.
7. WHEN any required M4_ET0 input sensor is flagged `qc_flag != OK`, THE M4_ET0 model SHALL substitute the Open-Meteo forecast value for that variable and SHALL include a `substituted_fields` list in the advisory evidence object.

#### Correctness Properties

- **Physical Range Invariant**: For all inputs within normal Kenyan highland climate ranges (temp 5–40 °C, RH 10–100 %, wind 0–20 m/s, radiation 0–1000 W/m²), `0.0 ≤ ET0 ≤ 15.0 mm/day`.
- **Water Balance Closure**: For any sequence of n days, the sum of `(rain_t - ET0_t × Kc)` over those days SHALL equal `soil_water_n - soil_water_0` to within floating-point precision of 1e-6 mm (before clamping).
- **Irrigation Non-Negativity**: For all states of the water balance, the irrigation recommendation SHALL be ≥ 0.0 mm.
- **Idempotent Recomputation**: Recomputing the water balance over the same date range with the same inputs SHALL produce the same daily ET0 and soil_water values.

---

### Requirement 10: Heat-Stress Classification Model (M5)

**User Story:** As a farm worker or campus user, I want to receive an alert when heat-stress conditions are dangerous, so that I can rest, hydrate, and avoid working outdoors during peak heat.

#### Acceptance Criteria

1. THE M5_HeatStress model SHALL classify heat-stress risk into four levels: `Low`, `Moderate`, `High`, and `Extreme`, based on the WBGT reading from the Conduit station.
2. THE M5_HeatStress model SHALL assign risk levels using the following WBGT thresholds: `Low` for WBGT < 28 °C, `Moderate` for 28 °C ≤ WBGT < 32 °C, `High` for 32 °C ≤ WBGT < 35 °C, `Extreme` for WBGT ≥ 35 °C.
3. WHEN the Conduit WBGT sensor reading has `qc_flag != OK`, THE M5_HeatStress model SHALL compute an estimated WBGT from Open-Meteo forecast temperature and relative humidity using the simplified Bernard formula, and SHALL set `wbgt_source = "estimated"` in the advisory evidence.
4. WHEN M5_HeatStress classifies a reading as `Low` or `Moderate`, THE Decision_Engine SHALL generate an Advisory with `severity = "info"` and an action message stating the current risk level.
5. WHEN M5_HeatStress classifies a reading as `High` or `Extreme`, THE Decision_Engine SHALL generate an Advisory with `severity = "warning"` and an action message stating the risk level and recommending one or more of the following protective actions: rest in shade, drink water every 15–20 minutes, avoid outdoor physical work during peak heat hours (10:00–15:00 EAT).
6. WHEN the M5_HeatStress risk level changes from one classification to another, THE Decision_Engine SHALL generate a new advisory regardless of the cool-down period (default 60 minutes) that applies to repeated warnings of the same level.
7. THE M5_HeatStress Model_Card SHALL cite the heat-stress threshold standard used (e.g., ISO 7933 or equivalent) and note any adaptations for the local climate.

#### Correctness Properties

- **Threshold Boundary Invariant**: For all WBGT inputs, the risk level SHALL be exactly one of `Low`, `Moderate`, `High`, `Extreme`, with no gaps or overlaps in the threshold boundaries.
- **Monotonic Risk**: WHEN WBGT is increased and all other inputs are held constant, the risk level SHALL not decrease.
- **Estimated WBGT Bounds**: For all valid temperature (0–50 °C) and humidity (0–100 %) inputs, the estimated WBGT SHALL be in the range [−5, 55] °C.

---

### Requirement 11: Local Bias Correction of Open-Meteo Forecasts

**User Story:** As a data scientist, I want Open-Meteo forecasts bias-corrected against Conduit observations, so that the corrected forecast reflects local micro-climate conditions at the JKUAT site.

#### Acceptance Criteria

1. THE Feature_Engineer SHALL compute a rolling 30-day mean bias between each of the following Open-Meteo hourly forecast variables and the corresponding Conduit observation for the same variable and UTC hour: temperature (°C), relative humidity (%), wind speed (m/s), shortwave radiation (W/m²), and precipitation (mm/h).
2. WHEN Open-Meteo forecast data is used in model inputs or advisories, THE Feature_Engineer SHALL apply the rolling bias correction to produce a locally downscaled forecast value.
3. WHEN bias correction is applied to a forecast variable, THE API_Server SHALL include both the raw Open-Meteo value and the bias-corrected value in the `/forecast` response, along with the `bias_correction_delta` field showing the signed correction applied.
4. THE MLflow run for bias correction SHALL log the mean absolute error of the raw forecast versus the bias-corrected forecast against Conduit observations for each corrected variable, demonstrating measurable improvement.
5. WHEN fewer than 7 days of overlapping Conduit and Open-Meteo data are available, THE Feature_Engineer SHALL use a bias correction of 0.0 (no correction) and set a `bias_correction_insufficient_data = true` flag in the forecast response.
6. WHEN 7 to 29 days of overlapping data are available, THE Feature_Engineer SHALL apply a partial bias correction using the available overlapping days and set a `bias_correction_partial_window = true` flag in the forecast response indicating the number of days used.

#### Correctness Properties

- **Idempotent Correction**: Applying the bias correction twice to the same forecast value with the same rolling bias SHALL return the same corrected value as applying it once.
- **Direction of Improvement Metamorphic**: For all bias-corrected variables on the held-out period, the mean absolute error of the bias-corrected forecast SHALL be less than or equal to the mean absolute error of the raw forecast.

---

### Requirement 12: Decision Engine and Advisory Generation

**User Story:** As a farmer or water manager, I want machine-generated advisories with clear actions and supporting evidence, so that I can make confident, data-backed decisions without needing to interpret raw sensor data.

#### Acceptance Criteria

1. WHEN M1_RainRisk `p_rain_3h` exceeds 0.70, THE Decision_Engine SHALL generate an Advisory with `type = "rain_risk"`, `severity = "warning"`, `valid_from` set to the current UTC timestamp, `valid_until` set to 3 hours after `valid_from`, and `action` set to `"Delay spraying or harvest drying operations"`.
2. WHEN M4_ET0 computes a water-balance deficit exceeding the configured threshold (default −20 mm), THE Decision_Engine SHALL generate an Advisory with `type = "irrigation"`, `severity = "watch"`, `valid_from` set to the current UTC timestamp, `valid_until` set to 24 hours after `valid_from`, and `action` stating the irrigation amount in mm and the recommended application time window (UTC start and end hours).
3. WHEN M5_HeatStress classifies the current WBGT as `High` or `Extreme`, THE Decision_Engine SHALL generate an Advisory with `type = "heat_stress"`, `severity = "warning"`, and `action` stating the risk level and one or more recommended protective actions from the predefined set (rest in shade, drink water every 15–20 minutes, avoid outdoor work 10:00–15:00 EAT).
4. EVERY Advisory produced by the Decision_Engine SHALL include an `evidence` object containing: the model output values and thresholds that triggered the advisory, the UTC timestamp of the triggering observation, and the `qc_flag` status of all sensor inputs used.
5. IF M1_RainRisk `p_rain_24h` exceeds 0.50 and `p_rain_3h` is below 0.70, THEN THE Decision_Engine SHALL produce an Advisory with `severity = "info"` and `type = "rain_risk"` notifying users of elevated but non-urgent rain probability.
6. WHEN the Decision_Engine is executed with fixture data representing known weather scenarios, THE unit tests SHALL verify that each defined rule produces the expected Advisory `type`, `severity`, `valid_from`, `valid_until`, and `action` fields.
7. THE Decision_Engine SHALL NOT modify the model output values in the `evidence` object; the evidence SHALL contain the raw values returned by the models.
8. WHEN no model outputs exceed any advisory threshold, THE Decision_Engine SHALL return an empty advisory list, not an error.
9. WHEN multiple advisory rules fire simultaneously (e.g., both rain_risk and heat_stress thresholds are exceeded), THE Decision_Engine SHALL generate one Advisory per rule, each with its own `type`, `severity`, and `evidence` object.

#### Correctness Properties

- **Evidence Integrity**: For all generated advisories, the model output values in `evidence` SHALL exactly match the values that triggered the rule (no rounding or transformation in the evidence object).
- **Threshold Completeness**: For all combinations of M1 `p_rain_3h`, M4 water balance, and M5 WBGT, at least one advisory rule SHALL apply or the Decision_Engine SHALL return an empty list — there is no undefined state.
- **Severity Ordering Metamorphic**: WHEN `p_rain_3h` is increased from 0.50 to 0.80, the advisory severity SHALL transition from `info` to `warning` and SHALL not transition in the reverse direction as p increases.

---

### Requirement 13: REST API Layer

**User Story:** As a frontend developer or third-party integrator, I want a documented REST API, so that I can query live observations, forecasts, risk scores, and advisories programmatically.

#### Acceptance Criteria

1. THE API_Server SHALL expose the following endpoints: `GET /health`, `GET /observations/latest`, `GET /observations` (with `from` and `to` query parameters), `GET /forecast`, `GET /risk/rain`, `GET /irrigation`, `GET /advisories`, and `POST /assistant`.
2. WHEN a client sends `GET /health`, THE API_Server SHALL respond with HTTP 200 and a JSON body containing `{"status": "ok", "data_last_updated_utc": "<ISO-8601 timestamp>"}` within 200 ms.
3. WHEN a client sends `GET /observations/latest`, THE API_Server SHALL respond with the most recent `qc_flag = OK` reading for each sensor, the UTC timestamp, and the anomaly score from M2_Anomaly; WHEN no `qc_flag = OK` reading exists for a sensor, THE API_Server SHALL return HTTP 200 with that sensor's value set to `null` and a `data_quality_warning` field.
4. WHEN a client sends `GET /observations` with valid `from` and `to` ISO-8601 timestamps and the requested range spans no more than 7 days, THE API_Server SHALL return all Silver_Layer records in that time range with their `qc_flag` values included.
5. WHEN a client sends `GET /risk/rain`, THE API_Server SHALL return the latest M1_RainRisk `p_rain_3h` and `p_rain_24h` values, the feature timestamp, and the `data_quality_warning` field if any input features were missing.
6. WHEN a client sends `GET /advisories`, THE API_Server SHALL return all active advisories ordered by `valid_from` descending, with each advisory including its full `evidence` object.
7. THE API_Server SHALL generate OpenAPI documentation automatically at `GET /docs`, and the Swagger UI SHALL load without errors.
8. WHEN the same `GET /observations/latest` request is made twice within 60 seconds, THE API_Server SHALL serve the second response from cache and respond within 100 ms.
9. THE API_Server SHALL enforce CORS to allow requests only from the configured frontend origin (set via environment variable `FRONTEND_ORIGIN`); requests from other origins SHALL receive HTTP 403.
10. WHEN a client exceeds 60 requests within a rolling 60-second window to any endpoint, THE API_Server SHALL respond with HTTP 429 and a `Retry-After` header set to the number of seconds until the client's request count resets below the limit.
11. WHEN a client sends `GET /observations` with a `from` timestamp later than `to`, THE API_Server SHALL respond with HTTP 422 and a JSON error body describing the invalid parameter.
12. WHEN a client sends `GET /observations` with a date range spanning more than 7 days, THE API_Server SHALL respond with HTTP 422 and a JSON error body stating the maximum allowed range.

#### Correctness Properties

- **Round-Trip Observation Retrieval**: For any observation written to the Silver_Layer at timestamp t, `GET /observations?from=t&to=t` SHALL return exactly that observation in the response body.
- **Cache Consistency**: For any two consecutive calls to `GET /observations/latest` within the cache TTL window, the response bodies SHALL be identical.
- **Endpoint Completeness**: For all seven GET endpoints, a request with valid parameters SHALL return HTTP 200 and a JSON body conforming to the OpenAPI schema for that endpoint.

---

### Requirement 14: LLM Assistant

**User Story:** As a farmer or student, I want to ask plain-language questions about current weather and farm decisions, so that I can get understandable guidance without needing to read raw numbers or charts.

#### Acceptance Criteria

1. WHEN a client sends `POST /assistant` with a `question` string, THE LLM_Explainer SHALL call one or more of the following API endpoints to retrieve current data: `/observations/latest`, `/risk/rain`, `/irrigation`, `/advisories`, `/forecast`, and compose an answer using only the values returned by those endpoints.
2. THE LLM_Explainer system prompt SHALL instruct the LLM to use only numbers from tool results and to explicitly state when data is missing rather than fabricating values.
3. WHEN 10 test questions covering farm irrigation, rain risk, and heat stress are submitted to `POST /assistant`, the LLM_Explainer SHALL produce answers that contain no numerical values not present in the API endpoint responses used during the same request.
4. WHEN the Gemini or Groq free-tier quota is exhausted, THE LLM_Explainer SHALL fall back to a templated text response constructed from the API data without calling the LLM, set `response_type = "templated"` in the response body, and return the response within 2 seconds.
5. WHEN the LLM_Explainer is asked a question containing at least one valid Swahili sentence, THE LLM_Explainer SHALL attempt a Swahili response; IF the LLM returns a response that does not contain any valid Swahili sentences, THEN THE LLM_Explainer SHALL respond in English and set `language_fallback = true`.
6. THE LLM_Explainer SHALL not pass raw Conduit credentials, API keys, or secret values to the LLM in any prompt or tool-call payload.
7. WHEN `POST /assistant` does not return a response within 15 seconds (including LLM call time), THE LLM_Explainer SHALL cancel the LLM call and return a templated response with `response_type = "templated"` and `timeout_fallback = true`.

#### Correctness Properties

- **No Invented Numbers**: For all assistant responses, every numerical value in the response body SHALL be traceable to a specific API endpoint call made during the same request session (verifiable by logging tool-call inputs and outputs).
- **Fallback Availability**: WHEN the LLM API returns an HTTP 429 or HTTP 503 error, THE LLM_Explainer SHALL produce a non-empty templated response within 2 seconds.

---

### Requirement 15: Telegram Alert Bot

**User Story:** As a farmer subscribed to Conduit Sentinel alerts, I want to receive a Telegram message when a high-severity weather advisory is issued, so that I am warned even when I am not viewing the dashboard.

#### Acceptance Criteria

1. WHEN the Decision_Engine generates an Advisory with `severity = "warning"`, THE Telegram_Bot SHALL send the advisory `action` and `severity` fields as a formatted Telegram message to all subscribed chat IDs within 5 minutes of the advisory's `valid_from` timestamp.
2. THE Telegram_Bot SHALL implement a cool-down period of 60 minutes per advisory `type` per chat ID, measured from the UTC timestamp of the last successful delivery of that type to that chat ID, so that the same advisory type is not sent more than once per hour to the same chat ID.
3. WHEN the advisory `type` changes (e.g., from `rain_risk` to `heat_stress`), THE Telegram_Bot SHALL send the new alert immediately regardless of the cool-down period for the previous type.
4. THE Telegram_Bot SHALL read the `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (a comma-separated list of one or more chat IDs) values exclusively from environment variables and SHALL NOT hard-code or log these values.
5. WHEN a Telegram API call fails with a retryable error (HTTP 429 or 5xx), THE Telegram_Bot SHALL retry up to three times with exponential backoff starting at 2 seconds (delays: 2 s, 4 s, 8 s); WHEN all retries are exhausted, THE Telegram_Bot SHALL log the failure with the advisory id, chat ID, and UTC timestamp, and discard the message.
6. WHEN a test advisory is submitted to the Telegram_Bot in a test environment, the integration test SHALL confirm that exactly one Telegram message was sent and that the message body contains the advisory `action` text.

#### Correctness Properties

- **De-duplication Invariant**: For any advisory of type T sent to chat ID C at time ts, no second message of the same type T SHALL be sent to chat ID C within 60 minutes of ts.
- **Alert Delivery Completeness**: For all advisories with `severity = "warning"`, exactly one Telegram message SHALL be sent to each subscribed chat ID (within the cool-down constraint) — no warning advisory is silently dropped.

---

### Requirement 16: Frontend Dashboard

**User Story:** As a farmer or student, I want a mobile-friendly web dashboard that shows live weather data, current advisories, an irrigation planner, and a chat assistant, so that I can access actionable insights from any device without technical knowledge.

#### Acceptance Criteria

1. THE Dashboard SHALL display the following screens accessible via navigation: (1) Live Station Panel, (2) Map with Advisory Markers, (3) Irrigation Planner, (4) Alerts Feed, (5) Ask Sentinel chat, (6) How It Works.
2. THE Live Station Panel SHALL show the current value for each available sensor, a sparkline of the past 24 hours, the UTC timestamp of the most recent data update, and a colour-coded data-quality badge: green for `OK`, yellow for `SPIKE` or `FLATLINE`, orange for `RANGE_FAIL` or `CROSS_FAIL`, red for `MISSING`.
3. THE Map SHALL render using Leaflet with OpenStreetMap tiles and SHALL display a marker at the JKUAT station coordinates; WHEN an active advisory exists, THE Map SHALL display the advisory marker with a colour corresponding to its severity (`info` = blue, `watch` = yellow, `warning` = red).
4. THE Irrigation Planner SHALL allow the user to select a crop type and growth stage from a predefined list and SHALL display the weekly irrigation water plan in mm/day for the next 7 days, computed by M4_ET0 with the user-selected Kc.
5. THE Alerts Feed SHALL display all active advisories ordered by `valid_from` descending, with each entry showing the advisory type, severity badge, action text, and the `data_last_updated` timestamp.
6. THE Ask Sentinel chat screen SHALL submit the user's question to `POST /assistant` and display the response; WHEN `response_type = "templated"` is returned, THE Dashboard SHALL show a notice stating "AI assistant is temporarily unavailable; showing data summary".
7. THE How It Works screen SHALL display the Data → Insight → Action → Impact pipeline with the actual current numbers from the latest API responses, not static placeholder text.
8. THE Dashboard SHALL be fully functional on a screen width of 375 px (iPhone SE equivalent) without horizontal scrolling.
9. WHEN the API is unavailable or the last cached data is older than 24 hours, THE Dashboard SHALL display a banner stating "Data unavailable — showing last cached snapshot" and render the most recently cached API data.
10. ALL interactive elements on the Dashboard SHALL meet WCAG 2.1 AA colour-contrast requirements (minimum contrast ratio 4.5:1 for normal text).
11. THE Dashboard SHALL display all timestamps in Africa/Nairobi local time with the label "(EAT)" appended, storing and computing in UTC internally.
12. THE Dashboard SHALL poll the API at a fixed interval of 60 seconds and update the Live Station Panel and Alerts Feed with the latest data without requiring a full page reload.

---

### Requirement 17: Deployment and CI/CD

**User Story:** As a developer, I want the API and frontend deployed to publicly accessible URLs with automated builds on push, so that the live demo is always up to date and any team member can trigger a deployment.

#### Acceptance Criteria

1. THE API_Server SHALL be containerised with a `Dockerfile` in the repository root that builds and starts the FastAPI application.
2. WHEN a commit is pushed to the `main` branch and all lint, type-check, and test steps pass, THE CI_Workflow SHALL deploy the API to Render or Hugging Face Spaces and the Dashboard to Vercel or Netlify.
3. WHEN a commit is pushed to the `main` branch, THE CI_Workflow SHALL run lint, type-check, and test steps as a prerequisite before deployment is triggered.
4. WHEN the deployed API URL is accessed from a network different from the deployment network on a warm instance, THE API_Server SHALL respond to `GET /health` with HTTP 200 within 5 seconds.
5. THE CI_Workflow SHALL include a keep-alive scheduled ping to `GET /health` on the deployed API URL at least once every 10 minutes to prevent free-tier sleep.
6. WHEN a pull request is opened, THE CI_Workflow SHALL run lint and tests and report the status check result on the pull request before merge.
7. THE Repository SHALL contain a `README.md` that provides a step-by-step quickstart enabling any developer to clone the repo, copy `.env.example` to `.env`, fill in credentials, and run the full stack locally with a single command within 15 minutes.
8. THE Dockerfile SHALL not embed any secret values; all secrets SHALL be injected at runtime via environment variables.
9. WHEN the API is deployed, the live OpenAPI docs page at `/docs` SHALL load and display all seven GET endpoints and the POST `/assistant` endpoint without errors.

---

### Requirement 18: Validation, Documentation, and Pitch Preparation

**User Story:** As a hackathon judge, I want to see honest performance metrics, a clear impact narrative, and a working live demo, so that I can evaluate the project against the judging criteria.

#### Acceptance Criteria

1. THE M1_RainRisk back-test SHALL be run on all available historical rain events and SHALL produce a report in `docs/validation_report.md` documenting: the number of events tested, the number of hits (correct warnings), the number of misses, and the mean lead time in hours for correct warnings.
2. THE `docs/impact.md` file SHALL describe: the target user groups, the specific decisions enabled by the system, what changes in user behaviour or outcomes are expected, and the estimated cost (in water, crop loss, or safety risk) of not having the system.
3. THE `docs/demo-script.md` file SHALL document a step-by-step 3-minute demo walkthrough covering: live data update, a triggered rain-risk advisory, the Telegram alert, the irrigation planner, and the AI assistant chat.
4. WHEN the demo is rehearsed, the demo script SHALL be executable end-to-end in under 3 minutes without pausing, with a cached-snapshot fallback mode activated by a single keystroke or URL parameter for offline demo conditions.
5. THE Devpost submission text SHALL be structured to address each of the five judging criteria (Problem & Relevance, Innovation, Technical & Conduit use, Scalability, Impact) with specific, verifiable claims mapped to features of the system.
6. THE `README.md` SHALL include attribution for all data sources: Conduit/JHUB Africa, Open-Meteo, NASA POWER, and OpenStreetMap, with links to their respective terms of use.
7. WHEN a fresh clone of the repository is made and the README quickstart is followed, a developer SHALL be able to run all tests (all passing) and view the dashboard at a local URL without any steps not documented in the README.

---

### Requirement 19: Security and Secret Management

**User Story:** As a developer, I want all secrets managed through environment variables and never committed to the repository, so that credentials are not exposed in git history.

#### Acceptance Criteria

1. THE Repository's `.gitignore` SHALL include `.env`, `*.key`, `*.pem`, and `**/secrets/` so that secret files are never tracked.
2. IF any Python module requires a secret (Conduit credentials, Gemini/Groq API key, Telegram token, Supabase URL/key, HF token), THEN THE module SHALL read it from `os.environ` or a `.env` file loaded by `python-dotenv`; any missing required variable SHALL raise a `ValueError` with a message naming the missing variable and referencing `.env.example`.
3. THE CI_Workflow SHALL store all secrets as GitHub Actions encrypted secrets and inject them as environment variables at runtime; no secret value SHALL appear in any workflow YAML file or step log.
4. WHEN a pre-commit hook runs, THE pre-commit config SHALL include a secret-scanning step (e.g., `detect-secrets`) that blocks the commit if any staged file contains a string with a Shannon entropy greater than 4.5 bits per character and a length of at least 20 characters matching a known secret pattern.
5. THE `docs/decisions.md` file SHALL log the date and rationale for every external service or API key added to the project.

---

### Requirement 20: Free-Tier Compliance and Graceful Degradation

**User Story:** As a project stakeholder, I want the system to operate entirely within free-tier limits and degrade gracefully when any single service is unavailable, so that the project satisfies the hackathon constraint and remains reliable during the demo.

#### Acceptance Criteria

1. THE System SHALL use only services and tools listed in the free-tier stack defined in the architecture document; WHEN a new service is needed, THE Developer SHALL verify its free-tier terms and document the limits in `docs/decisions.md` before integrating it.
2. WHEN Open-Meteo is unavailable, THE System SHALL continue to serve advisories and observations using only Conduit data and cached forecasts no older than 24 hours, and SHALL display a "Using cached forecast data" notice in all affected API responses and Dashboard widgets.
3. WHEN the LLM free-tier quota is exhausted, THE LLM_Explainer SHALL switch to templated responses (as specified in Requirement 14) without returning an error to the user.
4. WHEN Supabase is unavailable, THE API_Server SHALL fall back to reading from the most recent Gold_Layer Parquet file on disk and SHALL include `"storage_fallback": "local_parquet"` in the `/health` response.
5. WHEN the Telegram API is unavailable, THE Telegram_Bot SHALL queue unsent warning advisories in memory (up to a maximum of 50 messages; if the queue is full, the oldest message is dropped) and retry delivery when connectivity is restored, up to a maximum of three retries within a 30-minute window.
6. THE System SHALL include a note in `docs/decisions.md` and the `README.md` acknowledging that Open-Meteo's free tier is for non-commercial use, and confirming that its use is appropriate for this hackathon context.
