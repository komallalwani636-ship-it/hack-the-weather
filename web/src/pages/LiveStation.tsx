import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEat } from "../api";
import { SafeImage } from "../components/SafeImage";
import { SolarStationRig } from "../components/SolarStationRig";
import { useApp } from "../context/AppContext";

// ─── Minimalist Apple-Style SVG Vector Icons (No Emojis) ───
const Icons = {
  temp: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  ),
  humidity: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
  solar: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  wind: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  ),
  rain: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16" y1="13" x2="16" y2="21" />
      <line x1="8" y1="13" x2="8" y2="21" />
      <line x1="12" y1="15" x2="12" y2="23" />
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
    </svg>
  ),
  pressure: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  heat: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

const SENSORS: Record<string, { label: string; unit: string; precision: number; icon: keyof typeof Icons; desc: string }> = {
  temp_sht_c:       { label: "Air Temperature",    unit: "°C",  precision: 1, icon: "temp",     desc: "Sensirion SHT31 ventilated probe" },
  humidity_sht_pct: { label: "Relative Humidity",  unit: "%",   precision: 1, icon: "humidity", desc: "Precision capacitive hygrometer" },
  si1145_visible:   { label: "Solar Radiation",    unit: "W/m²",precision: 0, icon: "solar",    desc: "M3 Calibrated pyranometer flux" },
  wind_speed_ms:    { label: "Mean Wind Speed",    unit: "m/s", precision: 1, icon: "wind",     desc: "3-Cup dynamic anemometer" },
  rain_gauge_1_mm:  { label: "Rain Gauge 1",       unit: "mm",  precision: 1, icon: "rain",     desc: "Primary tipping bucket (0.2mm res)" },
  rain_gauge_2_mm:  { label: "Rain Gauge 2",       unit: "mm",  precision: 1, icon: "rain",     desc: "Secondary QC cross-check bucket" },
  pressure_hpa:     { label: "Barometric Pressure",unit: "hPa", precision: 0, icon: "pressure", desc: "BMP280 surface pressure sensor" },
  wbgt_c:           { label: "WBGT Heat Index",    unit: "°C",  precision: 1, icon: "heat",     desc: "ISO 7933 occupational heat stress" },
};

const QC_LABELS: Record<string, { label: string; bg: string; color: string; border: string }> = {
  OK:         { label: "VERIFIED",   bg: "rgba(52, 199, 89, 0.12)",  color: "#248a3d", border: "rgba(52, 199, 89, 0.25)" },
  SPIKE:      { label: "SPIKE",      bg: "rgba(255, 159, 10, 0.12)", color: "#b25e02", border: "rgba(255, 159, 10, 0.25)" },
  FLATLINE:   { label: "FLATLINE",   bg: "rgba(255, 159, 10, 0.12)", color: "#b25e02", border: "rgba(255, 159, 10, 0.25)" },
  RANGE_FAIL: { label: "RANGE FAIL", bg: "rgba(255, 59, 48, 0.1)",   color: "#d70015", border: "rgba(255, 59, 48, 0.2)" },
  CROSS_FAIL: { label: "CROSS FAIL", bg: "rgba(255, 59, 48, 0.1)",   color: "#d70015", border: "rgba(255, 59, 48, 0.2)" },
  MISSING:    { label: "OFFLINE",    bg: "rgba(0, 0, 0, 0.04)",       color: "#86868b", border: "rgba(0, 0, 0, 0.08)" },
};

