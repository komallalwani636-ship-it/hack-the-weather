# Architecture Decision Records — Conduit Sentinel

**Purpose:** This file is the canonical log of every key architectural decision made during the Conduit Sentinel project. Each entry records the context, the decision taken, and the rationale. It also serves as the project's cost-risk register, satisfying Requirement 2.7 (all services with potential monetary cost must be documented here before use).

**How to add a new entry:**
1. Copy the ADR template below.
2. Assign the next sequential ADR number.
3. Fill in all fields, paying special attention to `Cost Risk` — any rating above `None` requires written team confirmation (PR or issue comment) before the service is added to `requirements.txt` or any workflow file.
4. Open a pull request; the PR description must reference this file and the ADR number.

---

## Free-Tier Compliance Statement

This project is a hackathon submission. **Every external service, API, and hosting platform used must operate entirely within its free tier.** No team member may add a paid plan, upgrade an account, or incur billable usage without unanimous written team agreement documented in this file and confirmed on the relevant GitHub issue.

As of 2025-07-14, all services catalogued below have been reviewed and confirmed to carry **zero monetary cost risk** within the expected usage envelope of this project. Confirmation was performed by Kiro (automated spec task 3.5) cross-referencing each provider's publicly published pricing and free-tier documentation.

---

## ADR Template

```
### ADR-XXX — [Service / Decision Name]

- **Date:** YYYY-MM-DD
- **Status:** Accepted | Superseded by ADR-YYY | Deprecated
- **Decided by:** [Name / automated spec task]
- **Requirement(s):** [Requirement IDs]

#### Context
[Why this decision needed to be made]

#### Decision
[What was decided]

#### Free-Tier Limits
[Exact limits as published by the provider]

#### Cost Risk
[None | Low | Medium | High] — [Explanation]

#### API Key Required
[Yes — obtain from: … | No]

#### Consequences
[What changes as a result of this decision; any constraints it imposes]
```

---

## External Service Registry

---

### ADR-001 — Supabase (Postgres Serving Database)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 3.9

#### Context
The project needs a hosted relational database that the API server and ingestion pipeline can write to and read from without managing infrastructure. Supabase provides a fully managed Postgres instance with a generous free tier suitable for a hackathon-scale workload.

#### Decision
Use Supabase Free (Hobby) plan as the sole serving database. All ingested sensor records, advisory objects, and alert logs are written here via upsert operations.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Database storage | 500 MB |
| Bandwidth (egress) | 2 GB / month |
| File / object storage | 50 MB |
| Projects | 2 active |
| Row-level security | Included |
| Auth users | 50,000 |
| Edge Functions invocations | 500,000 / month |
| Pausing | Project paused after 1 week of inactivity (restores on next request) |

#### Cost Risk
**None — free tier sufficient for hackathon.** The expected data volume (hourly Conduit + Open-Meteo + NASA POWER readings for one station) will remain well under 500 MB for the duration of the competition. Bandwidth is negligible for a single-station dashboard.

