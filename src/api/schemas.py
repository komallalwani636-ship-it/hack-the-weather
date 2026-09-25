from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    error: str
    detail: str


class HealthResponse(BaseModel):
    status: str
    data_last_updated_utc: Optional[str] = None
    storage_fallback: Optional[str] = None


class SensorReading(BaseModel):
    value: Optional[float] = None
    qc_flag: str
    anomaly_score: float = 0.0
    fault_flag: bool = False


class LatestObservations(BaseModel):
    timestamp_utc: str
    sensors: dict[str, SensorReading]
    data_quality_warning: Optional[str] = None
    data_source: Optional[str] = None


class RainRiskResponse(BaseModel):
    p_rain_3h: float
    p_rain_24h: float
    feature_timestamp_utc: Optional[str] = None
    data_quality_warning: Optional[str] = None


class IrrigationResponse(BaseModel):
    et0_today_mm: float
    water_balance_mm: float
    irrigation_required: bool
    irrigation_amount_mm: float
    irrigation_action: str
    kc: float
    substituted_fields: list[str] = Field(default_factory=list)
    date_utc: str
    crop: Optional[str] = None
    stage: Optional[str] = None
    plan_mm: list[float] = Field(default_factory=list)
    daily_schedule: list[dict[str, Any]] = Field(default_factory=list)


class AssistantRequest(BaseModel):
    question: str
    api_key: Optional[str] = None
    provider: Optional[str] = None


class AssistantResponse(BaseModel):
    answer: str
    response_type: str
    language_fallback: bool = False
    timeout_fallback: bool = False
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


class SimulationRequest(BaseModel):
    scenario: Optional[str] = "normal"  # normal, storm, drought, heatwave, sensor_fault, custom
    temp_c: Optional[float] = None
    rh_pct: Optional[float] = None
    solar_wm2: Optional[float] = None
    wind_ms: Optional[float] = None
    rain_gauge_1_mm: Optional[float] = None
    rain_gauge_2_mm: Optional[float] = None
    pressure_hpa: Optional[float] = None
    crop: Optional[str] = "maize"
    stage: Optional[str] = "mid"
