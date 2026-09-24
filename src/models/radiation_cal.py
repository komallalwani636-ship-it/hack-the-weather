"""M3 SI1145 → shortwave radiation (W/m²)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from src.paths import MODELS_DIR

logger = logging.getLogger(__name__)


@dataclass
class RadiationPrediction:
    sw_wm2: float
    radiation_source: str
    raw_prediction: float


class RadiationCalModel:
    def __init__(self) -> None:
        # Positive visible weight ensures monotonic visible-index behaviour.
        self.w_vis = 1000.0 / 65535.0
        self.w_ir = 80.0 / 65535.0
        self.w_uv = 40.0 / 255.0
        self.intercept = 0.0
        self.lgbm = None

    def train(self, vis, ir, uv, labels, label_source: str = "nasa_power") -> dict:
        vis = np.asarray(vis, dtype=float)
        ir = np.asarray(ir, dtype=float)
        uv = np.asarray(uv, dtype=float)
        y = np.asarray(labels, dtype=float)
        X = np.column_stack([vis, ir, uv])
        try:
            from sklearn.linear_model import Ridge

            ridge = Ridge(alpha=1.0, positive=True)
            ridge.fit(X, y)
            self.w_vis, self.w_ir, self.w_uv = (float(c) for c in ridge.coef_)
            self.intercept = float(ridge.intercept_)
            if self.w_vis < 0:
                self.w_vis = abs(self.w_vis)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Ridge train skipped: %s", exc)
        pred = self._raw(vis, ir, uv)
        mae = float(np.mean(np.abs(np.maximum(pred, 0) - y))) if len(y) else None
        metrics = {"mae": mae, "r2": None, "label_source": label_source}
        path = MODELS_DIR / "m3_radiation" / "model_card.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"""# M3 Radiation calibration

SI1145 outputs are uncalibrated indices, not W/m².
Primary labels: {label_source} shortwave radiation.
MAE: {mae}
""",
            encoding="utf-8",
        )
        return metrics

    def _raw(self, vis, ir, uv) -> np.ndarray:
        return self.intercept + self.w_vis * vis + self.w_ir * ir + self.w_uv * uv

    def predict(
        self,
        vis: float,
        ir: float,
        uv: float,
        qc_flag: str = "OK",
        open_meteo_sw: float | None = None,
        daylight: bool = True,
    ) -> RadiationPrediction:
        if qc_flag != "OK" and open_meteo_sw is not None:
            value = max(0.0, float(open_meteo_sw))
            if daylight:
                value = min(value, 1400.0)
            return RadiationPrediction(value, "open_meteo_fallback", value)
        raw = float(self._raw(np.array([vis]), np.array([ir]), np.array([uv]))[0])
        clamped = max(0.0, raw)
        if daylight:
            clamped = min(clamped, 1400.0)
        if raw < 0:
            logger.warning("Negative radiation prediction %s clamped to 0", raw)
        return RadiationPrediction(clamped, "si1145_calibrated", raw)