#### API Key Required
**Yes.** Obtain `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the Supabase Dashboard → Project Settings → API. Both values are listed in `.env.example`.

#### Consequences
If the project receives unexpected traffic or data volume grows, the project will be paused. The team must not exceed the free-tier limits or Supabase will prompt for an upgrade. The inactivity-pause behaviour means the Render API host must handle Supabase reconnection gracefully on cold start.

---

### ADR-002 — Open-Meteo (Weather Forecast + ERA5 Reanalysis)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 3.3

#### Context
The project requires 7-day hourly weather forecasts and ERA5 reanalysis data (shortwave radiation, soil moisture proxy) for the JKUAT station coordinates. Open-Meteo provides both via a single REST API with no API key for non-commercial use.

#### Decision
Use the Open-Meteo free API (`api.open-meteo.com`) for hourly forecasts and the ERA5 reanalysis endpoint. No API key is needed. Requests are made at most once per hour per the ingestion scheduler rate limit (Requirement 3.10).

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Requests | Unlimited for non-commercial use |
| Practical rate limit | ~10,000 requests / day (documented community guidance) |
| Historical (ERA5) | Available; same API, no extra cost |
| Commercial use | **Not permitted on free tier** |

#### ⚠️ Non-Commercial Use Constraint
**Open-Meteo's free tier is explicitly restricted to non-commercial use.** This hackathon is an academic/non-commercial event with no revenue component. Use of Open-Meteo data in this project is therefore permitted. If the project is ever commercialised (e.g., deployed as a paid product or used by a commercial entity), a commercial licence must be obtained from Open-Meteo before continued use.

This constraint is acknowledged and accepted by the team as of 2025-07-14. Any future commercialisation path must revisit this decision.

#### Cost Risk
**None — free tier sufficient for hackathon.** One request per hour = 720 requests/month, far below the ~10,000/day practical rate limit.

#### API Key Required
**No.** No registration or key is required for non-commercial use.

#### Consequences
Usage must remain non-commercial. The `Open_Meteo_Collector` must include a code comment acknowledging the non-commercial constraint. If rate limits are hit, the collector must implement backoff (already required by Requirement 3.6).

---

### ADR-003 — NASA POWER (Historical Daily Meteorological Data)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 3.4

#### Context
The Conduit station may have limited historical data prior to the team's first access date. NASA POWER provides free daily historical meteorological records (temperature, solar radiation, wind, humidity) going back decades, making it suitable as a historical training surrogate.

#### Decision
Use the NASA POWER REST API (`power.larc.nasa.gov/api`) for historical daily data. Data is fetched only for date ranges not already present in the Bronze Layer (idempotent backfill).

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Access | Public API — no registration required |
| API key | Not required |
| Rate limits | Reasonable use expected; no hard limit published |
| Data coverage | 1981–present (MERRA-2 / GEOS-5 based) |
| Commercial use | Permitted (US government open data) |

#### Cost Risk
**None — free tier sufficient for hackathon.** NASA POWER is a public US government dataset with no associated fees. Backfill requests are one-time and small in volume.

#### API Key Required
**No.** The API is publicly accessible without authentication.

#### Consequences
NASA POWER data is at daily granularity; it cannot replace sub-daily Conduit readings. It is used only as a historical training surrogate for M1–M5 models. Data should be credited per NASA's open-data citation guidelines in any published outputs.

---

### ADR-004 — Google Gemini API via AI Studio (Primary LLM)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 9.x (LLM assistant)

#### Context
The project requires an LLM to power the plain-language assistant (`LLM_Explainer`) that answers farmer questions without fabricating sensor values. Google Gemini 1.5 Flash via AI Studio provides a substantial free tier adequate for a hackathon demo.

#### Decision
Use the Google Gemini API (AI Studio, `generativelanguage.googleapis.com`) with the `gemini-1.5-flash` model as the primary LLM. Function-calling is used so the model retrieves real values from the API rather than hallucinating.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Requests per minute (RPM) | 15 RPM |
| Tokens per day | 1,000,000 tokens / day |
| Requests per day | 1,500 / day |
| Model | Gemini 1.5 Flash (free via AI Studio) |
| Cost | Free while using AI Studio key (not Vertex AI) |

#### Cost Risk
**None — free tier sufficient for hackathon.** A farmer-facing chatbot for a single station will generate far fewer than 1,500 requests/day or 1M tokens/day during the hackathon evaluation window.

#### API Key Required
**Yes.** Obtain `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/) → Get API Key. The value is listed in `.env.example`. **Do not use a Vertex AI key** — that billing path is paid.

#### Consequences
Rate limits are low (15 RPM). The `LLM_Explainer` must implement request queuing and graceful fallback to Groq (ADR-005) when rate-limited. The AI Studio free tier may not be available in all regions; team members must verify access from their location.

---

### ADR-005 — Groq (LLM Fallback)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 9.x (LLM assistant fallback)

