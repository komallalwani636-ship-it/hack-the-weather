"""FastAPI application for Conduit Sentinel."""

from __future__ import annotations

import os
import time

# Load .env on startup so GEMINI_API_KEY etc. are available without shell export
try:
    from dotenv import load_dotenv

    load_dotenv(override=False)
except ImportError:
    pass
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.schemas import AssistantRequest, HealthResponse, SimulationRequest
from src.api.store import AppStore
from src.decision.rules import DecisionEngine
from src.llm.explainer import LLMExplainer
from src.models.et0 import DEFAULT_KC, ET0Model
from src.models.heat import HeatStressModel

app = FastAPI(title="Conduit Sentinel", version="0.1.0")
store = AppStore()
_hits: dict[str, deque[float]] = defaultdict(deque)
_latest_cache: tuple[float, dict] | None = None

frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")


def _is_allowed_origin(origin: str | None) -> bool:
    if not origin:
        return True
    if origin in {frontend_origin, "http://localhost:5173", "http://127.0.0.1:5173"}:
        return True
    if origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:"):
        return True
    return False


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_origins=[frontend_origin, "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    cors_headers = {
        "Access-Control-Allow-Origin": origin if _is_allowed_origin(origin) and origin else "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    if request.method == "OPTIONS":
        return JSONResponse(status_code=200, content={"status": "ok"}, headers=cors_headers)

    if origin and not _is_allowed_origin(origin):
        return JSONResponse(
            status_code=403,
            content={"error": "cors_denied", "detail": "Origin not allowed"},
            headers=cors_headers,
        )

    ip = request.client.host if request.client else "unknown"
    now = time.time()
    bucket = _hits[ip]
    while bucket and now - bucket[0] > 60:
        bucket.popleft()

    # Generous limit for localhost / development / automated test runs
    limit = 2000 if ip in ("127.0.0.1", "localhost", "testclient") else 60
    if len(bucket) >= limit:
        retry = int(max(1, 60 - (now - bucket[0])))
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "detail": f"{limit} requests per 60 seconds"},
            headers={"Retry-After": str(retry), **cors_headers},
        )
    bucket.append(now)
    response = await call_next(request)
    if origin and _is_allowed_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


def _explainer() -> LLMExplainer:
    return LLMExplainer(
        {
            "get_observations_latest": store.latest_observations,
            "get_rain_risk": lambda: {
                "p_rain_3h": store.rain_risk.p_rain_3h,
                "p_rain_24h": store.rain_risk.p_rain_24h,
            },
            "get_irrigation": lambda: {
                "et0_today_mm": store.irrigation.et0_mm,
                "water_balance_mm": store.irrigation.soil_water_mm,
                "irrigation_required": store.irrigation.irrigation_required,
                "irrigation_action": store.irrigation.action,
            },
            "get_advisories": lambda: [a.to_dict() for a in store.advisories],
            "get_forecast": store.forecast,
        }
    )


@app.get("/health", response_model=HealthResponse)
def health():
    return {
        "status": "ok",
        "data_last_updated_utc": store.last_updated(),
        "storage_fallback": store.storage_fallback,
    }


@app.get("/observations/latest")
def observations_latest():
    global _latest_cache
    now = time.time()
    if _latest_cache and now - _latest_cache[0] < 60:
        return _latest_cache[1]
    payload = store.latest_observations()
    _latest_cache = (now, payload)
    return payload


@app.get("/observations")
def observations(
    start: datetime = Query(..., alias="from"),
    end: datetime = Query(..., alias="to"),
):
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if start > end:
        return JSONResponse(
            status_code=422,
            content={"error": "invalid_range", "detail": "`from` must be earlier than or equal to `to`"},
        )
    if end - start > timedelta(days=7):
        return JSONResponse(
            status_code=422,
            content={"error": "range_too_large", "detail": "Maximum observation range is 7 days"},
        )
    return store.observations_range(start, end)


@app.get("/forecast")
def forecast():
    return store.forecast()


@app.get("/risk/rain")
def risk_rain():
    pred = store.rain_risk
    if pred.insufficient_data:
        return JSONResponse(
            status_code=503,
            content={"error": "insufficient_data", "detail": "No features available for inference"},
        )
    gold = store.latest_gold()
    ts = gold.get("timestamp_utc")
    return {
        "p_rain_3h": pred.p_rain_3h,
        "p_rain_24h": pred.p_rain_24h,
        "feature_timestamp_utc": ts.isoformat() if hasattr(ts, "isoformat") else str(ts) if ts else None,
        "data_quality_warning": pred.data_quality_warning,
    }


