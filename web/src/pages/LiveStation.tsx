import { formatEat } from "../api";
import { useApp } from "../context/AppContext";

const SENSORS: Record<string, { label: string; unit: string; precision: number }> = {
  temp_sht_c:        { label: "Temperature",  unit: "°C",  precision: 1 },
  humidity_sht_pct:  { label: "Humidity",     unit: "%",   precision: 1 },
  pressure_hpa:      { label: "Pressure",     unit: "hPa", precision: 0 },
  wind_speed_ms:     { label: "Wind speed",   unit: "m/s", precision: 1 },
  rain_gauge_1_mm:   { label: "Rain gauge 1", unit: "mm",  precision: 1 },
  rain_gauge_2_mm:   { label: "Rain gauge 2", unit: "mm",  precision: 1 },
  wbgt_c:            { label: "WBGT",         unit: "°C",  precision: 1 },
  si1145_visible:    { label: "Solar index",  unit: "",    precision: 0 },
};

const QC_LABELS: Record<string, string> = {
  OK: "ok", SPIKE: "warn", FLATLINE: "warn",
  RANGE_FAIL: "error", CROSS_FAIL: "error", MISSING: "missing",
};

function QCBadge({ flag }: { flag: string }) {
  const type = QC_LABELS[flag] || "missing";
  return (
    <span className={`badge badge-${type === "ok" ? "ok" : type === "warn" ? "warn" : type === "missing" ? "missing" : "error"}`}>
      {flag}
    </span>
  );
}

function SensorRow({
  label, value, unit, flag, precision,
}: {
  label: string; value: number | null; unit: string; flag: string; precision: number;
}) {
  const ok = flag === "OK";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 16,
        padding: "14px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <span style={{ fontSize: 13, color: ok ? "#c0c0c0" : "#666" }}>{label}</span>
      <span
        className="data-value"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: ok ? "#f0f0f0" : "#444",
          letterSpacing: "-0.01em",
        }}
      >
        {value == null ? "—" : value.toFixed(precision)}
        {value != null && unit && (
          <span style={{ fontSize: 11, color: "#555", marginLeft: 3, fontWeight: 400 }}>{unit}</span>
        )}
      </span>
      <QCBadge flag={flag} />
    </div>
  );
}

