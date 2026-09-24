# M3 Radiation calibration

SI1145 visible / IR / UV indices are **not** W/m². This model maps them to shortwave radiation.

- Baseline: non-negative Ridge on (vis, IR, UV)
- Labels: NASA POWER `ALLSKY_SFC_SW_DWN` when present; Open-Meteo shortwave otherwise
- Inference fallback: `qc_flag != OK` → Open-Meteo hourly shortwave, `radiation_source = open_meteo_fallback`
- Output is clamped to ≥ 0 and, in daylight, ≤ 1400 W/m²
