import { formatEat } from "../api";
import { useApp } from "../context/AppContext";
import { speech } from "../utils/speech";

const SEVERITY_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  accent: string;
}> = {
  info: {
    label: "Info",
    color: "#0071e3",
    bg: "rgba(0, 113, 227, 0.1)",
    border: "rgba(0, 113, 227, 0.25)",
    accent: "#0071e3",
  },
  watch: {
    label: "Watch",
    color: "#b25e02",
    bg: "rgba(255, 159, 10, 0.12)",
    border: "rgba(255, 159, 10, 0.25)",
    accent: "#ff9f0a",
  },
  warning: {
    label: "Warning",
    color: "#d70015",
    bg: "rgba(255, 59, 48, 0.1)",
    border: "rgba(255, 59, 48, 0.25)",
    accent: "#ff3b30",
  },
};

const TYPE_LABELS: Record<string, string> = {
  rain_risk:   "Precipitation Risk",
  irrigation:  "Irrigation Advisory",
  heat_stress: "Occupational Heat Stress",
};

export function AlertsFeed() {
  const { state } = useApp();
  const items = [...state.advisories].sort((a: any, b: any) =>
    String(b.valid_from).localeCompare(String(a.valid_from))
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 64 }}>
      {/* Page header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <span className="apple-badge" style={{ marginBottom: 8 }}>
            REAL-TIME DISPATCH ENGINE
          </span>
          <h1 className="apple-title" style={{ margin: "4px 0 0 0" }}>
            Alerts & Advisories
          </h1>
          <p style={{ fontSize: 14, color: "#6e6e73", marginTop: 6, fontWeight: 400 }}>
            Automated agronomic recommendations and physical risk triggers.
          </p>
        </div>

        <span className="apple-badge badge-amber">
          {items.length === 0 ? "0 ACTIVE ADVISORIES" : `${items.length} ACTIVE ADVISOR${items.length === 1 ? "Y" : "IES"}`}
        </span>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div
          className="apple-card"
          style={{
            textAlign: "center",
            padding: "64px 24px",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "rgba(52, 199, 89, 0.12)",
              color: "#248a3d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              border: "1px solid rgba(52, 199, 89, 0.25)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", marginBottom: 6 }}>
            All Systems Optimal
          </h3>
          <p style={{ fontSize: 14, color: "#86868b", margin: 0 }}>
            No active microclimate hazards or urgent irrigation requirements detected.
          </p>
        </div>
      )}

      {/* Advisory list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((adv: any) => {
          const cfg = SEVERITY_CONFIG[adv.severity] || SEVERITY_CONFIG.info;
          return (
            <div
              key={adv.id}
              className="apple-card"
              style={{
                borderLeft: `4px solid ${cfg.accent}`,
                padding: "22px 26px",
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: cfg.color,
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      padding: "3px 8px",
                      borderRadius: 4,
                    }}
                  >
                    {cfg.label}
                  </span>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
                    {TYPE_LABELS[adv.type] || adv.type?.replace(/_/g, " ")}
                  </h3>
                </div>

                <span style={{ fontSize: 11, fontWeight: 500, color: "#86868b" }}>
                  Valid until {formatEat(adv.valid_until)}
                </span>
              </div>

              {/* Action */}
              <p style={{ fontSize: 14, color: "#1d1d1f", lineHeight: 1.5, marginBottom: 16 }}>
                {adv.action}
              </p>

              {/* Evidence */}
              {adv.evidence && Object.keys(adv.evidence).length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    padding: "12px 16px",
                    background: "rgba(0, 0, 0, 0.02)",
                    borderRadius: 8,
                    border: "1px solid rgba(0, 0, 0, 0.04)",
                    marginBottom: 12,
                  }}
                >
                  {Object.entries(adv.evidence)
                    .filter(([k]) => !["observation_timestamp_utc", "qc_flags"].includes(k))
                    .slice(0, 5)
                    .map(([k, v]: [string, any]) => (
                      <div key={k} style={{ minWidth: 110 }}>
                        <p className="apple-subhead" style={{ marginBottom: 2 }}>{k.replace(/_/g, " ")}</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                          {typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}
                        </p>
                      </div>
                    ))}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#86868b", paddingTop: 8 }}>
                <button
                  onClick={() => speech.speak(adv.action)}
                  className="apple-btn apple-btn-secondary"
                  style={{ fontSize: 11, height: 30, padding: "0 10px", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <span>Listen (Sikiliza Sauti)</span>
                  <span>🔊</span>
                </button>
                <span>Telemetry Synchronized: {formatEat(state.lastUpdatedUtc)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
