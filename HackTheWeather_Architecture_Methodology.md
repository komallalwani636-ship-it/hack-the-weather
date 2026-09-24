# Conduit Sentinel: System Architecture & Phase-wise Methodology
**Hack The Weather 2026 | Theme: From Data to Impact | Constraint: every tool, API and service must be free**

> **How to use this file:** give it to an AI coding agent as the single source of truth. The agent works phase by phase, must satisfy each phase's *Exit Criteria* before moving on, and follows the *Agent Operating Rules* (section 9).

---

## 1. Project Definition

**Working name:** Conduit Sentinel
**One-liner:** A hyper-local climate intelligence service that turns live JKUAT Conduit weather-station data into (a) farm irrigation advice and (b) heavy-rain / heat-stress early warnings, delivered by dashboard, Telegram alerts and a plain-language AI assistant.

**Data → Insight → Action → Impact (the bonus criterion):**

| Stage | What the system does |
|---|---|
| Data | Conduit sensors (rain x2, temperature, humidity, pressure, wind, solar SI1145, WBGT) + free satellite/reanalysis data |
| Insight | ML nowcast of rain risk, anomaly detection, FAO-56 evapotranspiration and water balance |
| Action | "Irrigate 12 mm tomorrow morning", "Heavy rain likely in 3 h: delay spraying", heat-stress alert |
| Impact | Less water wasted, fewer crop losses, earlier warning for the community |

**Target users:** smallholder farmers and the JKUAT farm/campus, water managers, students.

### Facts about the Conduit data (verified from the public portal)
- The portal (`conduit.jhubafrica.com`) lists: 2 rain gauges (instant, daily total, prior totals), temperature (BMX, MCP, SHT, wet bulb, WBGT), wind speed/direction/gust, solar (SI1145 visible, IR, UV), pressure (BMX), humidity (SHT).
- **Data access requires a free account (Login / Sign Up).** No public API is documented on the landing page. Phase 0 must confirm whether data is available by API, CSV export or dashboard only.
- **The portal does not list a soil-moisture sensor**, although the hackathon brief mentions soil moisture. The design therefore does not depend on one: soil moisture is estimated from a water-balance model and validated against a satellite/reanalysis proxy. If the team finds soil-moisture data after login, it plugs into the same pipeline.
- SI1145 outputs are uncalibrated indices, not W/m². A calibration model (Phase 5) converts them to usable radiation.

---

## 2. Architecture

```
                         ┌───────────────────────────────┐
  DATA SOURCES           │ 1. Conduit (primary, required)│
                         │ 2. Open-Meteo (forecast+ERA5) │
                         │ 3. NASA POWER (history, rad.) │
                         │ 4. CHIRPS / Sentinel-2 (opt.) │
                         └───────────────┬───────────────┘
                                         ▼
  INGESTION        Python collectors  ──  scheduled by GitHub Actions cron
                                         ▼
  STORAGE          Bronze (raw)  →  Silver (cleaned, QC-flagged)  →  Gold (features)
                   Parquet files in repo/HF dataset + Supabase Postgres (serving)
                                         ▼
  INTELLIGENCE     M1 Rain-risk nowcast │ M2 Anomaly & sensor QC │ M3 Radiation calibration
                   M4 ET0 + water balance (FAO-56) │ M5 Heat-stress (WBGT rules)
                                         ▼
  DECISION ENGINE  Rules + model outputs → advisories {type, severity, location, action, why}
                                         ▼
  SERVING          FastAPI (REST + OpenAPI)   ──►  LLM explainer (Gemini/Groq free tier)
                                         ▼
  DELIVERY         React dashboard + map │ Telegram bot alerts │ Public JSON API
```

**Design principles:** (1) physics first, ML second, so results are explainable; (2) every advisory carries a "why" and the data behind it; (3) the LLM only narrates numbers returned by the API and never invents values; (4) everything degrades gracefully if a source is down.

---

## 3. Free Tech Stack

