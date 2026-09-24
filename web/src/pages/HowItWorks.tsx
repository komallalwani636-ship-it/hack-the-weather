import { useApp } from "../context/AppContext";

const PIPELINE = [
  {
    step: "01",
    label: "Data collection",
    desc: "JKUAT Conduit sensors stream real-time weather every 5 minutes. Open-Meteo ERA5 fills historical gaps when station data is unavailable.",
    metric: (s: any) => {
      const sensors = s.observations?.sensors || {};
      const ok = Object.values(sensors).filter((v: any) => v?.qc_flag === "OK").length;
      const total = Object.keys(sensors).length || 8;
      return ok > 0 ? `${ok}/${total} sensors OK` : "—";
    },
  },
  {
    step: "02",
    label: "Quality control",
    desc: "6-level QC pipeline: MISSING → RANGE_FAIL → CROSS_FAIL → SPIKE → FLATLINE → OK. Records are flagged, not dropped — preserving full audit trail.",
    metric: (s: any) => {
      const sensors = s.observations?.sensors || {};
      const flags = Object.values(sensors).map((v: any) => v?.qc_flag || "MISSING");
      const ok = flags.filter((f) => f === "OK").length;
      return flags.length > 0 ? `${Math.round((ok / flags.length) * 100)}% clean` : "—";
    },
  },
  {
    step: "03",
    label: "ML models",
    desc: "LightGBM rain classifier, Isolation Forest anomaly detection, FAO-56 Penman-Monteith ET₀, WBGT heat stress index. All models run offline.",
    metric: (s: any) => {
      const p = s.rainRisk?.p_rain_3h;
      return p != null ? `${Math.round(p * 100)}% rain (3h)` : "Models ready";
    },
  },
  {
    step: "04",
    label: "Decision engine",
    desc: "Rule-based advisory system fires at probability thresholds. Advisories carry full evidence payloads — no black-box decisions.",
    metric: (s: any) => `${s.advisories?.length ?? 0} active advisor${s.advisories?.length === 1 ? "y" : "ies"}`,
  },
  {
    step: "05",
    label: "AI explainer",
    desc: "Gemini generates plain-language answers grounded in live sensor data via function calling. Groq (Llama 3) fallback. Template fallback if both are down.",
    metric: () => "Gemini → Groq → Template",
  },
];

const DATA_SOURCES = [
  { name: "JKUAT Conduit",  desc: "Primary station sensors" },
  { name: "Open-Meteo",    desc: "ERA5 reanalysis + NWP forecast" },
  { name: "NASA POWER",     desc: "Historical solar radiation" },
  { name: "OpenStreetMap",  desc: "Basemap tiles" },
];

export function HowItWorks() {
  const { state } = useApp();

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Page header */}
      <div className="page-header">
        <p className="label-xs" style={{ marginBottom: 8 }}>Architecture</p>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", margin: 0 }}>
          How It Works
        </h1>
        <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
          Data → QC → Models → Decisions → AI explanation
        </p>
      </div>

      {/* Pipeline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {PIPELINE.map((stage, i) => (
          <div
            key={stage.step}
            style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr auto",
              gap: 24,
              padding: "28px 0",
              borderBottom: i < PIPELINE.length - 1 ? "1px solid rgba(255,255,255,0.05)" : undefined,
              alignItems: "start",
            }}
          >
            {/* Step number */}
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#333",
                  letterSpacing: "0.05em",
                }}
              >
                {stage.step}
              </span>
            </div>

            {/* Content */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", margin: "0 0 8px 0" }}>
                {stage.label}
              </h3>
              <p style={{ fontSize: 13, color: "#666", lineHeight: 1.7, margin: 0 }}>
                {stage.desc}
              </p>
            </div>

            {/* Live metric */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p
                className="data-value"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#888",
                  whiteSpace: "nowrap",
                }}
              >
                {stage.metric(state)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Data sources */}
      <div style={{ marginTop: 48 }}>
        <p className="label-xs" style={{ marginBottom: 20 }}>Data sources</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {DATA_SOURCES.map((src, i) => (
            <div
              key={src.name}
              style={{
                padding: "20px 24px",
                background: "#111",
                borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : undefined,
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: "#d0d0d0", marginBottom: 4 }}>
                {src.name}
              </p>
              <p style={{ fontSize: 12, color: "#555" }}>{src.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
