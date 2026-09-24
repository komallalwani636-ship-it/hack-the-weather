import { NavLink } from "react-router-dom";
import { useApp } from "../context/AppContext";

const LINKS = [
  { to: "/",            label: "Station"    },
  { to: "/map",         label: "Map"        },
  { to: "/irrigation",  label: "Irrigation" },
  { to: "/alerts",      label: "Alerts"     },
  { to: "/ask",         label: "Ask"        },
  { to: "/how-it-works",label: "How It Works"},
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
        background: "rgba(10,10,10,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
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
          gap: 32,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div className="status-dot" style={{ background: live ? "#22c55e" : "#ef4444" }} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#f0f0f0",
              letterSpacing: "-0.01em",
            }}
          >
            Conduit Sentinel
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#444",
              marginLeft: 4,
            }}
          >
            JKUAT
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
          }}
        >
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {onOpenSimulator && (
            <button
              className="btn btn-ghost"
              onClick={onOpenSimulator}
              style={{ padding: "6px 14px", fontSize: 12 }}
            >
              Simulate
            </button>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 6,
            }}
          >
            <div
              className="status-dot"
              style={{
                background: live ? "#22c55e" : "#ef4444",
                animation: live ? undefined : "none",
              }}
            />
            <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {live ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
