import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getJson } from "../api";
import { useApp } from "../context/AppContext";

const CROPS: Record<string, { label: string; color: string; border: string; bg: string }> = {
  maize:   { label: "Maize",   color: "#b25e02", border: "rgba(255, 159, 10, 0.3)", bg: "rgba(255, 159, 10, 0.1)" },
  beans:   { label: "Beans",   color: "#248a3d", border: "rgba(52, 199, 89, 0.3)", bg: "rgba(52, 199, 89, 0.1)" },
  pasture: { label: "Pasture", color: "#0071e3", border: "rgba(0, 113, 227, 0.3)", bg: "rgba(0, 113, 227, 0.1)" },
};

const STAGES: Record<string, { label: string; desc: string }> = {
  initial: { label: "Initial Stage",    desc: "Germination to ~10% canopy" },
  mid:     { label: "Mid-Season",      desc: "Full canopy to maturation start" },
  late:    { label: "Late Stage",       desc: "Maturation to harvest" },
};

function AppleBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const isRainRest = item.mm === 0;
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.94)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
        fontSize: 12,
        color: "#1d1d1f",
        minWidth: 160,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: "#86868b", fontSize: 11, fontWeight: 700 }}>{label}</span>
        {isRainRest && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#0071e3", background: "rgba(0, 113, 227, 0.1)", padding: "1px 5px", borderRadius: 4 }}>
            Rain Rest
          </span>
        )}
      </div>
      <p style={{ margin: "2px 0", fontWeight: 700, fontSize: 14 }}>
        Dosage: {item.mm} mm
      </p>
      {item.et0 !== undefined && (
        <p style={{ margin: "3px 0 0 0", color: "#6e6e73", fontSize: 11 }}>
          ET₀: {item.et0} mm · Forecast Rain: {item.rain} mm
        </p>
      )}
      {item.action && (
        <p style={{ margin: "4px 0 0 0", color: "#86868b", fontSize: 10 }}>
          {item.action}
        </p>
      )}
    </div>
  );
}

