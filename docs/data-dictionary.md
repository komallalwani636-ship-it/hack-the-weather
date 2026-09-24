# Conduit Sentinel — Data Dictionary

**Project:** Conduit Sentinel  
**Station:** JKUAT Conduit Weather Station  
**Latitude:** `-1.0982` | **Longitude:** `37.0144`  
**Last updated:** 2025-07-14  

---

## Table of Contents

1. [Access Method](#access-method)
2. [Station Location](#station-location)
3. [Historical Data Note](#historical-data-note)
4. [Sensor Catalogue](#sensor-catalogue)
5. [QC Thresholds](#qc-thresholds)
6. [External Data Sources](#external-data-sources)
7. [Change Log](#change-log)

---

## Access Method

> **Status:** Not yet confirmed — populate this section after the first successful login to the Conduit portal.

**Confirmed access mode:** `TBD` _(REST API / CSV Export / Page Scrape — delete as applicable)_  
**Recorded at (UTC):** `TBD`

### Retrieval Steps

> Replace this block with the steps for the confirmed mode once determined.

**REST API (preferred):**
1. `POST https://conduit.jhubafrica.com/api/v1/auth/login` with `{email, password}` → receive Bearer token.
2. `GET https://conduit.jhubafrica.com/api/v1/readings` with `Authorization: Bearer <token>` → paginated JSON sensor readings.
3. Iterate pages until no `next_cursor` is returned.
4. Parse each record into the Bronze Layer schema and write to Parquet.

**CSV Export (fallback):**
1. `POST https://conduit.jhubafrica.com/login` with form credentials → receive session cookie.
2. `GET https://conduit.jhubafrica.com/export/csv` with the session cookie → download CSV file.
3. Parse CSV into the Bronze Layer schema and write to Parquet.

**Page Scrape (last resort — requires ToS confirmation):**
1. `POST https://conduit.jhubafrica.com/login` with form credentials → receive session cookie.
2. `GET https://conduit.jhubafrica.com/dashboard` with the session cookie → receive HTML page.
3. Parse the sensor-reading table using BeautifulSoup.
4. Map table columns to Bronze Layer schema fields and write to Parquet.
5. **Note:** ToS citation must be present as a code comment before the scraping function — see `src/ingest/conduit.py`.

---

## Station Location

| Field | Value |
|---|---|
| Station name | JKUAT Conduit Weather Station |
| Latitude | `-1.0982` |
| Longitude | `37.0144` |
| Timezone (display) | `Africa/Nairobi` (UTC+3) |
| All internal timestamps | UTC |
| Coordinate precision | Four decimal places (fixed; used for all external data requests) |

These coordinates are the canonical fixed values used in every collector module and all external API calls (Open-Meteo, NASA POWER).

---

## Historical Data Note

The Conduit portal may not provide historical data prior to the date of first account access. In that case:

- **Live data** is logged continuously from the date of first access onward at every available sampling interval.
- **Historical training data** for any date range before first Conduit access is sourced from:
  - **NASA POWER** — daily historical meteorological data (temperature, humidity, wind speed, shortwave radiation, precipitation) for the JKUAT coordinates. No API key required.
  - **Open-Meteo ERA5 reanalysis** — hourly ERA5 historical records including shortwave radiation and a soil moisture proxy for the JKUAT coordinates. No API key required.

All model training, validation, and bias-correction work performed on surrogate data is explicitly labelled as such in model cards, MLflow run descriptions, and any UI or API output derived from it.

---

## Sensor Catalogue

> **Note:** All rows marked `TBD` will be populated after the first successful Conduit data sample is retrieved and stored in `data/bronze/`.

> **SI1145 note:** The SI1145 outputs (`si1145_visible`, `si1145_ir`, `si1145_uv`) are **uncalibrated indices**, not W/m². Conversion to calibrated shortwave radiation (W/m²) is performed by M3_RadiationCal using NASA POWER / Open-Meteo ERA5 as supervision labels.

### Precipitation

| Sensor | Column name (Silver) | Unit | Sampling interval (min) | Earliest UTC | Latest UTC | Missing (%) |
|---|---|---|---|---|---|---|
| Rain gauge 1 | `rain_gauge_1_mm` | mm/h | TBD | TBD | TBD | TBD |
| Rain gauge 2 | `rain_gauge_2_mm` | mm/h | TBD | TBD | TBD | TBD |

### Temperature

| Sensor | Column name (Silver) | Unit | Sampling interval (min) | Earliest UTC | Latest UTC | Missing (%) |
|---|---|---|---|---|---|---|
| Temperature — BMX sensor | `temp_bmx_c` | °C | TBD | TBD | TBD | TBD |
| Temperature — MCP sensor | `temp_mcp_c` | °C | TBD | TBD | TBD | TBD |
| Temperature — SHT sensor | `temp_sht_c` | °C | TBD | TBD | TBD | TBD |
| Wet-bulb temperature | `temp_wetbulb_c` | °C | TBD | TBD | TBD | TBD |
| Wet-Bulb Globe Temperature (WBGT) | `wbgt_c` | °C | TBD | TBD | TBD | TBD |

### Wind

| Sensor | Column name (Silver) | Unit | Sampling interval (min) | Earliest UTC | Latest UTC | Missing (%) |
|---|---|---|---|---|---|---|
| Wind speed | `wind_speed_ms` | m/s | TBD | TBD | TBD | TBD |
| Wind direction | `wind_direction_deg` | degrees (0–360) | TBD | TBD | TBD | TBD |
| Wind gust | `wind_gust_ms` | m/s | TBD | TBD | TBD | TBD |

### Solar / Radiation

| Sensor | Column name (Silver) | Unit | Notes | Sampling interval (min) | Earliest UTC | Latest UTC | Missing (%) |
|---|---|---|---|---|---|---|---|
| SI1145 visible light index | `si1145_visible` | index (0–65535) | Uncalibrated index — not W/m² | TBD | TBD | TBD | TBD |
| SI1145 infrared index | `si1145_ir` | index (0–65535) | Uncalibrated index — not W/m² | TBD | TBD | TBD | TBD |
| SI1145 UV index | `si1145_uv` | index (0–255) | Uncalibrated index — not W/m² | TBD | TBD | TBD | TBD |

### Atmospheric Pressure

| Sensor | Column name (Silver) | Unit | Sampling interval (min) | Earliest UTC | Latest UTC | Missing (%) |
|---|---|---|---|---|---|---|
| Atmospheric pressure — BMX sensor | `pressure_hpa` | hPa | TBD | TBD | TBD | TBD |

### Humidity

| Sensor | Column name (Silver) | Unit | Sampling interval (min) | Earliest UTC | Latest UTC | Missing (%) |
|---|---|---|---|---|---|---|
| Relative humidity — SHT sensor | `humidity_sht_pct` | % | TBD | TBD | TBD | TBD |

---

## QC Thresholds

The QC Module (`src/processing/qc.py`) assigns `qc_flag = RANGE_FAIL` to any reading outside the physical bounds below. These bounds are hard-coded constants in the QC module and documented here as the authoritative reference.

| Sensor / variable | Column(s) | Min | Max | Unit |
|---|---|---|---|---|
| Relative humidity | `humidity_sht_pct` | 0 | 100 | % |
| Atmospheric pressure | `pressure_hpa` | 800 | 1100 | hPa |
| Temperature (all sensors) | `temp_bmx_c`, `temp_mcp_c`, `temp_sht_c`, `temp_wetbulb_c` | −10 | 60 | °C |
| Wind speed | `wind_speed_ms` | 0 | 60 | m/s |
| SI1145 visible index | `si1145_visible` | 0 | 65535 | index |
| SI1145 IR index | `si1145_ir` | 0 | 65535 | index |
| SI1145 UV index | `si1145_uv` | 0 | 255 | index |
| WBGT | `wbgt_c` | −5 | 55 | °C |

### QC Flag Values

| Flag | Meaning |
|---|---|
| `OK` | Reading passes all checks |
| `RANGE_FAIL` | Value outside physical range bounds above |
| `SPIKE` | Deviation > 5 standard deviations from 30-minute rolling median |
| `FLATLINE` | Change < 0.01 native units for 10+ consecutive readings |
| `CROSS_FAIL` | Disagrees with a paired sensor (rain gauge pair > 2 mm/h; temperature pair > 5 °C) |
| `MISSING` | Null / absent reading |

**Priority order** (highest wins): `MISSING` > `RANGE_FAIL` > `CROSS_FAIL` > `SPIKE` > `FLATLINE` > `OK`

---

## External Data Sources

These sources supplement Conduit data and serve as historical training surrogates when Conduit history is unavailable. Neither requires an API key.

### Open-Meteo

| Field | Value |
|---|---|
| Provider | Open-Meteo (open-meteo.com) |
| API key | Not required |
| Licence | Free for non-commercial use (hackathon compliant) |
| Base URL | `https://api.open-meteo.com/v1/forecast` |
| ERA5 reanalysis URL | `https://archive-api.open-meteo.com/v1/era5` |
| Variables used | 2 m temperature, 2 m relative humidity, 10 m wind speed, shortwave radiation, precipitation, precipitation probability, ERA5-Land soil moisture |
| Temporal resolution | Hourly (forecast and ERA5 reanalysis) |
| Collector module | `src/ingest/openmeteo.py` |

### NASA POWER

| Field | Value |
|---|---|
| Provider | NASA Prediction of Worldwide Energy Resources (POWER) |
| API key | Not required |
| Base URL | `https://power.larc.nasa.gov/api/temporal/daily/point` |
| Variables used | Temperature (T2M), relative humidity (RH2M), wind speed (WS2M), shortwave radiation (ALLSKY_SFC_SW_DWN), precipitation (PRECTOTCORR) |
| Temporal resolution | Daily |
| Primary use | Shortwave radiation labels for M3_RadiationCal training; historical training data where Conduit history is absent |
| Collector module | `src/ingest/nasa_power.py` |

---

## Gold Layer features (`data/gold/features.parquet`)

| Column | Derivation | Unit |
|---|---|---|
| `timestamp_utc` | Observation time | UTC |
| `pressure_tendency_1h` | P(t) − P(t−1h) | hPa |
| `pressure_tendency_3h` | P(t) − P(t−3h) | hPa |
| `pressure_tendency_6h` | P(t) − P(t−6h) | hPa |
| `rain_1h` | Sum of `qc_flag=OK` rain in prior 1 h | mm |
| `rain_3h` | Sum of OK rain in prior 3 h | mm |
| `rain_24h` | Sum of OK rain in prior 24 h | mm |
| `humidity_delta_1h` | RH(t) − RH(t−1h) | % |
| `temperature_delta_1h` | T(t) − T(t−1h) | °C |
| `wind_gust_ratio` | max gust / mean wind over 30 min; −1 if mean wind = 0 | — |
| `hour_sin` / `hour_cos` | sin/cos(2π · hour / 24) | — |
| `om_temp`, `om_rh`, `om_precip_prob`, `om_sw_rad` | Open-Meteo join on UTC hour | mixed |
| `om_*_bc` | Open-Meteo + 30-day rolling mean bias | mixed |
| `bias_correction_delta_*` | Signed correction applied | mixed |
| `bias_correction_insufficient_data` | True when overlap < 7 days | bool |
| `bias_correction_partial_window` | True when overlap 7–29 days | bool |

---

## Change Log

| Date | Version | Author | Description |
|---|---|---|---|
| 2025-07-14 | 0.1.0 | Kiro (spec task 1.3) | Initial scaffold created. All sensor rows populated with TBD placeholders. Access method TBD pending first Conduit login. QC thresholds, external sources, and station coordinates documented. |
