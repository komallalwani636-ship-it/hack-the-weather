"""Shared physical constants and station coordinates."""

from __future__ import annotations

JKUAT_LAT = -1.0982
JKUAT_LON = 37.0144
STATION_NAME = "JKUAT Conduit Station"
DISPLAY_TZ = "Africa/Nairobi"

# QC physical ranges
HUMIDITY_MIN, HUMIDITY_MAX = 0.0, 100.0
PRESSURE_MIN, PRESSURE_MAX = 800.0, 1100.0
TEMP_MIN, TEMP_MAX = -10.0, 60.0
WIND_MIN, WIND_MAX = 0.0, 60.0
SI1145_VIS_MIN, SI1145_VIS_MAX = 0, 65535
SI1145_IR_MIN, SI1145_IR_MAX = 0, 65535
SI1145_UV_MIN, SI1145_UV_MAX = 0, 255
WBGT_MIN, WBGT_MAX = -5.0, 55.0

RAIN_GAUGE_CROSS_MM = 2.0
TEMP_CROSS_C = 5.0
SPIKE_SIGMA = 5.0
FLATLINE_DELTA = 0.01
FLATLINE_COUNT = 10
SPIKE_WINDOW_MINUTES = 30

SENSOR_COLUMNS = [
    "rain_gauge_1_mm",
    "rain_gauge_2_mm",
    "temp_bmx_c",
    "temp_mcp_c",
    "temp_sht_c",
    "temp_wetbulb_c",
    "wbgt_c",
    "wind_speed_ms",
    "wind_direction_deg",
    "wind_gust_ms",
    "si1145_visible",
    "si1145_ir",
    "si1145_uv",
    "pressure_hpa",
    "humidity_sht_pct",
]

RANGE_BOUNDS: dict[str, tuple[float, float]] = {
    "humidity_sht_pct": (HUMIDITY_MIN, HUMIDITY_MAX),
    "pressure_hpa": (PRESSURE_MIN, PRESSURE_MAX),
    "temp_bmx_c": (TEMP_MIN, TEMP_MAX),
    "temp_mcp_c": (TEMP_MIN, TEMP_MAX),
    "temp_sht_c": (TEMP_MIN, TEMP_MAX),
    "temp_wetbulb_c": (TEMP_MIN, TEMP_MAX),
    "wbgt_c": (WBGT_MIN, WBGT_MAX),
    "wind_speed_ms": (WIND_MIN, WIND_MAX),
    "wind_gust_ms": (WIND_MIN, WIND_MAX),
    "si1145_visible": (SI1145_VIS_MIN, SI1145_VIS_MAX),
    "si1145_ir": (SI1145_IR_MIN, SI1145_IR_MAX),
    "si1145_uv": (SI1145_UV_MIN, SI1145_UV_MAX),
}

CONDUIT_FEATURE_COLS = [
    "pressure_tendency_1h",
    "pressure_tendency_3h",
    "pressure_tendency_6h",
    "rain_1h",
    "rain_3h",
    "rain_24h",
    "humidity_delta_1h",
    "temperature_delta_1h",
    "wind_gust_ratio",
    "hour_sin",
    "hour_cos",
]

OM_FEATURE_COLS = ["om_temp", "om_precip_prob", "om_rh", "om_sw_rad"]
