"""M4 FAO-56 Penman-Monteith ET0 and water-balance irrigation model."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from src.paths import MODELS_DIR

DEFAULT_KC = {
    "maize": {"initial": 0.3, "mid": 1.2, "late": 0.6},
    "beans": {"initial": 0.4, "mid": 1.15, "late": 0.35},
    "pasture": {"initial": 0.4, "mid": 0.95, "late": 0.85},
}


@dataclass
class IrrigationAdvice:
    et0_mm: float
    soil_water_mm: float
    soil_water_unclamped_mm: float
    irrigation_required: bool
    irrigation_amount_mm: float
    action: str
    kc: float
    substituted_fields: list[str] = field(default_factory=list)


class ET0Model:
    def __init__(self, deficit_threshold: float = -20.0, kc: float = 1.0) -> None:
        if deficit_threshold > -5.0 or deficit_threshold < -100.0:
            deficit_threshold = -20.0
        self.deficit_threshold = deficit_threshold
        self.kc = kc
        self.soil_water = 0.0
        self._write_card()

    def _write_card(self) -> None:
        path = MODELS_DIR / "m4_et0" / "model_card.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            """# M4 ET0 / water balance

FAO-56 Penman-Monteith:

`ET0 = [0.408·Δ·(Rn-G) + γ·(900/(T+273))·u2·(es-ea)] / [Δ + γ·(1+0.34·u2)]`

Default Kc values:
- maize: initial 0.3, mid 1.2, late 0.6
- beans: initial 0.4, mid 1.15, late 0.35
- pasture: initial 0.4, mid 0.95, late 0.85

Missing sensor values are substituted from Open-Meteo.
""",
            encoding="utf-8",
        )

    @staticmethod
    def et0_fao56(
        temp_c: float,
        rh_pct: float,
        wind_ms: float,
        pressure_hpa: float,
        sw_wm2: float,
        daytime: bool = True,
    ) -> float:
        t = float(temp_c)
        rh = min(max(float(rh_pct), 0.0), 100.0)
        u2 = max(float(wind_ms), 0.0)
        p_kpa = float(pressure_hpa) / 10.0
        rs = max(float(sw_wm2), 0.0) * 0.0864  # W/m² daily mean → MJ/m²/day
        rn = 0.77 * rs
        g = 0.1 * rn if daytime else 0.5 * rn
        es = 0.6108 * math.exp(17.27 * t / (t + 237.3))
        ea = es * (rh / 100.0)
        delta = 4098.0 * es / (t + 237.3) ** 2
        gamma = 0.000665 * p_kpa
        numerator = 0.408 * delta * (rn - g) + gamma * (900.0 / (t + 273.0)) * u2 * (es - ea)
        denom = delta + gamma * (1.0 + 0.34 * u2)
        et0 = numerator / denom if denom else 0.0
        return float(min(max(et0, 0.0), 15.0))

    def step(
        self,
        rain_mm: float,
        temp_c: float,
        rh_pct: float,
        wind_ms: float,
        pressure_hpa: float,
        sw_wm2: float,
        qc_flags: dict[str, str] | None = None,
        om_values: dict[str, float] | None = None,
        kc: float | None = None,
        daytime: bool = True,
    ) -> IrrigationAdvice:
        substituted: list[str] = []
        fields = {
            "temp_c": temp_c,
            "rh_pct": rh_pct,
            "wind_ms": wind_ms,
            "pressure_hpa": pressure_hpa,
            "sw_wm2": sw_wm2,
        }
        qc_flags = qc_flags or {}
        om_values = om_values or {}
        mapping = {
            "temp_c": "om_temp",
            "rh_pct": "om_rh",
            "wind_ms": "om_wind",
            "pressure_hpa": "om_pressure",
            "sw_wm2": "om_sw_rad",
        }
        for field_name, om_key in mapping.items():
            flag = qc_flags.get(field_name, "OK")
            if flag != "OK" and om_key in om_values and om_values[om_key] is not None:
                fields[field_name] = float(om_values[om_key])
                substituted.append(field_name)
        kc_use = float(self.kc if kc is None else kc)
        et0 = self.et0_fao56(
            fields["temp_c"],
            fields["rh_pct"],
            fields["wind_ms"],
            fields["pressure_hpa"],
            fields["sw_wm2"],
            daytime=daytime,
        )
        unclamped = self.soil_water + float(rain_mm) - et0 * kc_use
        clamped = min(max(unclamped, -150.0), 0.0)
        self.soil_water = clamped
        amount = max(0.0, abs(clamped)) if clamped < self.deficit_threshold else 0.0
        required = clamped < self.deficit_threshold
        action = f"Irrigate {amount:.1f} mm before 08:00 Africa/Nairobi time" if required else "No irrigation required"
        return IrrigationAdvice(
            et0_mm=et0,
            soil_water_mm=clamped,
            soil_water_unclamped_mm=unclamped,
            irrigation_required=required,
            irrigation_amount_mm=amount,
            action=action,
            kc=kc_use,
            substituted_fields=substituted,
        )

    def reset(self) -> None:
        self.soil_water = 0.0

    @staticmethod
    def water_balance_unclamped(rains: list[float], et0s: list[float], kc: float, start: float = 0.0) -> float:
        soil = start
        for rain, et0 in zip(rains, et0s):
            soil = soil + rain - et0 * kc
        return soil