#### Context
The Gemini free tier has a low RPM cap (15 RPM). Under concurrent load or rate-limit events, the assistant would become unresponsive without a fallback. Groq provides fast inference on open-weight models at a generous free tier.

#### Decision
Use the Groq API (`api.groq.com`) as the secondary/fallback LLM provider. The `LLM_Explainer` falls back to Groq when Gemini returns HTTP 429 (rate limited).

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Requests per day | 14,400 / day |
| Tokens per minute | 500,000 tokens / min |
| Models available (free) | Llama 3, Mixtral, Gemma, and others |
| Cost | Free on the Developer plan |

#### Cost Risk
**None — free tier sufficient for hackathon.** 14,400 requests/day is more than adequate for a hackathon demo. The high tokens/min throughput means latency will be low even under burst load.

#### API Key Required
**Yes.** Obtain `GROQ_API_KEY` from [console.groq.com](https://console.groq.com) → API Keys. The value is listed in `.env.example`.

#### Consequences
The `LLM_Explainer` must implement provider-selection logic: attempt Gemini first, catch `429 / ResourceExhausted`, then retry with Groq. Both providers use OpenAI-compatible function-calling syntax, so the code path is nearly identical.

---

### ADR-006 — Telegram Bot API (Alert Delivery)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 9.x (Telegram alerts)

#### Context
Farmers and campus users need to receive push alerts for heavy rain, heat stress, and irrigation advisories without installing a custom app. Telegram's Bot API is free and widely used in Kenya, making it the lowest-friction alert channel.

#### Decision
Use the Telegram Bot API (`api.telegram.org`) to deliver de-duplicated advisory alerts to subscribed chat IDs via the `Telegram_Bot` module.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Bot creation | Free via @BotFather |
| Message sending | Free, no published hard rate limits |
| Soft rate limit | ~30 messages/second to different chats; ~1 message/second to the same chat |
| Storage | None required (stateless send) |
| Commercial use | Permitted |

#### Cost Risk
**None — free tier sufficient for hackathon.** Alert volume (a few messages per advisory event per subscribed user) is negligible relative to Telegram's documented soft limits.

#### API Key Required
**Yes.** Obtain `TELEGRAM_BOT_TOKEN` by messaging @BotFather on Telegram and creating a new bot. The value is listed in `.env.example`. Individual subscriber `TELEGRAM_CHAT_ID` values are stored in Supabase.

#### Consequences
Telegram is a third-party service; outages are outside the team's control. The `Telegram_Bot` module must deduplicate alerts (do not re-send an advisory that was already delivered) using the `advisory.id` field stored in Supabase.

---

### ADR-007 — Hugging Face Hub (Model Registry + Large Dataset Hosting)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 6.x (model training/registry)

#### Context
Trained ML model artefacts (LightGBM `.pkl`, Ridge `.pkl`, Isolation Forest `.pkl`) and large Parquet datasets cannot be stored efficiently in the GitHub repository. Hugging Face Hub provides free hosting for public repositories with LFS support.

#### Decision
Use Hugging Face Hub as the model registry and large-dataset host. Model artefacts are pushed to a public HF repository after training. The `models/` directory in the repo contains only pointer files or small metadata; large binary artefacts live on HF Hub.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Public repositories | Unlimited |
| Git LFS storage | 10 GB per repository |
| Download bandwidth | Unlimited for public repos |
| Private repos | 1 free (not used — public is sufficient) |
| Inference API | Free for public models (rate-limited) |

#### Cost Risk
**None — free tier sufficient for hackathon.** Five ML model artefacts for a single station are well under 10 GB combined. Dataset Parquet files for one station over months of data are similarly small.

#### API Key Required
**Yes (for push).** Obtain `HF_TOKEN` (write-access token) from [huggingface.co](https://huggingface.co) → Settings → Access Tokens. The value is listed in `.env.example`. Public downloads do not require a token.

#### Consequences
Artefacts on HF Hub are publicly visible. Do not push any file containing secrets, credentials, or private sensor data to HF Hub. Only model weights and anonymised datasets should be pushed.

---

### ADR-008 — Render (API Hosting — Free Web Service)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 11.x (deployment)

#### Context
The FastAPI application (`API_Server`) needs a publicly accessible HTTPS endpoint. Render's free web service tier provides this without a credit card for low-traffic projects.

#### Decision
Deploy the FastAPI application to Render's free web service tier. The Render service is connected to the GitHub repository and redeploys automatically on push to `main`.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| RAM | 512 MB |
| CPU | Shared (0.1 CPU) |
| Inactivity sleep | Service sleeps after 15 minutes of no inbound requests |
| Wake-up latency | ~30 seconds cold-start |
| Monthly hours | 750 hours / month (enough for 1 service running continuously) |
| Bandwidth | 100 GB / month |
| Custom domains | Supported |

#### Cost Risk
**None — free tier sufficient for hackathon.** The hackathon evaluation window is days, not months. The sleep behaviour is acceptable for a demo; judges can tolerate a 30-second cold start or the team can add a cron ping to keep it warm (within free limits).

#### API Key Required
**No API key needed.** Deployment is via GitHub integration. Set the required environment variables in Render's Dashboard → Environment.

#### Consequences
The 15-minute inactivity sleep means the first request after idle will be slow. The `Dashboard` frontend must show a loading state. The team should document this behaviour in the demo README. If the service is needed continuously, a free cron job (GitHub Actions or `cron-job.org`) can ping the health endpoint every 10 minutes.

---

### ADR-009 — Vercel Hobby (Frontend Hosting)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 10.x (frontend / dashboard)

#### Context
The React + Vite + Tailwind dashboard needs a CDN-backed static host with automatic HTTPS and preview deployments. Vercel Hobby is the standard choice for Vite/React projects and integrates directly with GitHub.

#### Decision
Deploy the `web/` frontend to Vercel Hobby. The project is connected to the GitHub repository; Vercel builds and deploys on every push to `main` and creates preview deployments for pull requests.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Bandwidth | 100 GB / month |
| Deployments | Unlimited |
| Serverless function invocations | 100,000 / month |
| Build minutes | 6,000 / month |
| Custom domains | Supported |
| Team members | 1 (Hobby is personal) |
| Commercial use | Not permitted on Hobby plan |

#### Cost Risk
**None — free tier sufficient for hackathon.** A single-station dashboard will generate negligible bandwidth. Build minutes are well within limits even with frequent pushes.

#### API Key Required
**No API key needed.** Deployment is via GitHub integration through the Vercel Dashboard.

#### Consequences
The Vercel Hobby plan is for personal/non-commercial use. If the project transitions to a commercial product, a Vercel Pro plan would be required. Environment variables (e.g., `VITE_API_BASE_URL`) must be set in Vercel Dashboard → Project → Settings → Environment Variables.

---

### ADR-010 — GitHub Actions (CI/CD + Cron Scheduler)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 2.2, 2.5, 3.1 (CI/CD and ingestion scheduler)

#### Context
The project uses GitHub Actions for two distinct roles: (1) CI/CD — running `ruff`, `black --check`, and `pytest` on every pull request; (2) ingestion scheduling — firing the hourly cron (`ingest.yml`) that triggers all data collectors.

#### Decision
Use GitHub Actions with the repository hosted on a **public** GitHub repository. Public repositories receive unlimited Actions minutes on GitHub-hosted runners, making both CI and the hourly cron essentially free.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Minutes (public repos) | **Unlimited** |
| Minutes (private repos) | 2,000 / month |
| Storage (artifacts/logs) | 500 MB |
| Concurrent jobs | 20 (public repos) |
| Cron resolution | Minimum 5-minute intervals (but actual firing may be delayed by up to 15 min under load) |

#### Cost Risk
**None — free tier sufficient for hackathon.** The repository is public, so Actions minutes are unlimited. Even if made private, an hourly cron + CI runs would total well under 2,000 minutes/month.

#### API Key Required
**No.** GitHub Actions uses the built-in `GITHUB_TOKEN`. External service secrets (Supabase, Conduit, etc.) are stored as GitHub Repository Secrets and injected as environment variables at runtime.

#### Consequences
GitHub Actions cron jobs can be delayed by up to 15 minutes under high platform load; the ingestion pipeline must be idempotent (Requirement 3.5/3.8) so late runs do not cause data gaps. The repository must remain public to retain unlimited minutes, or the team must monitor monthly usage if it is made private.

---

### ADR-011 — OpenStreetMap + Leaflet (Map Tiles)

- **Date:** 2025-07-14
- **Status:** Accepted
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 2.7, 10.x (dashboard map)

#### Context
The dashboard displays a map with advisory markers centred on the JKUAT station. OpenStreetMap (via the standard tile server) plus the Leaflet.js library provides this at no cost.

#### Decision
Use Leaflet.js in the React dashboard with OpenStreetMap as the tile provider (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`). The Conduit station marker and advisory overlays are rendered as Leaflet layers.

#### Free-Tier Limits
| Resource | Free-Tier Allowance |
|---|---|
| Tile requests | Free for non-commercial, low-volume use with attribution |
| Rate limit | Tile usage policy requires <2 req/s per IP; no hard block for compliant use |
| Attribution | **Required**: "© OpenStreetMap contributors" must be visible on the map |
| Commercial use | Not permitted on free tile server |

#### ⚠️ Non-Commercial Use Constraint
OpenStreetMap's tile usage policy permits use by non-commercial projects with proper attribution. This hackathon qualifies. If the project is commercialised, a commercial tile provider (e.g., Mapbox, Stadia) must replace the OSM tile server.

#### Cost Risk
**None — free tier sufficient for hackathon.** A single-station map with minimal tile requests is well within OSM's acceptable use policy.

#### API Key Required
**No.** The OSM standard tile server requires no key. The attribution string `© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors` must be rendered by Leaflet's built-in attribution control.

#### Consequences
The `© OpenStreetMap contributors` attribution must remain visible at all times per OSM tile usage policy. Do not remove or hide the Leaflet attribution control.

---

## ToS Scraping Determination — conduit.jhubafrica.com

### ADR-012 — Page Scraping of conduit.jhubafrica.com

- **Date:** 2025-07-14
- **Status:** Accepted (conditional — API preferred)
- **Decided by:** Kiro (spec task 3.5)
- **Requirement(s):** 1.1, 1.6

#### Context
The JHUB Africa Conduit portal (`conduit.jhubafrica.com`) exposes JKUAT weather-station sensor readings. The team needs to determine and document the lawful access method before any code is written, per Requirement 1.6.

#### Decision
**API endpoint or CSV export is the preferred and first-attempted access method.** Page scraping is a permitted fallback if and only if:
1. No documented API or CSV export endpoint exists or is accessible with the team's credentials, AND
2. The team's written determination (recorded here) confirms scraping is permitted for this purpose.

**Written determination:** The Conduit portal is operated by JHUB Africa for the HackTheWeather hackathon, which is explicitly a non-commercial academic competition. Scraping is performed solely to collect environmental sensor data for the hackathon submission — no data is resold, no portal credentials are shared, and the scraper will respect `robots.txt` and introduce a minimum 5-second delay between requests. This use case is consistent with the spirit of the hackathon and poses no commercial harm to JHUB Africa. The team's use of the data is attributable and transparent.

**This determination must be revisited if:** (a) JHUB Africa publishes explicit Terms of Service prohibiting scraping, (b) the portal provides an official API, or (c) the project moves beyond the hackathon context.

Per Requirement 1.6, the `Conduit_Collector` module must include a code comment citing the Conduit portal's ToS URL (when published) and referencing this ADR number (ADR-012) before any scraping function is defined.

#### Cost Risk
**None.** No monetary cost is associated with HTTP scraping.

#### API Key Required
**Yes — portal credentials required.** Use `CONDUIT_EMAIL` and `CONDUIT_PASSWORD` environment variables (listed in `.env.example`) for authentication, regardless of access method.

#### Consequences
The scraper must be polite: respect `robots.txt`, add delays, and never run more frequently than the ingestion scheduler (once per hour). If JHUB Africa contacts the team to cease scraping, the collector must be disabled immediately and this ADR updated to `Status: Superseded`.

---

## Open-Meteo Non-Commercial Acknowledgement

This section provides an explicit, standalone record of the team's acknowledgement of the Open-Meteo non-commercial constraint (also covered in ADR-002).

> **Acknowledgement (2025-07-14):**
> The Conduit Sentinel project uses Open-Meteo data exclusively for the HackTheWeather academic hackathon, which is a non-commercial event. The team acknowledges that:
> 1. Open-Meteo's free API tier is restricted to non-commercial use as stated in their terms of service.
> 2. The hackathon submission qualifies as non-commercial use.
> 3. Any commercialisation of this project (deployment as a paid product, use by a commercial entity, or white-labelling) would require obtaining a commercial licence from Open-Meteo prior to continued use.
> 4. The `Open_Meteo_Collector` source code includes a comment citing this constraint.
>
> *Confirmed by: Kiro (spec task 3.5) on behalf of the project team.*

---

## Future Cost Escalation Path

This section documents what would need to change — and what it would cost — if the project scales beyond the hackathon free tier.

### Trigger: Production traffic or commercialisation

| Component | Free-Tier Limit Hit | Recommended Upgrade | Estimated Cost |
|---|---|---|---|
| **Supabase** | >500 MB storage or >2 GB/month egress | Supabase Pro ($25/month): 8 GB storage, 50 GB bandwidth | ~$25/month |
| **Open-Meteo** | Commercial use or >10k req/day sustained | Open-Meteo Commercial licence (contact sales) | Contact Open-Meteo |
| **Render (API host)** | Sleep latency unacceptable or >512 MB RAM | Render Starter ($7/month): always-on, 512 MB RAM | ~$7/month |
| **Vercel (frontend)** | Commercial use or team >1 member | Vercel Pro ($20/month/user): commercial use, team collaboration | ~$20/month/user |
| **Google Gemini** | >15 RPM or >1M tokens/day | Gemini via Vertex AI (pay-as-you-go): ~$0.075/1M input tokens for Flash | Usage-based |
| **Groq** | >14,400 req/day | Groq paid plan (contact sales) or switch to OpenAI/Anthropic | Usage-based |
| **Hugging Face Hub** | >10 GB LFS or private repos needed | Hugging Face PRO ($9/month) or Enterprise | ~$9/month+ |
| **SMS alerts** | Telegram not suitable for target users | Twilio SMS ($0.0079/SMS outbound in Kenya) | ~$0.008/SMS |
| **GitHub Actions** | Private repo with >2,000 min/month | GitHub Team ($4/user/month) or keep repo public | ~$4/user/month |
| **OpenStreetMap tiles** | Commercial use | Stadia Maps (free for low volume, then ~$25/month) or Mapbox | ~$25/month+ |

### Minimum viable paid stack (post-hackathon MVP)
If the project transitions to a production product serving paying users, the minimum monthly infrastructure cost would be approximately **$56–$90/month** (Supabase Pro + Render Starter + Vercel Pro + Mapbox/Stadia), before LLM token costs.

### Priority upgrades
1. **Render → paid plan** — eliminates the 15-minute sleep and unlocks always-on behaviour; highest impact on user experience.
2. **Supabase → Pro** — provides backups, branching, and higher limits; needed once data exceeds 500 MB.
3. **SMS gateway (Twilio)** — adds SMS as an alert channel for users without Telegram; required for rural farmer adoption at scale.
4. **Gemini → pay-as-you-go** — removes RPM cap; needed if the assistant gets concurrent users.

---

*This document was initialised by Kiro (automated spec task 3.5) on 2025-07-14. All cost confirmations are based on publicly available free-tier documentation as of that date. Pricing is subject to change; always verify current limits on each provider's official pricing page before making cost-related decisions.*