@app.get("/irrigation")
def irrigation(crop: str = "maize", stage: str = "mid"):
    kc = DEFAULT_KC.get(crop, DEFAULT_KC["maize"]).get(stage, 1.0)
    advice = store.irrigation
    plan_mm, daily_schedule = ET0Model.plan_7day_schedule(
        current_advice=advice,
        gold_df=store.gold,
        kc=kc,
    )
    date = datetime.now(tz=timezone.utc).date().isoformat()
    return {
        "et0_today_mm": advice.et0_mm,
        "water_balance_mm": advice.soil_water_mm,
        "irrigation_required": advice.irrigation_required,
        "irrigation_amount_mm": advice.irrigation_amount_mm * (kc / max(advice.kc, 1e-6)),
        "irrigation_action": (
            f"Irrigate {advice.irrigation_amount_mm * (kc / max(advice.kc, 1e-6)):.1f} mm before 08:00 Africa/Nairobi time"
            if advice.irrigation_required
            else "No irrigation required"
        ),
        "kc": kc,
        "substituted_fields": advice.substituted_fields,
        "date_utc": date,
        "crop": crop,
        "stage": stage,
        "plan_mm": plan_mm,
        "daily_schedule": daily_schedule,
    }



@app.get("/advisories")
def advisories():
    items = [a.to_dict() for a in store.advisories]
    items.sort(key=lambda a: a["valid_from"], reverse=True)
    return items


@app.post("/assistant")
def assistant(body: AssistantRequest):
    result = _explainer().explain(
        body.question,
        api_key=body.api_key,
        provider_preference=body.provider,
    )
    return {
        "answer": result.answer,
        "response_type": result.response_type,
        "language_fallback": result.language_fallback,
        "timeout_fallback": result.timeout_fallback,
        "tool_calls": [
            {"endpoint": c["endpoint"], "called_at_utc": datetime.now(tz=timezone.utc).isoformat()}
            for c in result.tool_calls
        ],
    }


