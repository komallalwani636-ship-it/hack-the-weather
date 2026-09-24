# M2 Anomaly detection

Rolling z-score (window `M2_WINDOW_HOURS`, default 24) combined with Isolation Forest.

- `anomaly_score` is clipped to [0, 1]
- `fault_flag` is true when the score is ≥ 0.5, or when the two rain gauges differ by more than 2 mm/h
- Evaluation on injected faults should be recorded here after a live Conduit archive exists
