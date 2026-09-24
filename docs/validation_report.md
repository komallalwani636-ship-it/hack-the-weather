# M1 back-test (honest, limited history)

Live Conduit history is not yet in this checkout, so this report uses the labelled **demo climatology** plus the persistence rainfall baseline that the API falls back to when LightGBM is untrained.

| Metric | Value | Notes |
|---|---|---|
| Events tested | 0 live Conduit events | Portal credentials were not available in the implementation environment |
| Hits | n/a | Re-run after ingesting live rain events |
| Misses | n/a | |
| Mean lead time (h) | n/a | |

The shipped nowcast is `p_rain_3h = clip(rain_3h / 5, 0, 1)` (persistence) with optional LightGBM when Gold features exist. After two consecutive ingest runs, retrain with `RainRiskModel.train(gold_df)` and replace this table with walk-forward PR-AUC, Brier score, and lead time on real events.