| Layer | Choice | Cost / key |
|---|---|---|
| Repo, CI, scheduler | GitHub + GitHub Actions (public repo) | Free |
| Language | Python 3.11 (backend, ML), TypeScript (frontend) | Free |
| Data/ML libs | pandas, pyarrow, numpy, scikit-learn, LightGBM, statsmodels, `pvlib`/own FAO-56 code | Free |
| Experiment tracking | MLflow (local file store) | Free |
| Model training compute | Google Colab or Kaggle Notebooks (free CPU/GPU) | Free |
| Model registry / dataset hosting | Hugging Face Hub | Free, token |
| Database | Supabase Postgres free tier (fallback: SQLite / DuckDB) | Free, keys |
| API | FastAPI + Uvicorn + Pydantic | Free |
| Frontend | React + Vite + Tailwind + Recharts + Leaflet (OpenStreetMap tiles) | Free, no key |
| Backend hosting | Render free web service or Hugging Face Spaces (Docker) | Free |
| Frontend hosting | Vercel Hobby, Netlify or GitHub Pages | Free |
| Alerts | Telegram Bot API | Free, token |
| LLM | Google Gemini API free tier (AI Studio) or Groq free tier; offline fallback: Ollama | Free, key |
| Weather/history | Open-Meteo (no key), NASA POWER (no key) | Free |
| Satellite (optional) | Microsoft Planetary Computer STAC (Sentinel-2) or Copernicus Data Space | Free account |
| Docs / diagrams | Markdown + Mermaid in GitHub | Free |

> Free-tier limits and terms change. **Agent must check each provider's current limits before depending on it**, and Open-Meteo's free tier is for non-commercial use (fine for the hackathon; note it in the "scale" section of the pitch).

### API keys and secrets
Store only in `.env` (git-ignored) and GitHub Actions Secrets. Commit `.env.example` with empty values. **Never commit a key.**

| Variable | Where to get it | Used for |
|---|---|---|
| `CONDUIT_EMAIL`, `CONDUIT_PASSWORD` (or token/CSV path) | Sign up on the Conduit portal | Primary data |
| `GEMINI_API_KEY` or `GROQ_API_KEY` | Google AI Studio / Groq console | LLM explainer |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | @BotFather on Telegram | Alerts |
| `SUPABASE_URL`, `SUPABASE_KEY` | Supabase project settings | Serving DB |
| `HF_TOKEN` | Hugging Face settings | Model/dataset upload |
| `COPERNICUS_USER/PASS` (optional) | Copernicus Data Space | Sentinel-2 |

Open-Meteo, NASA POWER, OpenStreetMap need no key.

---

## 4. Repository Structure

```
conduit-sentinel/
├── README.md                # pitch + quickstart
├── docs/                    # architecture.md, data-dictionary.md, impact.md, demo-script.md
├── data/
│   ├── bronze/              # raw pulls (git-ignored if large)
│   ├── silver/              # cleaned + QC flags
│   └── gold/                # model-ready features
├── src/
│   ├── ingest/              # conduit.py, openmeteo.py, nasa_power.py, (sentinel.py)
│   ├── processing/          # clean.py, qc.py, features.py
│   ├── models/              # rain_risk.py, anomaly.py, radiation_cal.py, et0.py, heat.py
│   ├── decision/            # rules.py, advisories.py
│   ├── api/                 # main.py, routes/, schemas.py
│   ├── llm/                 # explainer.py, prompts.py
│   └── alerts/              # telegram.py
├── notebooks/               # 01_eda, 02_training (Colab/Kaggle runnable)
├── models/                  # small artifacts + model cards (large ones on HF Hub)
├── web/                     # React app
├── tests/
├── .github/workflows/       # ingest.yml (cron), ci.yml, deploy.yml
├── .env.example
├── requirements.txt
└── Dockerfile
```

---

## 5. Phased Methodology

Time boxes assume a ~48-hour hackathon; stretch or compress proportionally if the team has pre-event time. Phases 0 to 2 can start before the event.

