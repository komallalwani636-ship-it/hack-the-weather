import { formatEat } from "../api";
import { useApp } from "../context/AppContext";

const SEVERITY_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  accent: string;
}> = {
  info: {
    label: "Info",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.04)",
    border: "rgba(96,165,250,0.15)",
    accent: "#2563eb",
  },
  watch: {
    label: "Watch",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.05)",
    border: "rgba(245,158,11,0.2)",
    accent: "#d97706",
  },
  warning: {
    label: "Warning",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.05)",
    border: "rgba(239,68,68,0.2)",
    accent: "#dc2626",
  },
};

const TYPE_LABELS: Record<string, string> = {
  rain_risk:   "Rain Risk",
  irrigation:  "Irrigation",
  heat_stress: "Heat Stress",
};

export function AlertsFeed() {
  const { state } = useApp();
  const items = [...state.advisories].sort((a: any, b: any) =>
    String(b.valid_from).localeCompare(String(a.valid_from))
  );

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Page header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p className="label-xs" style={{ marginBottom: 8 }}>Decision engine output</p>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", margin: 0 }}>
            Alerts
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "#555" }}>
          {items.length === 0 ? "No active advisories" : `${items.length} active`}
        </p>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "80px 0",
            color: "#444",
          }}
        >
          <p style={{ fontSize: 40, marginBottom: 16 }}>✓</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#666", marginBottom: 8 }}>All clear</p>
          <p style={{ fontSize: 13 }}>No active advisories at this time.</p>
        </div>
      )}

      {/* Advisory list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((adv: any) => {
          const cfg = SEVERITY_CONFIG[adv.severity] || SEVERITY_CONFIG.info;
          return (
            <div
              key={adv.id}
              style={{
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderLeft: `3px solid ${cfg.accent}`,
                borderRadius: 6,
                padding: "20px 24px",
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: cfg.color,
                    background: `${cfg.color}18`,
                    padding: "3px 8px",
                    borderRadius: 3,
                  }}
                >
                  {cfg.label}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>
                  {TYPE_LABELS[adv.type] || adv.type?.replace(/_/g, " ")}
                </span>
              </div>

              {/* Action */}
              <p style={{ fontSize: 14, color: "#c0c0c0", lineHeight: 1.6, marginBottom: 16 }}>
                {adv.action}
              </p>

              {/* Evidence */}
              {adv.evidence && Object.keys(adv.evidence).length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 24,
                    paddingTop: 12,
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    marginBottom: 12,
                  }}
                >
                  {Object.entries(adv.evidence)
                    .filter(([k]) => !["observation_timestamp_utc", "qc_flags"].includes(k))
                    .slice(0, 5)
                    .map(([k, v]: [string, any]) => (
                      <div key={k}>
                        <p className="label-xs" style={{ marginBottom: 3 }}>{k.replace(/_/g, " ")}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>
                          {typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}
                        </p>
                      </div>
                    ))}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555" }}>
                <span>Valid until {formatEat(adv.valid_until)}</span>
                <span>Updated {formatEat(state.lastUpdatedUtc)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
