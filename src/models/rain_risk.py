"""M1 Rain-risk LightGBM classifier."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from src.constants import CONDUIT_FEATURE_COLS, OM_FEATURE_COLS
from src.paths import MODELS_DIR

logger = logging.getLogger(__name__)

INSUFFICIENT = {"error": "insufficient_data", "detail": "No features available for inference"}


@dataclass
class RainRiskPrediction:
    p_rain_3h: float
    p_rain_24h: float
    data_quality_warning: str | None = None
    insufficient_data: bool = False


class RainRiskModel:
    def __init__(self) -> None:
        self.model_3h = None
        self.model_24h = None
        self.feature_names = CONDUIT_FEATURE_COLS + OM_FEATURE_COLS
        self.trained = False

    def _vector(self, features: dict | pd.Series) -> np.ndarray:
        if isinstance(features, pd.Series):
            features = features.to_dict()
        return np.array([_num(features.get(name)) for name in self.feature_names], dtype=float)

    def train(self, features_df: pd.DataFrame, log_mlflow: bool = False) -> dict[str, Any]:
        df = features_df.copy()
        df = df.sort_values("timestamp_utc") if "timestamp_utc" in df.columns else df
        if "rain_3h" in df.columns:
            y3 = (df["rain_3h"].shift(-3).fillna(0) >= 1.0).astype(int)
            y24 = (df["rain_24h"].shift(-24).fillna(0) >= 10.0).astype(int)
        else:
            y3 = (df.get("rain_1h", 0) >= 1.0).astype(int)
            y24 = y3
        X = df.reindex(columns=self.feature_names)
        # persistence-friendly monotone LightGBM on rain_3h
        try:
            import lightgbm as lgb

            monotone = [1 if name == "rain_3h" else 0 for name in self.feature_names]
            params = {
                "n_estimators": 40,
                "learning_rate": 0.1,
                "max_depth": 3,
                "verbosity": -1,
                "monotone_constraints": monotone,
            }
            mask = ~X.isna().all(axis=1)
            self.model_3h = lgb.LGBMClassifier(**params)
            self.model_24h = lgb.LGBMClassifier(**params)
            if mask.sum() >= 10 and y3.nunique() > 1:
                self.model_3h.fit(X.fillna(0)[mask], y3[mask])
                self.model_24h.fit(X.fillna(0)[mask], y24[mask])
                self.trained = True
            else:
                self.trained = False
        except Exception as exc:  # noqa: BLE001
            logger.warning("LightGBM train skipped: %s", exc)
            self.trained = False

        metrics = {
            "pr_auc": 0.0,
            "recall_at_p80": 0.0,
            "brier": 1.0,
            "date_range": (
                str(df["timestamp_utc"].min()) if "timestamp_utc" in df else None,
                str(df["timestamp_utc"].max()) if "timestamp_utc" in df else None,
            ),
        }
        if log_mlflow:
            try:
                import mlflow

                with mlflow.start_run(run_name="m1_rain_risk"):
                    mlflow.log_metrics(
                        {
                            "pr_auc": metrics["pr_auc"],
                            "recall_at_p80": metrics["recall_at_p80"],
                            "brier": metrics["brier"],
                        }
                    )
                    mlflow.log_params({"n_estimators": 40, "max_depth": 3})
            except Exception as exc:  # noqa: BLE001
                logger.warning("MLflow logging skipped: %s", exc)
        self._write_model_card(metrics)
        return metrics

    def predict(self, feature_vector: dict | pd.Series) -> RainRiskPrediction:
        if isinstance(feature_vector, pd.Series):
            feature_vector = feature_vector.to_dict()
        conduit_missing = all(_missing(feature_vector.get(c)) for c in CONDUIT_FEATURE_COLS)
        om_missing = all(_missing(feature_vector.get(c)) for c in OM_FEATURE_COLS)
        if conduit_missing and om_missing:
            return RainRiskPrediction(0.0, 0.0, insufficient_data=True)
        warning = "Open-Meteo features missing" if om_missing else None
        rain_3h = _num(feature_vector.get("rain_3h")) or 0.0
        rain_24h = _num(feature_vector.get("rain_24h")) or 0.0
        # Persistence baseline always available; LightGBM used when trained.
        p3 = float(np.clip(rain_3h / 5.0, 0.0, 1.0))
        p24 = float(np.clip(rain_24h / 20.0, 0.0, 1.0))
        if self.trained and self.model_3h is not None:
            x = self._vector(feature_vector).reshape(1, -1)
            x = np.nan_to_num(x, nan=0.0)
            try:
                p3 = float(self.model_3h.predict_proba(x)[0, 1])
                p24 = float(self.model_24h.predict_proba(x)[0, 1])
            except Exception:  # noqa: BLE001
                pass
        p3 = float(np.clip(p3, 0.0, 1.0))
        p24 = float(np.clip(p24, 0.0, 1.0))
        return RainRiskPrediction(p3, p24, data_quality_warning=warning)

    def _write_model_card(self, metrics: dict) -> None:
        path = MODELS_DIR / "m1_rain_risk" / "model_card.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"""# M1 RainRisk model card

- Geographic scope: JKUAT Conduit station only (`-1.0982`, `37.0144`)
- Conduit history length: limited; NASA POWER / Open-Meteo used as labelled historical surrogates
- Gaps: expected missing overnight / station outages
- Metrics: PR_AUC={metrics.get("pr_auc")}, Brier={metrics.get("brier")}
- Fallback: persistence of rolling rainfall when LightGBM is not trained
""",
            encoding="utf-8",
        )


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(number):
        return None
    return number


def _missing(value: Any) -> bool:
    return _num(value) is None
