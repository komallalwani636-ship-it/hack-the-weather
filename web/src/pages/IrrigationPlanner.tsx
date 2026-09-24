import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getJson } from "../api";
import { useApp } from "../context/AppContext";

const CROPS: Record<string, { label: string; color: string }> = {
  maize:   { label: "Maize",   color: "#f59e0b" },
  beans:   { label: "Beans",   color: "#22c55e" },
  pasture: { label: "Pasture", color: "#60a5fa" },
};

const STAGES: Record<string, { label: string; desc: string }> = {
  initial: { label: "Initial",    desc: "Germination to ~10% canopy" },
  mid:     { label: "Mid-season", desc: "Full canopy to maturation start" },
  late:    { label: "Late",       desc: "Maturation to harvest" },
};

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

  const plan = (data?.plan_mm || []).map((mm: number, i: number) => ({
    day: `D${i + 1}`,
    mm: Number(mm.toFixed(2)),
  }));

  const cropCfg = CROPS[crop];
  const irrigationRequired = data?.irrigation_required ?? false;
  const waterBalance = data?.water_balance_mm ?? state.irrigation?.water_balance_mm ?? 0;
  const et0 = data?.et0_today_mm ?? 0;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Page header */}
      <div className="page-header">
        <p className="label-xs" style={{ marginBottom: 8 }}>FAO-56 Penman-Monteith</p>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", margin: 0 }}>
          Irrigation Planner
        </h1>
        <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
          Water balance · ET₀ · Crop coefficient (Kc)
        </p>
      </div>

      {/* Crop selector */}
      <div style={{ marginBottom: 16 }}>
        <p className="label-xs" style={{ marginBottom: 10 }}>Crop</p>
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(CROPS).map(([key, c]) => (
            <button
              key={key}
              onClick={() => setCrop(key)}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                border: `1px solid ${crop === key ? c.color : "rgba(255,255,255,0.1)"}`,
                background: crop === key ? `${c.color}14` : "transparent",
                color: crop === key ? c.color : "#666",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: "inherit",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stage selector */}
      <div style={{ marginBottom: 40 }}>
        <p className="label-xs" style={{ marginBottom: 10 }}>Growth stage</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(STAGES).map(([key, s]) => (
            <button
              key={key}
              onClick={() => setStage(key)}
              title={s.desc}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: `1px solid ${stage === key ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                background: stage === key ? "rgba(255,255,255,0.08)" : "transparent",
                color: stage === key ? "#f0f0f0" : "#555",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: "inherit",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
            padding: "12px 16px",
            marginBottom: 24,
            fontSize: 13,
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {/* Metrics row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 40,
          opacity: loading ? 0.5 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {[
          { label: "ET₀ today",    value: `${et0.toFixed(1)} mm`,    sub: "Evapotranspiration" },
          { label: "Kc factor",    value: data?.kc?.toFixed(2) ?? "—", sub: `${cropCfg.label} · ${STAGES[stage].label}` },
          { label: "Water balance", value: `${waterBalance.toFixed(1)} mm`,
            color: irrigationRequired ? "#f59e0b" : "#22c55e",
            sub: irrigationRequired ? "Irrigation required" : "Adequate moisture" },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              padding: "24px 28px",
              background: "#111",
              borderRight: i < 2 ? "1px solid rgba(255,255,255,0.05)" : undefined,
            }}
          >
            <p className="label-xs" style={{ marginBottom: 10 }}>{m.label}</p>
            <p
              className="data-value"
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: m.color || "#f0f0f0",
                letterSpacing: "-0.02em",
                marginBottom: 4,
              }}
            >
              {m.value}
            </p>
            <p style={{ fontSize: 11, color: "#444" }}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Action */}
      <div
        style={{
          border: irrigationRequired
            ? "1px solid rgba(245,158,11,0.25)"
            : "1px solid rgba(34,197,94,0.15)",
          borderLeft: irrigationRequired
            ? "3px solid #f59e0b"
            : "3px solid #22c55e",
          borderRadius: 6,
          padding: "16px 20px",
          background: irrigationRequired
            ? "rgba(245,158,11,0.04)"
            : "rgba(34,197,94,0.03)",
          marginBottom: 40,
        }}
      >
        <p className="label-xs" style={{ marginBottom: 6, color: irrigationRequired ? "#f59e0b" : "#22c55e" }}>
          Recommendation
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#e0e0e0" }}>
          {loading ? "Calculating…" : (data?.irrigation_action || "—")}
        </p>
        {data?.substituted_fields?.length > 0 && (
          <p style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
            Note: fallback values used for: {data.substituted_fields.join(", ")}
          </p>
        )}
      </div>

      {/* 7-day plan chart */}
      {plan.length > 0 && (
        <div>
          <p className="label-xs" style={{ marginBottom: 20 }}>7-day irrigation plan</p>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plan} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#555", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#555", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 4,
                    color: "#f0f0f0",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v} mm`, "Irrigation"]}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="mm" radius={[3, 3, 0, 0]}>
                  {plan.map((_: any, i: number) => (
                    <Cell
                      key={i}
                      fill={cropCfg.color}
                      fillOpacity={0.5 + (i / plan.length) * 0.5}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
