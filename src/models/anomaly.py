"""M2 rolling z-score + Isolation Forest anomaly detector."""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np

from src.constants import RAIN_GAUGE_CROSS_MM


@dataclass
class AnomalyResult:
    anomaly_score: float
    fault_flag: bool


class AnomalyModel:
    def __init__(self, window_hours: int | None = None) -> None:
        env = os.environ.get("M2_WINDOW_HOURS", "")
        if window_hours is None:
            window_hours = int(env) if env.strip().isdigit() else 24
        self.window_hours = min(max(int(window_hours), 1), 168)
        self._history: list[float] = []
        self._forest = None

    def _combine(self, value: float) -> float:
        hist = np.array(self._history[-self.window_hours * 12 :] or [value], dtype=float)
        mean = float(hist.mean())
        std = float(hist.std(ddof=0) or 1.0)
        z = abs(value - mean) / std
        z_score = float(np.clip(z / 6.0, 0.0, 1.0))
        iso = 0.0
        if self._forest is not None:
            try:
                raw = -self._forest.decision_function(np.array([[value]]))[0]
                iso = float(np.clip((raw + 0.5) / 1.0, 0.0, 1.0))
            except Exception:  # noqa: BLE001
                iso = 0.0
        return float(np.clip(0.6 * z_score + 0.4 * iso, 0.0, 1.0))

    def fit(self, values: list[float]) -> None:
        self._history = [float(v) for v in values]
        if len(self._history) >= 10:
            try:
                from sklearn.ensemble import IsolationForest

                self._forest = IsolationForest(n_estimators=32, random_state=42)
                self._forest.fit(np.array(self._history).reshape(-1, 1))
            except Exception:  # noqa: BLE001
                self._forest = None

    def score(
        self,
        reading: float,
        gauge_1: float | None = None,
        gauge_2: float | None = None,
    ) -> AnomalyResult:
        value = float(reading)
        score = self._combine(value)
        fault = score >= 0.5
        if gauge_1 is not None and gauge_2 is not None:
            if abs(float(gauge_1) - float(gauge_2)) > RAIN_GAUGE_CROSS_MM:
                fault = True
        return AnomalyResult(anomaly_score=float(np.clip(score, 0.0, 1.0)), fault_flag=fault)