@app.post("/simulate")
def simulate(req: SimulationRequest):
    """Interactive What-If Simulation Studio for hackathon demo & evaluation."""
    scenario = (req.scenario or "normal").lower()
    presets = {
        "storm": {
            "temp_c": 18.5,
            "rh_pct": 94.0,
            "solar_wm2": 95.0,
            "wind_ms": 9.2,
            "rain_gauge_1_mm": 18.5,
            "rain_gauge_2_mm": 18.2,
            "pressure_hpa": 1004.0,
            "p_rain_3h": 0.89,
            "p_rain_24h": 0.95,
            "soil_water_mm": 12.0,
            "label": "Severe Storm & Torrential Rain",
        },
        "heatwave": {
            "temp_c": 36.8,
            "rh_pct": 74.0,
            "solar_wm2": 980.0,
            "wind_ms": 1.1,
            "rain_gauge_1_mm": 0.0,
            "rain_gauge_2_mm": 0.0,
            "pressure_hpa": 1018.0,
            "p_rain_3h": 0.04,
            "p_rain_24h": 0.10,
            "soil_water_mm": -18.5,
            "label": "Extreme Heatwave & High Radiation",
        },
        "drought": {
            "temp_c": 33.2,
            "rh_pct": 24.0,
            "solar_wm2": 880.0,
            "wind_ms": 4.8,
            "rain_gauge_1_mm": 0.0,
            "rain_gauge_2_mm": 0.0,
            "pressure_hpa": 1015.0,
            "p_rain_3h": 0.02,
            "p_rain_24h": 0.05,
            "soil_water_mm": -32.4,
            "label": "Severe Soil Drought Deficit",
        },
        "sensor_fault": {
            "temp_c": 22.0,
            "rh_pct": 65.0,
            "solar_wm2": 450.0,
            "wind_ms": 2.5,
            "rain_gauge_1_mm": 12.5,
            "rain_gauge_2_mm": 0.0,  # Cross-fail discrepancy
            "pressure_hpa": 1013.0,
            "p_rain_3h": 0.45,
            "p_rain_24h": 0.50,
            "soil_water_mm": 0.0,
            "label": "Sensor Discrepancy & QC Anomaly",
        },
        "normal": {
            "temp_c": 22.8,
            "rh_pct": 66.0,
            "solar_wm2": 420.0,
            "wind_ms": 2.6,
            "rain_gauge_1_mm": 0.0,
            "rain_gauge_2_mm": 0.0,
            "pressure_hpa": 1014.0,
            "p_rain_3h": 0.08,
            "p_rain_24h": 0.15,
            "soil_water_mm": -4.2,
            "label": "Normal Optimal Growing Conditions",
        },
    }
    base = presets.get(scenario, presets["normal"]).copy()
    if req.temp_c is not None:
        base["temp_c"] = req.temp_c
    if req.rh_pct is not None:
        base["rh_pct"] = req.rh_pct
    if req.solar_wm2 is not None:
        base["solar_wm2"] = req.solar_wm2
    if req.wind_ms is not None:
        base["wind_ms"] = req.wind_ms
    if req.rain_gauge_1_mm is not None:
        base["rain_gauge_1_mm"] = req.rain_gauge_1_mm
    if req.rain_gauge_2_mm is not None:
        base["rain_gauge_2_mm"] = req.rain_gauge_2_mm
    if req.pressure_hpa is not None:
        base["pressure_hpa"] = req.pressure_hpa

    temp = float(base["temp_c"])
    rh = float(base["rh_pct"])
    solar = float(base["solar_wm2"])
    wind = float(base["wind_ms"])
    rg1 = float(base["rain_gauge_1_mm"])
    rg2 = float(base["rain_gauge_2_mm"])
    press = float(base["pressure_hpa"])

    # QC checks
    qc_flags = {}
    qc_flags["temp_sht_c"] = "RANGE_FAIL" if not (-10.0 <= temp <= 60.0) else "OK"
    qc_flags["humidity_sht_pct"] = "RANGE_FAIL" if not (0.0 <= rh <= 100.0) else "OK"
    qc_flags["pressure_hpa"] = "RANGE_FAIL" if not (800.0 <= press <= 1100.0) else "OK"
    qc_flags["wind_speed_ms"] = "RANGE_FAIL" if not (0.0 <= wind <= 60.0) else "OK"

    # Rain gauge cross check
    if abs(rg1 - rg2) > 2.0:
        qc_flags["rain_gauge_1_mm"] = "CROSS_FAIL"
        qc_flags["rain_gauge_2_mm"] = "CROSS_FAIL"
    else:
        qc_flags["rain_gauge_1_mm"] = "OK"
        qc_flags["rain_gauge_2_mm"] = "OK"

    # Physics models
    et0_val = ET0Model.et0_fao56(
        temp_c=temp,
        rh_pct=rh,
        wind_ms=wind,
        pressure_hpa=press,
        sw_wm2=solar,
    )
    crop = req.crop or "maize"
    stage = req.stage or "mid"
    kc = DEFAULT_KC.get(crop, DEFAULT_KC["maize"]).get(stage, 1.0)

    soil_water = base["soil_water_mm"]
    deficit_threshold = -20.0
    irrigation_required = soil_water < deficit_threshold
    irrigation_amount = abs(soil_water) * kc if irrigation_required else 0.0

    wbgt = HeatStressModel.estimated_wbgt(temp, rh)
    heat_level = HeatStressModel.classify(wbgt)

    engine = DecisionEngine(deficit_threshold=deficit_threshold)
    model_outputs = {
        "p_rain_3h": base["p_rain_3h"],
        "p_rain_24h": base["p_rain_24h"],
        "water_balance": soil_water,
        "irrigation_action": (
            f"Irrigate {irrigation_amount:.1f} mm before 08:00 Africa/Nairobi time"
            if irrigation_required
            else "No irrigation required"
        ),
        "heat_level": heat_level,
        "wbgt_c": wbgt,
        "qc_flags": qc_flags,
        "observation_timestamp_utc": datetime.now(tz=timezone.utc).isoformat(),
    }
    advisories = [a.to_dict() for a in engine.evaluate(model_outputs)]

    sensors = {
        "temp_sht_c": {"value": temp, "qc_flag": qc_flags["temp_sht_c"], "anomaly_score": 0.0},
        "humidity_sht_pct": {"value": rh, "qc_flag": qc_flags["humidity_sht_pct"], "anomaly_score": 0.0},
        "pressure_hpa": {"value": press, "qc_flag": qc_flags["pressure_hpa"], "anomaly_score": 0.0},
        "wind_speed_ms": {"value": wind, "qc_flag": qc_flags["wind_speed_ms"], "anomaly_score": 0.0},
        "rain_gauge_1_mm": {
            "value": rg1,
            "qc_flag": qc_flags["rain_gauge_1_mm"],
            "anomaly_score": 0.8 if qc_flags["rain_gauge_1_mm"] != "OK" else 0.0,
        },
        "rain_gauge_2_mm": {
            "value": rg2,
            "qc_flag": qc_flags["rain_gauge_2_mm"],
            "anomaly_score": 0.8 if qc_flags["rain_gauge_2_mm"] != "OK" else 0.0,
        },
        "wbgt_c": {"value": wbgt, "qc_flag": "OK", "anomaly_score": 0.0},
        "si1145_visible": {"value": int(solar * (65535 / 800)), "qc_flag": "OK", "anomaly_score": 0.0},
    }

    return {
        "scenario": scenario,
        "label": base.get("label", scenario.capitalize()),
        "sensors": sensors,
        "et0_today_mm": round(et0_val, 2),
        "kc": kc,
        "water_balance_mm": round(soil_water, 2),
        "irrigation_required": irrigation_required,
        "irrigation_amount_mm": round(irrigation_amount, 2),
        "irrigation_action": model_outputs["irrigation_action"],
        "heat_level": heat_level,
        "wbgt_c": round(wbgt, 2),
        "p_rain_3h": base["p_rain_3h"],
        "p_rain_24h": base["p_rain_24h"],
        "advisories": advisories,
        "qc_flags": qc_flags,
        "timestamp_utc": datetime.now(tz=timezone.utc).isoformat(),
    }