export function IrrigationPlanner() {
  const [crop, setCrop] = useState("maize");
  const [stage, setStage] = useState("mid");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state } = useApp();

  useEffect(() => {
    setLoading(true);
    setError(null);
    getJson<any>(`/irrigation?crop=${crop}&stage=${stage}`)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e?.message || "Failed to load irrigation data"); setLoading(false); });
  }, [crop, stage]);

  const plan = (data?.plan_mm || []).map((mm: number, i: number) => {
    const s = data?.daily_schedule?.[i];
    return {
      day: `D${i + 1}`,
      mm: Number(mm.toFixed(1)),
      et0: s?.et0_mm,
      etc: s?.etc_demand_mm,
      rain: s?.rain_forecast_mm,
      action: s?.action,
    };
  });

  const cropCfg = CROPS[crop];
  const irrigationRequired = data?.irrigation_required ?? false;
  const waterBalance = data?.water_balance_mm ?? state.irrigation?.water_balance_mm ?? 0;
  const et0 = data?.et0_today_mm ?? 0;
  const schedule = data?.daily_schedule || [];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 64 }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="apple-badge badge-green" style={{ marginBottom: 8 }}>
          AGRO-HYDROLOGICAL OPTIMIZATION
        </span>
        <h1 className="apple-title" style={{ margin: "4px 0 0 0" }}>
          Irrigation Planner
        </h1>
        <p style={{ fontSize: 14, color: "#6e6e73", marginTop: 6, fontWeight: 400 }}>
          FAO-56 Penman-Monteith daily reference evapotranspiration (ET₀) & phenological crop water demand.
        </p>
      </div>

      {/* Selectors Panel */}
      <div className="apple-card" style={{ padding: "24px", marginBottom: 28 }}>
        {/* Crop selector */}
        <div style={{ marginBottom: 20 }}>
          <p className="apple-subhead" style={{ marginBottom: 8 }}>Select Crop Type</p>
          <div className="apple-segment-group">
            {Object.entries(CROPS).map(([key, c]) => (
              <button
                key={key}
                onClick={() => setCrop(key)}
                className={`apple-segment-btn${crop === key ? " active" : ""}`}
                style={crop === key ? { color: c.color, fontWeight: 700 } : {}}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stage selector */}
        <div>
          <p className="apple-subhead" style={{ marginBottom: 8 }}>Phenological Growth Stage</p>
          <div className="apple-segment-group">
            {Object.entries(STAGES).map(([key, s]) => (
              <button
                key={key}
                onClick={() => setStage(key)}
                title={s.desc}
                className={`apple-segment-btn${stage === key ? " active" : ""}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(255, 59, 48, 0.08)",
            border: "1px solid rgba(255, 59, 48, 0.2)",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 24,
            fontSize: 13,
            fontWeight: 600,
            color: "#d70015",
          }}
        >
          {error}
        </div>
      )}

      {/* Metrics row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
          marginBottom: 28,
        }}
      >
        {/* Metric 1 */}
        <div className="apple-card" style={{ padding: "24px" }}>
          <p className="apple-subhead" style={{ marginBottom: 6 }}>Reference Evapotranspiration</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="apple-stat">
              {et0.toFixed(1)}
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#86868b" }}>mm/day</span>
          </div>
          <p style={{ fontSize: 12, color: "#86868b", margin: "6px 0 0 0" }}>
            FAO-56 Penman-Monteith physical flux
          </p>
        </div>

        {/* Metric 2 */}
        <div className="apple-card" style={{ padding: "24px" }}>
          <p className="apple-subhead" style={{ marginBottom: 6 }}>Crop Coefficient (Kc)</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="apple-stat">
              {data?.kc?.toFixed(2) ?? "—"}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#86868b", margin: "6px 0 0 0" }}>
            {cropCfg.label} · {STAGES[stage].label}
          </p>
        </div>

        {/* Metric 3 */}
        <div className="apple-card" style={{ padding: "24px" }}>
          <p className="apple-subhead" style={{ marginBottom: 6 }}>Soil Water Balance</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              className="apple-stat"
              style={{
                color: irrigationRequired ? "#b25e02" : "#248a3d",
              }}
            >
              {waterBalance.toFixed(1)}
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#86868b" }}>mm</span>
          </div>
          <p style={{ fontSize: 12, color: irrigationRequired ? "#b25e02" : "#248a3d", margin: "6px 0 0 0", fontWeight: 600 }}>
            {irrigationRequired ? "Soil moisture deficit active" : "Adequate soil moisture"}
          </p>
        </div>
      </div>

      {/* Action Recommendation Banner */}
      <div
        className="apple-card"
        style={{
          borderLeft: `4px solid ${irrigationRequired ? "#ff9f0a" : "#34c759"}`,
          padding: "20px 24px",
          background: irrigationRequired ? "rgba(255, 159, 10, 0.08)" : "rgba(52, 199, 89, 0.08)",
          marginBottom: 32,
        }}
      >
        <p className="apple-subhead" style={{ marginBottom: 4, color: irrigationRequired ? "#b25e02" : "#248a3d" }}>
          Agronomic Action Prescription
        </p>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
          {loading ? "Calculating models…" : (data?.irrigation_action || "—")}
        </p>
        {data?.substituted_fields?.length > 0 && (
          <p style={{ fontSize: 11, color: "#86868b", marginTop: 6 }}>
            Note: fallback values used for: {data.substituted_fields.join(", ")}
          </p>
        )}
      </div>

      {/* 7-day plan chart */}
      {plan.length > 0 && (
        <div className="apple-card" style={{ padding: "26px", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p className="apple-subhead" style={{ margin: 0 }}>7-Day Dynamic Irrigation Schedule (mm)</p>
            <span style={{ fontSize: 11, color: "#86868b" }}>
              Dynamic daily ETc & precipitation suppression
            </span>
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plan} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.05)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#86868b", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(0, 0, 0, 0.08)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#86868b", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<AppleBarTooltip />} />
                <Bar dataKey="mm" radius={[4, 4, 0, 0]}>
                  {plan.map((entry: any, i: number) => (
                    <Cell
                      key={i}
                      fill={entry.mm === 0 ? "rgba(0, 113, 227, 0.35)" : cropCfg.color}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 7-Day Day-by-Day Forecast Breakdown */}
      {schedule.length > 0 && (
        <div className="apple-card" style={{ padding: "26px" }}>
          <p className="apple-subhead" style={{ marginBottom: 16 }}>Day-by-Day Meteorological Water Balance</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 12,
            }}
          >
            {schedule.map((item: any, i: number) => {
              const isRainRest = item.dosage_mm === 0;
              return (
                <div
                  key={i}
                  style={{
                    background: isRainRest ? "rgba(0, 113, 227, 0.04)" : "rgba(0, 0, 0, 0.02)",
                    border: `1px solid ${isRainRest ? "rgba(0, 113, 227, 0.25)" : "rgba(0, 0, 0, 0.06)"}`,
                    borderRadius: 10,
                    padding: "12px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ margin: "0 0 6px 0", fontSize: 12, fontWeight: 700, color: "#1d1d1f" }}>
                    {item.day} {i === 0 ? "(Today)" : ""}
                  </p>
                  <p
                    style={{
                      margin: "0 0 6px 0",
                      fontSize: 18,
                      fontWeight: 800,
                      color: isRainRest ? "#0071e3" : cropCfg.color,
                    }}
                  >
                    {item.dosage_mm} <span style={{ fontSize: 11, fontWeight: 600 }}>mm</span>
                  </p>
                  <div style={{ fontSize: 10, color: "#86868b", lineHeight: 1.4 }}>
                    <p style={{ margin: "0 0 2px 0" }}>ET₀: {item.et0_mm} mm</p>
                    <p style={{ margin: "0 0 4px 0", color: item.rain_forecast_mm > 0 ? "#0071e3" : "#86868b", fontWeight: item.rain_forecast_mm > 0 ? 700 : 400 }}>
                      Rain: {item.rain_forecast_mm} mm
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: isRainRest ? "#0071e3" : "#248a3d",
                      background: isRainRest ? "rgba(0, 113, 227, 0.1)" : "rgba(52, 199, 89, 0.1)",
                      padding: "2px 5px",
                      borderRadius: 4,
                      display: "inline-block",
                    }}
                  >
                    {isRainRest ? "Rain Rest" : "Irrigate"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