export function LiveStation() {
  const { state } = useApp();
  const sensors = state.observations?.sensors || {};
  const rain = state.rainRisk;
  const ts = state.observations?.timestamp_utc;

  const rainPct3h  = rain?.p_rain_3h  != null ? `${Math.round(rain.p_rain_3h  * 100)}%` : "—";
  const rainPct24h = rain?.p_rain_24h != null ? `${Math.round(rain.p_rain_24h * 100)}%` : "—";

  const okCount = Object.values(sensors).filter((s: any) => s?.qc_flag === "OK").length;
  const totalCount = Object.keys(SENSORS).length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Page header */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <p className="label-xs" style={{ marginBottom: 8 }}>JKUAT Conduit — Live Station</p>
            <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", margin: 0, lineHeight: 1.1 }}>
              Weather<br />Station
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="label-xs" style={{ marginBottom: 4 }}>Last updated</p>
            <p style={{ fontSize: 13, color: "#666" }}>{formatEat(ts)}</p>
          </div>
        </div>
      </div>

      {/* Key metrics strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 40,
        }}
      >
        {[
          {
            label: "Rain risk 3h",
            value: rainPct3h,
            accent: rain?.p_rain_3h != null && rain.p_rain_3h > 0.6 ? "#f59e0b" : undefined,
          },
          {
            label: "Rain risk 24h",
            value: rainPct24h,
            accent: undefined,
          },
          {
            label: "ET₀ today",
            value: state.irrigation?.et0_today_mm != null
              ? `${state.irrigation.et0_today_mm.toFixed(1)} mm`
              : "—",
            accent: undefined,
          },
          {
            label: "Sensor health",
            value: `${okCount}/${totalCount}`,
            accent: okCount < totalCount ? "#f59e0b" : "#22c55e",
          },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              padding: "20px 24px",
              background: "#111",
              borderRight: i < 3 ? "1px solid rgba(255,255,255,0.05)" : undefined,
            }}
          >
            <p className="label-xs" style={{ marginBottom: 8 }}>{m.label}</p>
            <p
              className="data-value"
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: m.accent || "#f0f0f0",
                letterSpacing: "-0.02em",
              }}
            >
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* Advisory if active */}
      {state.advisories.length > 0 && (
        <div
          style={{
            border: "1px solid rgba(245,158,11,0.25)",
            borderLeft: "3px solid #f59e0b",
            borderRadius: 6,
            padding: "16px 20px",
            background: "rgba(245,158,11,0.05)",
            marginBottom: 32,
          }}
        >
          <p className="label-xs" style={{ color: "#f59e0b", marginBottom: 6 }}>
            Active advisory
          </p>
          <p style={{ fontSize: 14, color: "#e0e0e0", lineHeight: 1.5 }}>
            {state.advisories[0].action}
          </p>
          {state.advisories.length > 1 && (
            <p style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
              +{state.advisories.length - 1} more advisory{state.advisories.length > 2 ? "ies" : "y"} — see Alerts
            </p>
          )}
        </div>
      )}

      {/* Two-column layout: sensors left, forecast right */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 48, alignItems: "start" }}>
        {/* Sensor readings */}
        <div>
          <p className="label-xs" style={{ marginBottom: 4 }}>Sensor readings</p>
          <div>
            {Object.entries(SENSORS).map(([key, meta]) => {
              const reading = sensors[key] || { value: null, qc_flag: "MISSING" };
              return (
                <SensorRow
                  key={key}
                  label={meta.label}
                  value={reading.value}
                  unit={meta.unit}
                  flag={reading.qc_flag}
                  precision={meta.precision}
                />
              );
            })}
          </div>
        </div>

        {/* Sidebar: forecast */}
        <div>
          <p className="label-xs" style={{ marginBottom: 16 }}>3-day forecast</p>
          {state.forecast?.daily?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {state.forecast.daily.slice(0, 3).map((day: any, i: number) => (
                <div
                  key={i}
                  className="surface"
                  style={{
                    padding: "14px 16px",
                    borderRadius: i === 0 ? "6px 6px 0 0" : i === 2 ? "0 0 6px 6px" : 0,
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>
                    <p style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
                      {i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(day.date).toLocaleDateString("en-GB", { weekday: "short" })}
                    </p>
                    <p style={{ fontSize: 12, color: "#888" }}>
                      {day.condition_text || "—"}
                    </p>
                  </div>
                  <p className="data-value" style={{ fontSize: 14, color: "#f0f0f0" }}>
                    {day.precip_prob != null ? `${Math.round(day.precip_prob * 100)}%` : "—"}
                    <span style={{ fontSize: 10, color: "#555", marginLeft: 2 }}>rain</span>
                  </p>
                  <div style={{ textAlign: "right" }}>
                    <p className="data-value" style={{ fontSize: 14, color: "#f0f0f0" }}>
                      {day.temp_max_c != null ? `${day.temp_max_c.toFixed(0)}°` : "—"}
                    </p>
                    <p style={{ fontSize: 11, color: "#555" }}>
                      {day.temp_min_c != null ? `${day.temp_min_c.toFixed(0)}°` : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="surface" style={{ padding: "24px 16px", borderRadius: 6, textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#444" }}>Forecast unavailable</p>
            </div>
          )}

          {/* Water balance */}
          <div style={{ marginTop: 24 }}>
            <p className="label-xs" style={{ marginBottom: 16 }}>Irrigation status</p>
            <div className="surface" style={{ padding: "20px", borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: "#666" }}>Water balance</p>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: state.irrigation?.irrigation_required ? "#f59e0b" : "#22c55e",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {state.irrigation?.irrigation_required ? "Required" : "OK"}
                </span>
              </div>
              <p
                className="data-value"
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: state.irrigation?.water_balance_mm != null && state.irrigation.water_balance_mm < 0
                    ? "#f59e0b"
                    : "#f0f0f0",
                  marginBottom: 8,
                }}
              >
                {state.irrigation?.water_balance_mm != null
                  ? `${state.irrigation.water_balance_mm.toFixed(1)} mm`
                  : "—"
                }
              </p>
              <p style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                {state.irrigation?.irrigation_action || "Loading…"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
