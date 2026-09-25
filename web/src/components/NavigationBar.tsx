import { NavLink } from "react-router-dom";
import { useApp } from "../context/AppContext";

const LINKS = [
  { to: "/",            label: "Station"    },
  { to: "/map",         label: "Map"        },
  { to: "/irrigation",  label: "Irrigation" },
  { to: "/alerts",      label: "Alerts"     },
  { to: "/dispatch",    label: "USSD / SMS" },
  { to: "/ask",         label: "Ask AI"     },
  { to: "/how-it-works",label: "Architecture"},
];

export function NavigationBar({ onOpenSimulator }: { onOpenSimulator?: () => void }) {
  const { state } = useApp();
  const live = state.apiAvailable;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(245, 245, 247, 0.82)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div className={`status-dot ${live ? "live" : "offline"}`} />
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#1d1d1f",
              letterSpacing: "-0.02em",
            }}
          >
            Conduit Sentinel
          </span>
          <span
            style={{
              padding: "2px 6px",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              borderRadius: 4,
              background: "rgba(0, 0, 0, 0.05)",
              color: "#6e6e73",
              border: "1px solid rgba(0, 0, 0, 0.06)",
            }}
          >
            JKUAT 2026
          </span>
        </div>

        {/* Nav links — desktop */}
        <nav
          className="no-scrollbar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            overflowX: "auto",
            flexShrink: 1,
            background: "rgba(0, 0, 0, 0.04)",
            padding: "3px 4px",
            borderRadius: 8,
            border: "1px solid rgba(0, 0, 0, 0.04)",
          }}
        >
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              style={({ isActive }) => ({
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                borderRadius: 6,
                background: isActive ? "#ffffff" : "transparent",
                color: isActive ? "#1d1d1f" : "#6e6e73",
                boxShadow: isActive ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
                transition: "all 0.15s ease",
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {onOpenSimulator && (
            <button
              onClick={onOpenSimulator}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: "#0071e3",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0, 113, 227, 0.25)",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#0077ed"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#0071e3"; }}
            >
              SIMULATE
            </button>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              background: "rgba(255, 255, 255, 0.8)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              borderRadius: 6,
            }}
          >
            <div className={`status-dot ${live ? "live" : "offline"}`} />
            <span style={{ fontSize: 10, color: "#6e6e73", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {live ? "TELEMETRY LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
