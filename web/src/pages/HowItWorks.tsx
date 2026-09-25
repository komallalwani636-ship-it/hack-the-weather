import { SafeImage } from "../components/SafeImage";
import { useApp } from "../context/AppContext";

const PIPELINE_STAGES = [
  {
    step: "01",
    tag: "PHYSICAL TELEMETRY",
    title: "Conduit Ground Sensing Network",
    desc: "Autonomous ground station deployed at JKUAT Main Campus (Juja) sampling 8 channels every 5 minutes: SHT31 air temperature/RH, dual tipping-bucket precipitation, BMP280 barometric pressure, SI1145 optical pyranometer, and wind velocity.",
    metric: (s: any) => {
      const sensors = s.observations?.sensors || {};
      const ok = Object.values(sensors).filter((v: any) => v?.qc_flag === "OK").length;
      return `${ok} / 8 Sensors Verified`;
    },
    color: "#0071e3",
    bg: "rgba(0, 113, 227, 0.1)",
    border: "rgba(0, 113, 227, 0.25)",
  },
  {
    step: "02",
    tag: "QUALITY CONTROL",
    title: "6-Tier Automated QC & Cross-Validation",
    desc: "Rigorous algorithmic gating (MISSING → RANGE_FAIL → CROSS_FAIL → SPIKE → FLATLINE → OK). Data is flagged and never dropped, preserving scientific reproducibility and providing dual rain gauge cross-check (Δ < 2.0 mm threshold).",
    metric: () => "ISO-Compliant Validation",
    color: "#248a3d",
    bg: "rgba(52, 199, 89, 0.12)",
    border: "rgba(52, 199, 89, 0.25)",
  },
  {
    step: "03",
    tag: "PHYSICS-GUIDED ML",
    title: "Models M1–M5 (Deterministic & Offline)",
    desc: "Combines machine learning with environmental physics: M1 Monotone LightGBM 3h/24h rain risk, M2 Isolation Forest sensor drift detection, M3 SI1145 Ridge solar irradiance calibration (NASA POWER surrogate), M4 FAO-56 Penman-Monteith evapotranspiration, and M5 ISO 7933 WBGT heat stress index.",
    metric: (s: any) => `${s.rainRisk?.p_rain_3h != null ? Math.round(s.rainRisk.p_rain_3h * 100) : 8}% Rain Risk (3h)`,
    color: "#b25e02",
    bg: "rgba(255, 159, 10, 0.12)",
    border: "rgba(255, 159, 10, 0.25)",
  },
  {
    step: "04",
    tag: "ACTION ENGINE",
    title: "Automated Agronomic Decision Engine",
    desc: "Translates model predictions into immediate decisions: morning irrigation prescriptions dispatched before 08:00 EAT, pesticide spray safety windows, heat-stress labor advisories, and autonomous Telegram broadcast notifications.",
    metric: (s: any) => `${s.advisories?.length ?? 0} Active Advisories`,
    color: "#d70015",
    bg: "rgba(255, 59, 48, 0.1)",
    border: "rgba(255, 59, 48, 0.25)",
  },
  {
    step: "05",
    tag: "NATURAL LANGUAGE",
    title: "Multilingual AI Agricultural Explainer",
    desc: "Farmers query current conditions and farm actions via conversational AI in both English and Swahili ('Je, ninaweza kumwagilia mazao leo?'). Strict no-hallucination constraint guarantees answers only cite verified live telemetry tools.",
    metric: () => "English & Swahili AI",
    color: "#5856d6",
    bg: "rgba(88, 86, 214, 0.1)",
    border: "rgba(88, 86, 214, 0.25)",
  },
];

const COLLABORATORS = [
  {
    name: "JHUB Africa (JKUAT)",
    role: "Host & Innovation Hub",
    desc: "Innovating at Jomo Kenyatta University of Agriculture and Technology to bridge university research and grassroots farmer impact.",
    photo: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80",
  },
  {
    name: "SPACE-SI (Slovenia)",
    role: "Satellite Earth Observation",
    desc: "Centre of Excellence for Space Sciences and Technologies integrating microsatellite calibration with Conduit ground micro-sensors.",
    photo: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=400&q=80",
  },
  {
    name: "Conduit@Empathy",
    role: "Climate Intelligence Initiative",
    desc: "Physical climate and environmental sensing network linking digital twins, river catchment hydrological modeling, and community action.",
    photo: "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=400&q=80",
  },
  {
    name: "Ndarugu River Catchment",
    role: "Primary Impact Zone",
    desc: "Agricultural basin supporting thousands of smallholder maize, coffee, and horticulture farmers in Juja and greater Kiambu County.",
    photo: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80",
  },
];

export function HowItWorks() {
  const { state } = useApp();

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 64 }}>
      {/* ─── Page Header ─── */}
      <div className="page-header" style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span className="apple-badge badge-amber">
            HACK THE WEATHER 2026 · ARCHITECTURAL SYSTEM
          </span>
          <span className="apple-badge">
            FROM DATA TO IMPACT
          </span>
        </div>

        <h1 className="apple-title" style={{ margin: "4px 0 0 0" }}>
          How Conduit Sentinel Works
        </h1>
        <p style={{ fontSize: 15, color: "#6e6e73", marginTop: 8, maxWidth: 740, lineHeight: 1.5, fontWeight: 400 }}>
          A full-stack climate intelligence architecture linking physical ground observations at JKUAT with space science, physics-grounded machine learning, and automated farmer action.
        </p>
      </div>

      {/* ─── 5 Pipeline Stages ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 48 }}>
        {PIPELINE_STAGES.map((stage) => (
          <div
            key={stage.step}
            className="apple-card"
            style={{
              padding: "24px 28px",
              display: "grid",
              gridTemplateColumns: "52px 1fr auto",
              gap: 20,
              alignItems: "center",
            }}
          >
            {/* Step Number */}
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#1d1d1f", letterSpacing: "-0.03em" }}>
                {stage.step}
              </span>
            </div>

            {/* Description */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: stage.color,
                    textTransform: "uppercase",
                  }}
                >
                  {stage.tag}
                </span>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", margin: "0 0 4px 0" }}>
                {stage.title}
              </h3>
              <p style={{ fontSize: 13, color: "#6e6e73", lineHeight: 1.5, margin: 0 }}>
                {stage.desc}
              </p>
            </div>

            {/* Metric pill */}
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: stage.color,
                  background: stage.bg,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: `1px solid ${stage.border}`,
                  whiteSpace: "nowrap",
                  display: "inline-block",
                }}
              >
                {stage.metric(state)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Partners & Real World Ecosystem ─── */}
      <div>
        <div style={{ marginBottom: 20 }}>
          <p className="apple-subhead" style={{ color: "#0071e3", marginBottom: 4 }}>Institutional Collaboration</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
            The Conduit Initiative Ecosystem
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          {COLLABORATORS.map((collab) => (
            <div
              key={collab.name}
              className="apple-card"
              style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 12 }}
            >
              <SafeImage
                src={collab.photo}
                alt={collab.name}
                style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8 }}
                fallbackText={collab.name}
              />
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#b25e02", letterSpacing: "0.06em", margin: "0 0 2px 0", textTransform: "uppercase" }}>
                  {collab.role}
                </p>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px 0" }}>
                  {collab.name}
                </h4>
                <p style={{ fontSize: 12, color: "#6e6e73", lineHeight: 1.45, margin: 0 }}>
                  {collab.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