### Phase 0: Discovery & Data Audit (0 to 3 h)
**Tasks:** create Conduit account; find how to get data (API, CSV export, page scraping is a last resort and must respect the site's terms); download the longest history available; record sampling interval, date range, missing-data rate, units and sensor list in `docs/data-dictionary.md`; choose 1 to 2 coordinates (JKUAT station) for external data.
**Exit criteria:** a raw Conduit sample file exists in `data/bronze/`, the data dictionary is written, and access method is documented. If no history is available, the agent proceeds by logging live data continuously from now and uses NASA POWER/Open-Meteo history for training (see Phase 5).

### Phase 1: Repo & Environment (3 to 5 h)
**Tasks:** create GitHub repo, folder skeleton, `requirements.txt`, `.env.example`, pre-commit (ruff, black), issue board with one issue per phase; enable Actions.
**Exit criteria:** `pip install -r requirements.txt && pytest` passes on a clean machine and in CI.

### Phase 2: Ingestion & Storage (5 to 10 h)
**Tasks:** write collectors for Conduit, Open-Meteo (hourly forecast + ERA5 history incl. shortwave radiation and soil moisture), NASA POWER (daily history). Idempotent writes (no duplicates), retry with backoff, timestamp everything in UTC and convert to Africa/Nairobi for display. Schedule an hourly GitHub Actions job that appends to Parquet and upserts to Supabase.
**Exit criteria:** two consecutive scheduled runs succeed and data has no duplicate timestamps.

### Phase 3: Cleaning & Quality Control (10 to 14 h)
**Tasks:** unit normalisation; physical range checks (e.g. humidity 0 to 100, pressure 800 to 1100 hPa); spike/flatline detection; cross-checks (rain gauge 1 vs 2, BMX vs MCP vs SHT temperature); flag, never silently delete. Output silver tables with `qc_flag` columns.
**Exit criteria:** QC report notebook shows % flagged per sensor; downstream code only uses `qc_flag == OK` rows.

### Phase 4: EDA & Feature Engineering (14 to 18 h)
**Tasks:** diurnal and seasonal patterns; rain event definition; features: 1/3/6 h pressure tendency, humidity and temperature deltas, rolling rainfall (1/3/24 h), wind gust ratio, hour-of-day sin/cos, plus Open-Meteo forecast features for the same hour.
**Exit criteria:** `gold/features.parquet` with a data dictionary and no target leakage (features only from time ≤ t).

### Phase 5: Model Development & Training (18 to 30 h)
Follow "baseline → improve → validate → document" for each model. Split **by time** (never random); use walk-forward validation.

| ID | Model | Method | Target / output | Metrics |
|---|---|---|---|---|
| M1 | Rain-risk nowcast | Persistence baseline → LightGBM classifier, probability calibration | P(rain ≥ 1 mm in next 3 h; ≥ 10 mm in next 24 h) | PR-AUC, recall at fixed precision, Brier score |
| M2 | Anomaly + sensor-fault detection | Rolling z-score + Isolation Forest; rain-gauge disagreement rule | Anomaly score, fault flag | Precision on injected/known faults |
| M3 | Radiation calibration | Ridge/LightGBM: SI1145 visible/IR/UV → shortwave radiation (label = Open-Meteo/NASA POWER) | W/m² estimate | MAE, R² |
| M4 | ET0 and water balance | FAO-56 Penman-Monteith using Conduit temp, RH, wind, pressure, calibrated radiation; daily water balance = rain − ET0 × crop coefficient (Kc) | Irrigation need (mm), soil-water estimate | Compare ET0 with Open-Meteo ET0; soil-water estimate vs ERA5-Land soil moisture (correlation) |
| M5 | Heat stress | Use station WBGT + forecast temp/RH; thresholds per standard heat-stress categories | Risk level | Rule validation |

Also: bias-correct Open-Meteo forecasts against Conduit observations (local downscaling), and report the improvement, since this shows meaningful use of Conduit data (25% of the score).
Log runs in MLflow, write a short model card per model (data, limits, metrics), push artifacts to Hugging Face Hub.
**Exit criteria:** each model beats its baseline on the held-out time period, or the report states honestly that it does not and the system falls back to the baseline. Limited Conduit history is expected; say so plainly in the model card.

### Phase 6: Decision Engine (30 to 34 h)
**Tasks:** convert model outputs into advisories with the schema `{id, type, severity (info/watch/warning), location, valid_from, valid_to, action, reason, evidence{}}`. Example rules: rain-risk > 0.7 → "delay spraying/harvest drying"; rain deficit + high ET0 → irrigation amount and time window (early morning); WBGT above threshold → heat alert.
**Exit criteria:** unit tests for every rule using fixture data; every advisory includes its evidence.

### Phase 7: API Layer (34 to 38 h)
**Endpoints:** `GET /health`, `/observations/latest`, `/observations?from&to`, `/forecast`, `/risk/rain`, `/irrigation`, `/advisories`, `POST /assistant` (natural-language question). OpenAPI docs auto-generated; CORS restricted to the frontend origin; simple rate limit.
**Exit criteria:** API tests pass; Swagger page loads; response time under 1 s for cached endpoints.

### Phase 8: LLM Assistant & Alerts (38 to 42 h)
**LLM:** function-calling over the API endpoints; system prompt states "use only numbers from tool results; say when data is missing"; answers in simple English (add Swahili as a stretch). Fallback to templated text if the free quota is exhausted.
**Telegram:** bot subscribes chat IDs and sends new `warning` advisories, de-duplicated with a cool-down.
**Exit criteria:** 10 test questions answered without invented numbers; one live alert received on a phone.

### Phase 9: Frontend (36 to 44 h, parallel with 7 to 8)
**Screens:** (1) Live station panel with sparklines; (2) Map with advisory markers; (3) Irrigation planner (pick crop and growth stage → weekly water plan); (4) Alerts feed; (5) "Ask Sentinel" chat; (6) "How it works" page showing Data → Insight → Action → Impact with the actual numbers.
**Exit criteria:** works on a phone-sized screen and shows a clear "data last updated" time and data-quality badge.

### Phase 10: Deployment & CI/CD (42 to 45 h)
**Tasks:** Dockerise API; deploy API to Render/HF Spaces and web to Vercel/Netlify; set secrets; GitHub Actions: lint + test on PR, deploy on `main`, cron ingest. Keep-alive ping for free-tier sleep.
**Exit criteria:** public URLs work from a different network; a fresh clone plus README reproduces the app.

### Phase 11: Validation, Docs & Pitch (45 to 48 h)
**Tasks:** back-test M1 on past rain events and show hits, misses and lead time; write `docs/impact.md` (users, decision enabled, what changes, cost of not having it); scalability slide (more stations, other Kenyan sites, county water boards, SMS via a paid gateway later); record a 3-minute demo video following `docs/demo-script.md`; prepare the Devpost text.
**Exit criteria:** demo rehearsed twice; submission text mapped to the judging table below.

---

## 6. Judging Criteria Map

| Criterion (weight) | Where the project earns it |
|---|---|
| Problem & Relevance (20%) | Named users, specific decisions (irrigate / spray / evacuate low areas), Kenyan drought-and-flood context |
| Innovation (20%) | Physics-plus-ML hybrid, sensor self-QC using dual rain gauges, local bias correction of forecasts |
| Technical & Conduit use (25%) | Conduit is the primary source in M1 to M4; radiation calibration is trained against Conduit readings; demonstrable working prototype |
| Scalability (20%) | Stateless API, free-tier now, station-agnostic ingestion, migration path to paid infra and SMS |
| Impact (15%) | Water saved (mm/ha), early-warning lead time, number of potential beneficiaries |

---

## 7. Risks & Fallbacks

| Risk | Fallback |
|---|---|
| Conduit has no API / short history | Log live data from day one; train on NASA POWER/Open-Meteo history for the same coordinates and *calibrate/validate* on Conduit; state this openly |
| No soil-moisture sensor | Water-balance estimate validated against ERA5-Land soil moisture |
| Free LLM quota hit | Templated advisory text; Ollama local model |
| Free hosting sleeps | Cron keep-alive; pre-warm before demo; record video as backup |
| Model does not beat baseline | Ship baseline, report it honestly |
| Wi-Fi fails at demo | Cached snapshot mode in the frontend |

---

## 8. Definition of Done (whole project)
- Live URL with real Conduit data updating on schedule
- At least 3 working models/analytics with model cards and honest metrics
- One end-to-end story shown live: data → risk → advisory → Telegram alert
- README, architecture, data dictionary, impact doc, demo video
- No secrets in git history; all tools on free tiers

---

## 9. Agent Operating Rules
1. Work one phase at a time; do not start a phase until the previous *Exit Criteria* pass. Post a short status after each phase.
2. Use only the free tools listed. Ask before adding any dependency, service or account that could cost money.
3. Never hard-code or print secrets; read from environment variables.
4. Never fabricate data, metrics or results. If real data is unavailable, label any synthetic or proxy data clearly in code, docs and the UI.
5. Time-based splits only for evaluation; guard against leakage.
6. Write tests for rules and API; keep functions small and typed; run lint before each commit.
7. Commit small, with messages like `phase-3: add rain gauge cross-check`.
8. Record assumptions and open questions in `docs/decisions.md` and surface blockers to the human instead of guessing.
9. Respect data-provider terms of use and attribute sources (Conduit/JHUB Africa, Open-Meteo, NASA POWER) in the UI and README.
