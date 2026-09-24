# Conduit Sentinel

Hyper-local climate intelligence for the JKUAT Conduit weather station: irrigation advice, rain-risk and heat-stress warnings, a REST API, Telegram alerts, and a plain-language assistant.

Until a live Conduit login is configured, the API serves a **labelled demo climatology** snapshot (`data_source=demo_climatology`) so the stack runs offline. Live Open-Meteo and NASA POWER collectors are implemented and write to `data/bronze/`.

Set `CONDUIT_DEMO=1` in `.env` to ingest that labelled surrogate through the collector. Then build Silver/Gold with:

```bash
python -m src.pipeline
```

## Quickstart (≤ 15 minutes)

### Prerequisites

- **Python 3.11** — download from [python.org](https://www.python.org/downloads/) or use `pyenv`
- **Node.js 20+** — download from [nodejs.org](https://nodejs.org/)

### Step 1 — Clone and create a virtualenv

```bash
git clone <repo-url> conduit-sentinel
cd conduit-sentinel
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows (Command Prompt)
# .venv\Scripts\Activate.ps1     # Windows (PowerShell)
pip install -r requirements.txt
```

### Step 2 — Copy environment files

```bash
cp .env.example .env
cp web/.env.example web/.env
```

No credentials are required for the local demo — leave all values empty in `.env`.  
`web/.env` is pre-configured with `VITE_API_URL=http://localhost:8000`.

### Step 3 — Run all tests

```bash
pytest tests/ -v --tb=short
```

Expected: **105 passed** in ~35 seconds. All tests run offline with no external credentials required.

### Step 4 — Start the API server

```bash
uvicorn src.api.main:app --reload --port 8000
```

API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Step 5 — Start the dashboard (separate terminal)

```bash
cd web
npm install
npm run dev
```

Open the dashboard at [http://localhost:5173](http://localhost:5173).

> **Tip:** The API server (Step 4) must be running before the dashboard can fetch data.  
> Append `?demo=1` to the dashboard URL for a cached offline demo snapshot.

### Optional — Single-command stack (Docker)

```bash
docker compose up --build
```

Opens the same two URLs: [http://localhost:5173](http://localhost:5173) (dashboard) and [http://localhost:8000/docs](http://localhost:8000/docs) (API).

### Optional — Live data ingest

Requires `CONDUIT_EMAIL` / `CONDUIT_PASSWORD` (Conduit portal) or `CONDUIT_DEMO=1`.  
Open-Meteo and NASA POWER collectors run without any API key.

```bash
python -m src.ingest.scheduler
```

Then rebuild Silver/Gold layers:

```bash
python -m src.pipeline
```

## Attribution and terms

- JKUAT Conduit / [JHUB Africa](https://conduit.jhubafrica.com)
- [Open-Meteo](https://open-meteo.com/en/terms) — free tier is **non-commercial** (appropriate for this hackathon; see `docs/decisions.md`)
- [NASA POWER](https://power.larc.nasa.gov/)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors

## Running Tests

All tests run offline without any external API credentials:

```bash
pytest tests/ -v --tb=short
```

Expected output: **105 passed** in ~35 seconds.

## Architecture

See `HackTheWeather_Architecture_Methodology.md` and `.kiro/specs/conduit-sentinel/`.
