"""M5 WBGT heat-stress classifier (ISO 7933 adapted)."""

from __future__ import annotations

import math
from dataclasses import dataclass

from src.paths import MODELS_DIR

LEVELS = ("Low", "Moderate", "High", "Extreme")
LEVEL_ORDER = {name: i for i, name in enumerate(LEVELS)}


@dataclass
class HeatStressResult:
    level: str
    wbgt_c: float
    wbgt_source: str


class HeatStressModel:
    def __init__(self) -> None:
        path = MODELS_DIR / "m5_heat" / "model_card.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            """# M5 Heat stress

Thresholds adapted from ISO 7933 / WBGT occupational guidance for Kenyan highland (JKUAT) conditions:

- Low: WBGT < 28 °C
- Moderate: 28 ≤ WBGT < 32 °C
- High: 32 ≤ WBGT < 35 °C
- Extreme: WBGT ≥ 35 °C

When the station WBGT sensor is flagged, WBGT is estimated with the Bernard simplified formula.
""",
            encoding="utf-8",
        )

    @staticmethod
    def classify(wbgt_c: float) -> str:
        if wbgt_c < 28.0:
            return "Low"
        if wbgt_c < 32.0:
            return "Moderate"
        if wbgt_c < 35.0:
            return "High"
        return "Extreme"

    @staticmethod
    def estimated_wbgt(temp_c: float, rh_pct: float) -> float:
        t_k = float(temp_c) + 273.16
        rh = min(max(float(rh_pct), 0.0), 100.0)
        e = (rh / 100.0) * 6.105 * math.exp(25.22 * (t_k - 273.16) / t_k - 5.31 * math.log(t_k / 273.16))
        wbgt = 0.567 * float(temp_c) + 0.393 * e + 3.94
        return min(max(wbgt, -5.0), 55.0)

    def evaluate(
        self, wbgt_c: float | None, qc_flag: str = "OK", temp_c: float | None = None, rh_pct: float | None = None
    ) -> HeatStressResult:
        source = "station"
        value = wbgt_c
        if qc_flag != "OK" or value is None:
            if temp_c is None or rh_pct is None:
                value = 20.0
            else:
                value = self.estimated_wbgt(temp_c, rh_pct)
            source = "estimated"
        return HeatStressResult(level=self.classify(float(value)), wbgt_c=float(value), wbgt_source=source)
