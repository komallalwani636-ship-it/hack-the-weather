"""Decision engine: model outputs → structured advisories."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4

from src.constants import STATION_NAME

AdvisoryType = Literal["rain_risk", "irrigation", "heat_stress"]
Severity = Literal["info", "watch", "warning"]
SEVERITY_ORDER = {"info": 0, "watch": 1, "warning": 2}


@dataclass
class Advisory:
    id: str
    type: str
    severity: str
    location: str
    valid_from: datetime
    valid_until: datetime
    action: str
    reason: str
    evidence: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["valid_from"] = self.valid_from.isoformat()
        payload["valid_until"] = self.valid_until.isoformat()
        return payload


def _now(now: datetime | None) -> datetime:
    current = now or datetime.now(tz=timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current


class DecisionEngine:
    def __init__(self, deficit_threshold: float = -20.0) -> None:
        self.deficit_threshold = deficit_threshold
        self._last_heat_level: str | None = None

    def evaluate(self, model_outputs: dict[str, Any], now: datetime | None = None) -> list[Advisory]:
        ts = _now(now)
        advisories: list[Advisory] = []
        p3 = float(model_outputs.get("p_rain_3h") or 0.0)
        p24 = float(model_outputs.get("p_rain_24h") or 0.0)
        water = float(model_outputs.get("water_balance", model_outputs.get("soil_water_mm", 0.0)) or 0.0)
        heat_level = model_outputs.get("heat_level")
        wbgt = model_outputs.get("wbgt_c")
        qc_flags = model_outputs.get("qc_flags") or {}
        obs_ts = model_outputs.get("observation_timestamp_utc", ts)
        if hasattr(obs_ts, "isoformat"):
            obs_iso = obs_ts.isoformat()
        else:
            obs_iso = str(obs_ts)

        if p3 > 0.70:
            advisories.append(
                self._advisory(
                    "rain_risk",
                    "warning",
                    ts,
                    ts + timedelta(hours=3),
                    "Delay spraying or harvest drying operations",
                    "Rain probability exceeds 70% for next 3 hours",
                    {
                        "p_rain_3h": model_outputs.get("p_rain_3h", p3),
                        "p_rain_24h": model_outputs.get("p_rain_24h", p24),
                        "threshold_3h": 0.70,
                        "observation_timestamp_utc": obs_iso,
                        "qc_flags": qc_flags,
                    },
                )
            )
        elif p24 > 0.50 and p3 <= 0.70:
            advisories.append(
                self._advisory(
                    "rain_risk",
                    "info",
                    ts,
                    ts + timedelta(hours=24),
                    "Elevated 24-hour rain probability — monitor field operations",
                    "24h rain probability exceeds 50% without an immediate 3h warning",
                    {
                        "p_rain_3h": model_outputs.get("p_rain_3h", p3),
                        "p_rain_24h": model_outputs.get("p_rain_24h", p24),
                        "threshold_24h": 0.50,
                        "observation_timestamp_utc": obs_iso,
                        "qc_flags": qc_flags,
                    },
                )
            )

        if water < self.deficit_threshold:
            amount = abs(water)
            action = model_outputs.get("irrigation_action") or (
                f"Irrigate {amount:.1f} mm before 08:00 Africa/Nairobi time"
            )
            advisories.append(
                self._advisory(
                    "irrigation",
                    "watch",
                    ts,
                    ts + timedelta(hours=24),
                    action,
                    "Water-balance deficit exceeds irrigation threshold",
                    {
                        "water_balance": model_outputs.get("water_balance", water),
                        "deficit_threshold": self.deficit_threshold,
                        "observation_timestamp_utc": obs_iso,
                        "qc_flags": qc_flags,
                    },
                )
            )

        if heat_level is None and wbgt is not None:
            from src.models.heat import HeatStressModel

            heat_level = HeatStressModel.classify(float(wbgt))
        if heat_level in ("High", "Extreme"):
            advisories.append(
                self._advisory(
                    "heat_stress",
                    "warning",
                    ts,
                    ts + timedelta(hours=3),
                    f"{heat_level} heat stress — rest in shade, drink water every 15–20 minutes, avoid outdoor physical work 10:00–15:00 EAT",
                    f"WBGT classified as {heat_level}",
                    {
                        "heat_level": heat_level,
                        "wbgt_c": model_outputs.get("wbgt_c", wbgt),
                        "observation_timestamp_utc": obs_iso,
                        "qc_flags": qc_flags,
                    },
                )
            )
        elif heat_level in ("Low", "Moderate"):
            advisories.append(
                self._advisory(
                    "heat_stress",
                    "info",
                    ts,
                    ts + timedelta(hours=3),
                    f"Current heat-stress risk is {heat_level}",
                    f"WBGT classified as {heat_level}",
                    {
                        "heat_level": heat_level,
                        "wbgt_c": model_outputs.get("wbgt_c", wbgt),
                        "observation_timestamp_utc": obs_iso,
                        "qc_flags": qc_flags,
                    },
                )
            )
        if heat_level and heat_level != self._last_heat_level:
            self._last_heat_level = heat_level
        return advisories

    @staticmethod
    def _advisory(
        type_: str,
        severity: str,
        valid_from: datetime,
        valid_until: datetime,
        action: str,
        reason: str,
        evidence: dict[str, Any],
    ) -> Advisory:
        return Advisory(
            id=str(uuid4()),
            type=type_,
            severity=severity,
            location=STATION_NAME,
            valid_from=valid_from,
            valid_until=valid_until,
            action=action,
            reason=reason,
            evidence=evidence,
        )