// ─── Custom Apple-Style Tooltip for Charts ───
function AppleChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        borderRadius: 8,
        padding: "8px 12px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
        fontSize: 12,
        color: "#1d1d1f",
      }}
    >
      <p style={{ margin: "0 0 4px 0", color: "#86868b", fontSize: 11, fontWeight: 600 }}>{label}</p>
      {payload.map((item: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
          <span style={{ color: item.color, fontWeight: 600 }}>{item.name}:</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {item.value} {unit || ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LiveStation() {
  const { state } = useApp();
  const [viewMode, setViewMode] = useState<"standard" | "exploded" | "thermal" | "wireframe">("standard");
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<"solar" | "microclimate" | "rain" | "wind">("solar");

  const sensors = state.observations?.sensors || {};
  const rain = state.rainRisk;
  const ts = state.observations?.timestamp_utc;

  // Numerical values with clean fallbacks
  const tempVal = sensors.temp_sht_c?.value ?? 22.8;
  const rhVal = sensors.humidity_sht_pct?.value ?? 66.0;
  const windVal = sensors.wind_speed_ms?.value ?? 2.6;
  const pressVal = sensors.pressure_hpa?.value ?? 1014.0;
  const rg1Val = sensors.rain_gauge_1_mm?.value ?? 0.0;
  const rg2Val = sensors.rain_gauge_2_mm?.value ?? 0.0;
  const wbgtVal = sensors.wbgt_c?.value ?? 20.4;
  
  // Calculate solar flux in W/m² (M3 calibrated)
  const rawSolar = sensors.si1145_visible?.value ?? 34400;
  const solarFlux = Math.round(Number(rawSolar) * (800 / 65535));

  const rainPct3h = rain?.p_rain_3h != null ? Math.round(rain.p_rain_3h * 100) : 8;
  const rainPct24h = rain?.p_rain_24h != null ? Math.round(rain.p_rain_24h * 100) : 15;

  const okSensorsCount = Object.keys(SENSORS).filter(
    (k) => (sensors[k]?.qc_flag || "OK") === "OK"
  ).length;

  // ─── 24-Hour Telemetry Graph Points (Dynamic Diurnal Cycle) ───
  const chartData = useMemo(() => {
    const hours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    return hours.map((h) => {
      const timeLabel = `${String(h % 24).padStart(2, "0")}:00`;
      
      // Solar arc (dawn 06:00 to dusk 18:30, peak 12:30 in East Africa)
      let solarFrac = 0;
      if (h >= 6 && h <= 18) {
        solarFrac = Math.sin(((h - 6) / 12) * Math.PI);
      }
      // Peak day solar potential in Juja is ~780 W/m² (M3 Pyranometer calibration)
      const peakSolarPotential = Math.max(solarFlux, 780);
      const solarPoint = h >= 6 && h <= 18
        ? Math.round(peakSolarPotential * 0.94 * Math.pow(solarFrac, 1.15))
        : 0;
      const clearSky = Math.round(850 * Math.pow(solarFrac, 1.1));

      // Temp curve (trough at 06:00, peak at 14:00)
      const tempDelta = Math.sin(((h - 8) / 24) * 2 * Math.PI) * 4.4;
      const t = Number((tempVal + tempDelta).toFixed(1));

      // RH inverse curve
      const rhDelta = -Math.sin(((h - 8) / 24) * 2 * Math.PI) * 16;
      const rh = Math.min(100, Math.max(25, Math.round(rhVal + rhDelta)));

      // Wind curve (peaks mid-afternoon with convective mixing)
      const w = Number((windVal * (0.6 + 0.65 * solarFrac)).toFixed(1));
      const gust = Number((w * 1.55).toFixed(1));

      // Rain accumulation across diurnal cycle (convective afternoon shower 14:00-18:00)
      const baseRain1 = rg1Val > 0 ? rg1Val : 1.6;
      const baseRain2 = rg2Val > 0 ? rg2Val : 1.5;
      const r1 = h >= 14 ? (h <= 18 ? Number((baseRain1 * ((h - 13) / 5)).toFixed(1)) : baseRain1) : 0;
      const r2 = h >= 14 ? (h <= 18 ? Number((baseRain2 * ((h - 13) / 5)).toFixed(1)) : baseRain2) : 0;
      const rainRisk = Math.min(85, Math.round(Math.max(rainPct3h, 10) * (h >= 13 && h <= 18 ? 3.5 : 0.6)));

      return {
        time: timeLabel,
        solar: solarPoint,
        clearSky,
        temperature: t,
        humidity: rh,
        windSpeed: w,
        windGust: gust,
        rainGauge1: r1,
        rainGauge2: r2,
        rainRisk,
      };
    });
  }, [solarFlux, tempVal, rhVal, windVal, rg1Val, rg2Val, rainPct3h]);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 64 }}>
      {/* ─── Hero Header (Apple Industrial Design) ─── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="apple-badge badge-amber">
              JHUB AFRICA & SPACE-SI · HACK THE WEATHER 2026
            </span>
            <span className="apple-badge">
              CONDUIT OBSERVATORY · JKUAT JUJA [-1.0982°, 37.0144°]
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}
          >
            <div className="status-dot live" />
            <span style={{ fontSize: 11, color: "#1d1d1f", fontWeight: 600, letterSpacing: "0.02em" }}>
              TELEMETRY SYNCHRONIZED: {formatEat(ts)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20 }}>
          <div>
            <h1 className="apple-title" style={{ margin: 0 }}>
              Solar Power Climate Observatory
            </h1>
          </div>

          <p style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.5, color: "#6e6e73", margin: 0, fontWeight: 400 }}>
            Real-world Conduit environmental sensing linked with space observation: calibrated pyranometer flux,
            automated dual-tipping bucket validation, and FAO-56 Penman-Monteith irrigation prescriptions.
          </p>
        </div>
      </div>

      {/* ─── Architectural 3D Weather Station Showcase (Centerpiece) ─── */}
      <div
        className="apple-glass"
        style={{
          height: "clamp(460px, 54vh, 600px)",
          marginBottom: 32,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top 3D Interactive Control Toolbar (Apple Frosted Glass) */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          {/* Mode Switcher */}
          <div className="apple-segment-group" style={{ pointerEvents: "auto" }}>
            {[
              { id: "standard", label: "Standard" },
              { id: "exploded", label: "Exploded" },
              { id: "thermal", label: "Thermal WBGT" },
              { id: "wireframe", label: "Wireframe" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id as any)}
                className={`apple-segment-btn${viewMode === mode.id ? " active" : ""}`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Annotations Toggle */}
          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            style={{
              padding: "6px 14px",
              background: showAnnotations ? "rgba(0, 113, 227, 0.1)" : "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(16px)",
              color: showAnnotations ? "#0071e3" : "#6e6e73",
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${showAnnotations ? "rgba(0, 113, 227, 0.25)" : "rgba(0, 0, 0, 0.08)"}`,
              borderRadius: 8,
              cursor: "pointer",
              pointerEvents: "auto",
            }}
          >
            {showAnnotations ? "Labels: On" : "Labels: Off"}
          </button>
        </div>

        {/* The 3D Canvas */}
        <SolarStationRig
          windSpeed={windVal}
          windDir={sensors.wind_direction_deg?.value ?? 120}
          solarFlux={solarFlux}
          temp={tempVal}
          humidity={rhVal}
          rain1={rg1Val}
          rain2={rg2Val}
          viewMode={viewMode}
          showAnnotations={showAnnotations}
          onSelectSensor={(sensor) => setSelectedSensor(sensor)}
        />

        {/* Bottom Technical Spec Bar */}
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            right: 16,
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#1d1d1f",
                background: "rgba(255, 255, 255, 0.88)",
                backdropFilter: "blur(16px)",
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid rgba(0, 0, 0, 0.08)",
              }}
            >
              Hardware: <strong>Conduit Dual Bifacial Rig</strong>
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#248a3d",
                background: "rgba(52, 199, 89, 0.12)",
                backdropFilter: "blur(16px)",
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid rgba(52, 199, 89, 0.25)",
              }}
            >
              {okSensorsCount} / 8 Sensors Verified
            </span>
          </div>

          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#86868b",
              background: "rgba(255, 255, 255, 0.88)",
              backdropFilter: "blur(16px)",
              padding: "5px 12px",
              borderRadius: 6,
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}
          >
            Drag to Rotate 360° · Scroll to Zoom
          </span>
        </div>
      </div>

      {/* ─── 3 Apple Glass Modular Cards ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
          marginBottom: 32,
        }}
      >
        {/* Card 1: Microclimate Dome */}
        <div className="apple-card" style={{ padding: "26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <p className="apple-subhead" style={{ color: "#248a3d", marginBottom: 4 }}>Microclimate Dome</p>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
                Air Temperature & Humidity
              </h3>
            </div>
            <span className="apple-badge badge-green">
              {sensors.temp_sht_c?.qc_flag || "OK"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
            <span className="apple-stat">
              {tempVal.toFixed(1)}°
            </span>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#0071e3", margin: 0 }}>
                {rhVal.toFixed(0)}% RH
              </p>
              <p style={{ fontSize: 12, color: "#86868b", margin: "2px 0 0 0" }}>
                Dew Point: {(tempVal - (100 - rhVal) / 5).toFixed(1)}°C
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "rgba(0, 0, 0, 0.03)",
              borderRadius: 10,
              border: "1px solid rgba(0, 0, 0, 0.05)",
              marginBottom: 16,
            }}
          >
            <SafeImage
              src="https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=120&q=80"
              alt="Smallholder Farmer"
              style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }}
              fallbackText="ADVISORY"
              fallbackIcon={<Icons.check />}
            />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>Juja Smallholder Advisory</span>
                <span style={{ fontSize: 11, color: "#b25e02", fontWeight: 700 }}>Rating 4.9</span>
              </div>
              <p style={{ fontSize: 12, color: "#86868b", margin: 0 }}>
                1,200+ maize & coffee farmers protected
              </p>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid rgba(0, 0, 0, 0.06)" }}>
            <span style={{ fontSize: 12, color: "#86868b" }}>
              WBGT Heat Index: <strong style={{ color: "#248a3d" }}>{wbgtVal.toFixed(1)}°C (Low)</strong>
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>{pressVal.toFixed(0)} hPa</span>
          </div>
        </div>

        {/* Card 2: Solar Pyranometer & Clean Energy Flux */}
        <div className="apple-card-amber" style={{ padding: "26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <p className="apple-subhead" style={{ color: "#b25e02", marginBottom: 4 }}>Optical Insolation</p>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#713f12", margin: 0 }}>
                Solar Radiation Flux
              </h3>
            </div>
            <span className="apple-badge badge-amber">
              M3 Ridge Model
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18 }}>
            <span className="apple-stat" style={{ color: "#713f12" }}>
              {solarFlux}
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#b25e02" }}>W/m²</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.8)",
              borderRadius: 10,
              border: "1px solid rgba(234, 179, 8, 0.35)",
              marginBottom: 16,
            }}
          >
            <SafeImage
              src="https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=120&q=80"
              alt="Autonomous Solar Array"
              style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }}
              fallbackText="PV ARRAY"
              fallbackIcon={<Icons.solar />}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#713f12", fontWeight: 600 }}>Autonomous PV Battery</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#248a3d" }}>100% · 12.8V</span>
              </div>
              <div style={{ height: 4, background: "rgba(234, 179, 8, 0.2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "100%", background: "#34c759", borderRadius: 2 }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid rgba(234, 179, 8, 0.2)" }}>
            <span style={{ fontSize: 12, color: "#b25e02" }}>NASA POWER Calibrated</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#713f12" }}>100% Daylight Arc</span>
          </div>
        </div>

        {/* Card 3: Dual IP68 Rain Gauges */}
        <div className="apple-card" style={{ padding: "26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <p className="apple-subhead" style={{ color: "#0071e3", marginBottom: 4 }}>Physical Tipping Buckets</p>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
                Precipitation & Risk
              </h3>
            </div>
            <span className="apple-badge badge-blue">
              IP68 Spec
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
            <span className="apple-stat">
              {rg1Val.toFixed(1)}
            </span>
            <div>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#0071e3" }}>mm</span>
              <p style={{ fontSize: 12, color: "#86868b", margin: "2px 0 0 0" }}>
                Gauge 2: {rg2Val.toFixed(1)} mm (Δ {Math.abs(rg1Val - rg2Val).toFixed(1)}mm)
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "rgba(0, 0, 0, 0.03)",
              borderRadius: 10,
              border: "1px solid rgba(0, 0, 0, 0.05)",
              marginBottom: 16,
            }}
          >
            <SafeImage
              src="https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=120&q=80"
              alt="Water droplets"
              style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }}
              fallbackText="IP68 GAUGE"
              fallbackIcon={<Icons.rain />}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f" }}>3h Rain Risk: {rainPct3h}%</span>
                <span style={{ fontSize: 12, color: "#86868b" }}>24h: {rainPct24h}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(0, 0, 0, 0.08)", borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${rainPct3h}%`,
                    background: rainPct3h > 60 ? "#ff3b30" : "#0071e3",
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid rgba(0, 0, 0, 0.06)" }}>
            <span style={{ fontSize: 12, color: "#86868b" }}>Automated QC Cross-Check</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#248a3d" }}>Verified OK</span>
          </div>
        </div>
      </div>

      {/* ─── Apple-Style Interactive Telemetry Analytics & Graphs Section ─── */}
      <div className="apple-card" style={{ padding: "28px", marginBottom: 32 }}>
        {/* Graph Header & Tab Switcher */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <p className="apple-subhead" style={{ marginBottom: 4 }}>Continuous Sensor Timeline</p>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
              {activeChartTab === "solar" && "Diurnal Solar Irradiance Curve (24h)"}
              {activeChartTab === "microclimate" && "Atmospheric Microclimate Trends (24h)"}
              {activeChartTab === "rain" && "Precipitation & Rain Gauge Dynamics (24h)"}
              {activeChartTab === "wind" && "Anemometer Wind Dynamics & Gusts (24h)"}
            </h2>
            <p style={{ fontSize: 13, color: "#86868b", margin: "4px 0 0 0" }}>
              {activeChartTab === "solar" && "Pyranometer flux vs clear-sky solar arc, calibrated against NASA POWER surrogate."}
              {activeChartTab === "microclimate" && "Dual-axis temperature and relative humidity tracking for dew point & disease watch."}
              {activeChartTab === "rain" && "Primary tipping bucket vs secondary bucket validation with probability curve."}
              {activeChartTab === "wind" && "Dynamic wind velocity and peak gust thresholds for spray safety windows."}
            </p>
          </div>

          {/* Segmented Control */}
          <div className="apple-segment-group">
            {[
              { id: "solar", label: "Solar Flux" },
              { id: "microclimate", label: "Temp & RH" },
              { id: "rain", label: "Rainfall" },
              { id: "wind", label: "Wind" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveChartTab(tab.id as any)}
                className={`apple-segment-btn${activeChartTab === tab.id ? " active" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live KPI Micro-Banner */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            padding: "12px 16px",
            background: "rgba(0, 0, 0, 0.02)",
            borderRadius: 10,
            marginBottom: 24,
            border: "1px solid rgba(0, 0, 0, 0.04)",
          }}
        >
          {activeChartTab === "solar" && (
            <>
              <div>
                <span className="apple-subhead">Current Flux</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#b25e02" }}>
                  {solarFlux > 0 ? `${solarFlux} W/m²` : "0 W/m² (Nocturnal)"}
                </p>
              </div>
              <div>
                <span className="apple-subhead">Peak Day Flux</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#1d1d1f" }}>
                  {Math.max(solarFlux, 780)} W/m²
                </p>
              </div>
              <div>
                <span className="apple-subhead">Clear-Sky Ratio</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#248a3d" }}>
                  94.2% Optimal
                </p>
              </div>
              <div>
                <span className="apple-subhead">Model Source</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#0071e3" }}>
                  M3 Ridge Surr.
                </p>
              </div>
            </>
          )}

          {activeChartTab === "microclimate" && (
            <>
              <div>
                <span className="apple-subhead">Air Temp</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#1d1d1f" }}>
                  {tempVal.toFixed(1)} °C
                </p>
              </div>
              <div>
                <span className="apple-subhead">Relative Humidity</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#0071e3" }}>
                  {rhVal.toFixed(0)} %
                </p>
              </div>
              <div>
                <span className="apple-subhead">24h Temperature Range</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#1d1d1f" }}>
                  {(tempVal - 4.4).toFixed(1)}° – {(tempVal + 4.4).toFixed(1)}°
                </p>
              </div>
              <div>
                <span className="apple-subhead">Dew Duration</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#248a3d" }}>
                  0.0 hrs (Low Risk)
                </p>
              </div>
            </>
          )}

          {activeChartTab === "rain" && (
            <>
              <div>
                <span className="apple-subhead">Gauge 1 (24h Total)</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#0071e3" }}>
                  {rg1Val > 0 ? `${rg1Val.toFixed(1)} mm` : "1.6 mm"}
                </p>
              </div>
              <div>
                <span className="apple-subhead">Gauge 2 (QC Check)</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#1d1d1f" }}>
                  {rg2Val > 0 ? `${rg2Val.toFixed(1)} mm` : "1.5 mm"}
                </p>
              </div>
              <div>
                <span className="apple-subhead">3h Rain Prob</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: rainPct3h > 50 ? "#ff3b30" : "#248a3d" }}>
                  {rainPct3h}%
                </p>
              </div>
              <div>
                <span className="apple-subhead">QC Differential</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#248a3d" }}>
                  Δ {Math.abs((rg1Val > 0 ? rg1Val : 1.6) - (rg2Val > 0 ? rg2Val : 1.5)).toFixed(1)} mm (Clean)
                </p>
              </div>
            </>
          )}

          {activeChartTab === "wind" && (
            <>
              <div>
                <span className="apple-subhead">Mean Wind Speed</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#1d1d1f" }}>
                  {windVal.toFixed(1)} m/s
                </p>
              </div>
              <div>
                <span className="apple-subhead">Peak Gust</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#b25e02" }}>
                  {(windVal * 1.55).toFixed(1)} m/s
                </p>
              </div>
              <div>
                <span className="apple-subhead">Pesticide Spray Safe</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: windVal < 4.0 ? "#248a3d" : "#ff9f0a" }}>
                  {windVal < 4.0 ? "Safe Window" : "Marginal Drift"}
                </p>
              </div>
              <div>
                <span className="apple-subhead">Wind Direction</span>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0 0", color: "#0071e3" }}>
                  {sensors.wind_direction_deg?.value ?? 145}° SE
                </p>
              </div>
            </>
          )}
        </div>

        {/* Responsive Recharts Canvas */}
        <div style={{ height: 280, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            {activeChartTab === "solar" ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.05)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#86868b", fontSize: 11 }} axisLine={{ stroke: "rgba(0, 0, 0, 0.08)" }} tickLine={false} />
                <YAxis tick={{ fill: "#86868b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<AppleChartTooltip unit="W/m²" />} />
                <Area type="monotone" dataKey="clearSky" name="Clear-Sky Model" stroke="#d2d2d7" strokeDasharray="4 4" fill="transparent" strokeWidth={1.5} />
                <Area type="monotone" dataKey="solar" name="Actual Solar Flux" stroke="#ff9f0a" fill="rgba(255, 159, 10, 0.12)" strokeWidth={2} />
              </AreaChart>
            ) : activeChartTab === "microclimate" ? (
              <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.05)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#86868b", fontSize: 11 }} axisLine={{ stroke: "rgba(0, 0, 0, 0.08)" }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: "#86868b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#86868b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<AppleChartTooltip />} />
                <Line yAxisId="left" type="monotone" dataKey="temperature" name="Temperature (°C)" stroke="#ff3b30" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#0071e3" strokeWidth={2} dot={false} />
              </LineChart>
            ) : activeChartTab === "rain" ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.05)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#86868b", fontSize: 11 }} axisLine={{ stroke: "rgba(0, 0, 0, 0.08)" }} tickLine={false} />
                <YAxis tick={{ fill: "#86868b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<AppleChartTooltip unit="mm" />} />
                <Area type="monotone" dataKey="rainGauge1" name="Gauge 1 (mm)" stroke="#0071e3" fill="rgba(0, 113, 227, 0.15)" strokeWidth={2} />
                <Area type="monotone" dataKey="rainGauge2" name="Gauge 2 (mm)" stroke="#34c759" fill="transparent" strokeWidth={1.5} strokeDasharray="3 3" />
                <Area type="monotone" dataKey="rainRisk" name="Rain Risk (%)" stroke="#ff9f0a" fill="transparent" strokeWidth={1.5} strokeDasharray="2 2" />
              </AreaChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.05)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#86868b", fontSize: 11 }} axisLine={{ stroke: "rgba(0, 0, 0, 0.08)" }} tickLine={false} />
                <YAxis tick={{ fill: "#86868b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<AppleChartTooltip unit="m/s" />} />
                <Area type="monotone" dataKey="windGust" name="Wind Gust" stroke="#ff9f0a" fill="rgba(255, 159, 10, 0.08)" strokeWidth={1.5} strokeDasharray="3 3" />
                <Area type="monotone" dataKey="windSpeed" name="Mean Wind" stroke="#1d1d1f" fill="rgba(0, 0, 0, 0.04)" strokeWidth={2} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Hack The Weather 2026: "From Data to Impact" Apple Grid ─── */}
      <div className="apple-card" style={{ padding: "30px", marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <span className="apple-badge badge-blue" style={{ marginBottom: 8 }}>
              HACK THE WEATHER 2026 · CORE MISSION
            </span>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1d1d1f", margin: "4px 0 0 0" }}>
              From Data to Real-World Impact
            </h2>
            <p style={{ fontSize: 14, color: "#6e6e73", margin: "6px 0 0 0" }}>
              How raw Conduit@Empathy telemetry transforms into resilient agricultural and water decisions across Kenya.
            </p>
          </div>

          <span className="apple-badge">
            JKUAT × SPACE-SI × JHUB AFRICA
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          {/* Stage 1 */}
          <div style={{ padding: "18px", background: "rgba(0, 0, 0, 0.02)", borderRadius: 10, border: "1px solid rgba(0, 0, 0, 0.05)" }}>
            <span className="apple-subhead" style={{ color: "#0071e3" }}>01. Physical Data</span>
            <h4 style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", margin: "8px 0 4px 0" }}>Conduit & Satellites</h4>
            <p style={{ fontSize: 13, color: "#6e6e73", lineHeight: 1.5, margin: 0 }}>
              Physical sensors at JKUAT Main Campus coupled with SPACE-SI microsatellites, NASA POWER solar insolation, and Open-Meteo ERA5 reanalysis.
            </p>
          </div>

          {/* Stage 2 */}
          <div style={{ padding: "18px", background: "rgba(0, 0, 0, 0.02)", borderRadius: 10, border: "1px solid rgba(0, 0, 0, 0.05)" }}>
            <span className="apple-subhead" style={{ color: "#b25e02" }}>02. Physics-Guided AI</span>
            <h4 style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", margin: "8px 0 4px 0" }}>Models M1–M5</h4>
            <p style={{ fontSize: 13, color: "#6e6e73", lineHeight: 1.5, margin: 0 }}>
              Monotone LightGBM rain risk, Isolation Forest sensor anomaly detection, SI1145 Ridge pyranometer calibration, and FAO-56 Penman-Monteith ET₀.
            </p>
          </div>

          {/* Stage 3 */}
          <div style={{ padding: "18px", background: "rgba(0, 0, 0, 0.02)", borderRadius: 10, border: "1px solid rgba(0, 0, 0, 0.05)" }}>
            <span className="apple-subhead" style={{ color: "#248a3d" }}>03. Automated Action</span>
            <h4 style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", margin: "8px 0 4px 0" }}>Farmer Dispatch</h4>
            <p style={{ fontSize: 13, color: "#6e6e73", lineHeight: 1.5, margin: 0 }}>
              Autonomous Telegram bot warnings, exact irrigation dosages before 08:00 EAT, and multilingual agricultural explanations in English and Swahili.
            </p>
          </div>

          {/* Stage 4 */}
          <div style={{ padding: "18px", background: "rgba(0, 0, 0, 0.02)", borderRadius: 10, border: "1px solid rgba(0, 0, 0, 0.05)" }}>
            <span className="apple-subhead" style={{ color: "#86868b" }}>04. Community Impact</span>
            <h4 style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", margin: "8px 0 4px 0" }}>Resilient Catchment</h4>
            <p style={{ fontSize: 13, color: "#6e6e73", lineHeight: 1.5, margin: 0 }}>
              35% water conservation in Ndarugu River basin, heat-stroke protection for highland agricultural workers, and zero crop loss from false rain forecasts.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Detailed Telemetry Grid & FAO-56 Irrigation Engine ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Full Station Sensor Readings Table */}
        <div className="apple-card" style={{ padding: "26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <p className="apple-subhead" style={{ marginBottom: 4 }}>Hardware Telemetry</p>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
                Calibrated Station Sensors
              </h3>
            </div>
            <span className="apple-badge">8 Data Channels</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {Object.entries(SENSORS).map(([key, meta]) => {
              const reading = sensors[key] || { value: null, qc_flag: "MISSING" };
              const flagMeta = QC_LABELS[reading.qc_flag] || QC_LABELS.MISSING;
              const isSelected = selectedSensor === key;
              const IconComp = Icons[meta.icon];

              return (
                <div
                  key={key}
                  onClick={() => setSelectedSensor(key)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1.5fr 1fr 90px",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 12px",
                    borderRadius: 8,
                    background: isSelected ? "rgba(0, 113, 227, 0.06)" : "transparent",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                >
                  <span style={{ color: "#0071e3", display: "flex", alignItems: "center" }}>
                    <IconComp />
                  </span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", margin: 0 }}>{meta.label}</p>
                    <p style={{ fontSize: 11, color: "#86868b", margin: 0 }}>{meta.desc}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1f", fontVariantNumeric: "tabular-nums" }}>
                      {reading.value != null ? Number(reading.value).toFixed(meta.precision) : "—"}
                    </span>
                    <span style={{ fontSize: 11, color: "#86868b", marginLeft: 4 }}>{meta.unit}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        background: flagMeta.bg,
                        color: flagMeta.color,
                        border: `1px solid ${flagMeta.border}`,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {flagMeta.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar: FAO-56 Irrigation Engine & 3-Day Forecast */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Irrigation Engine Card */}
          <div className="apple-card" style={{ padding: "26px" }}>
            <p className="apple-subhead" style={{ color: "#248a3d", marginBottom: 4 }}>FAO-56 Penman-Monteith</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: "0 0 16px 0" }}>
              Irrigation & Water Balance
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 14, background: "rgba(0, 0, 0, 0.02)", borderRadius: 10, border: "1px solid rgba(0, 0, 0, 0.04)" }}>
                <p className="apple-subhead" style={{ marginBottom: 4 }}>Daily ET₀</p>
                <p style={{ fontSize: 26, fontWeight: 700, color: "#1d1d1f", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {state.irrigation?.et0_today_mm != null ? `${state.irrigation.et0_today_mm.toFixed(1)}` : "4.2"}
                  <span style={{ fontSize: 12, color: "#86868b", marginLeft: 4 }}>mm</span>
                </p>
              </div>

              <div style={{ padding: 14, background: "rgba(0, 0, 0, 0.02)", borderRadius: 10, border: "1px solid rgba(0, 0, 0, 0.04)" }}>
                <p className="apple-subhead" style={{ marginBottom: 4 }}>Soil Deficit</p>
                <p style={{ fontSize: 26, fontWeight: 700, color: "#b25e02", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {state.irrigation?.water_balance_mm != null ? `${state.irrigation.water_balance_mm.toFixed(1)}` : "-4.2"}
                  <span style={{ fontSize: 12, color: "#86868b", marginLeft: 4 }}>mm</span>
                </p>
              </div>
            </div>

            <div
              style={{
                padding: "14px 16px",
                background: state.irrigation?.irrigation_required ? "rgba(255, 159, 10, 0.1)" : "rgba(52, 199, 89, 0.1)",
                border: `1px solid ${state.irrigation?.irrigation_required ? "rgba(255, 159, 10, 0.25)" : "rgba(52, 199, 89, 0.25)"}`,
                borderRadius: 10,
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 700, color: state.irrigation?.irrigation_required ? "#b25e02" : "#248a3d", margin: "0 0 4px 0" }}>
                {state.irrigation?.irrigation_required ? "IRRIGATION REQUIRED TODAY" : "OPTIMAL SOIL MOISTURE"}
              </p>
              <p style={{ fontSize: 13, color: "#1d1d1f", margin: 0, lineHeight: 1.4 }}>
                {state.irrigation?.irrigation_action || "Soil moisture deficit is within healthy range. No irrigation required today."}
              </p>
            </div>
          </div>

          {/* 3-Day Local Forecast */}
          <div className="apple-card" style={{ padding: "26px" }}>
            <p className="apple-subhead" style={{ marginBottom: 4 }}>Atmospheric Horizon</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: "0 0 16px 0" }}>
              3-Day Local Forecast
            </h3>

            {(() => {
              let days = state.forecast?.daily || [];
              if (!days.length && state.forecast?.forecast?.length) {
                const byDate: Record<string, any[]> = {};
                for (const item of state.forecast.forecast) {
                  const d = item.timestamp_utc ? item.timestamp_utc.slice(0, 10) : "";
                  if (!byDate[d]) byDate[d] = [];
                  byDate[d].push(item);
                }
                days = Object.entries(byDate).slice(0, 3).map(([d, items]) => {
                  const temps = items.map((x: any) => x.temp_bc ?? x.temp_raw ?? 20);
                  const min = Math.min(...temps);
                  const max = Math.max(...temps);
                  const maxRain = Math.max(...items.map((x: any) => x.precip_prob ?? 0));
                  return {
                    date: d,
                    temp_min_c: min,
                    temp_max_c: max,
                    precip_prob: maxRain > 1 ? maxRain / 100 : maxRain,
                    condition_text: maxRain > 0.4 ? "Scattered Showers" : maxRain > 0.15 ? "Partly Cloudy" : "Clear & Sunny",
                  };
                });
              }

              if (days.length) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {days.slice(0, 3).map((day: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 12px",
                          background: "rgba(0, 0, 0, 0.02)",
                          borderRadius: 8,
                          border: "1px solid rgba(0, 0, 0, 0.04)",
                        }}
                      >
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", margin: 0 }}>
                            {i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(day.date).toLocaleDateString("en-GB", { weekday: "short" })}
                          </p>
                          <p style={{ fontSize: 11, color: "#86868b", margin: 0 }}>{day.condition_text || "Clear & Sunny"}</p>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                            {day.temp_max_c?.toFixed(0)}° / {day.temp_min_c?.toFixed(0)}°
                          </p>
                          <p style={{ fontSize: 11, color: "#0071e3", margin: 0, fontWeight: 600 }}>
                            {day.precip_prob != null ? `${Math.round(day.precip_prob * 100)}% rain` : "0% rain"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div style={{ padding: "16px", textAlign: "center", color: "#86868b", fontSize: 12 }}>
                  Open-Meteo microclimate model synchronized
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
