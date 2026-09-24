import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useApp } from "../context/AppContext";

const JKUAT: [number, number] = [-1.0982, 37.0144];

// Fix default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const SEVERITY_COLORS: Record<string, string> = {
  info:    "#60a5fa",
  watch:   "#f59e0b",
  warning: "#ef4444",
};

function stationIcon() {
  return L.divIcon({
    className: "",
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#22c55e;
      border:2px solid #fff;
      box-shadow:0 0 0 3px rgba(34,197,94,0.2);
    "></div>`,
  });
}

function advisoryIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize:   [10, 10],
    iconAnchor: [5, 5],
    html: `<div style="
      width:10px;height:10px;border-radius:50%;
      background:${color};
      border:1.5px solid rgba(255,255,255,0.4);
    "></div>`,
  });
}

export function MapView() {
  const { state } = useApp();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Page header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p className="label-xs" style={{ marginBottom: 8 }}>Geospatial</p>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", margin: 0 }}>
            Advisory Map
          </h1>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
            <div key={sev} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 11, color: "#666", textTransform: "capitalize" }}>{sev}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Advisory count */}
      <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
        JKUAT Conduit, Juja ·{" "}
        {state.advisories.length === 0
          ? "No active advisories"
          : `${state.advisories.length} active advisor${state.advisories.length === 1 ? "y" : "ies"}`
        }
      </p>

      {/* Map */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <MapContainer
          center={JKUAT}
          zoom={14}
          style={{ height: 520, width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Station marker */}
          <Marker position={JKUAT} icon={stationIcon()}>
            <Popup>
              <div>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>JKUAT Conduit Station</p>
                <p style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>
                  {JKUAT[0]}°, {JKUAT[1]}°
                </p>
                <p style={{ fontSize: 11, color: "#aaa" }}>
                  {state.advisories.length} active advisor{state.advisories.length === 1 ? "y" : "ies"}
                </p>
              </div>
            </Popup>
          </Marker>

          {/* Advisory markers — slightly offset to avoid overlap */}
          {state.advisories.map((adv: any, i: number) => {
            const color = SEVERITY_COLORS[adv.severity] || SEVERITY_COLORS.info;
            const offset: [number, number] = [
              JKUAT[0] + (i + 1) * 0.0003,
              JKUAT[1] + (i + 1) * 0.0003,
            ];
            return (
              <Marker key={adv.id} position={offset} icon={advisoryIcon(color)}>
                <Popup>
                  <div>
                    <p style={{ fontWeight: 700, color, marginBottom: 6 }}>
                      {adv.severity.toUpperCase()} — {adv.type?.replace(/_/g, " ")}
                    </p>
                    <p style={{ fontSize: 12, lineHeight: 1.5 }}>{adv.action}</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Advisory list below map */}
      {state.advisories.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="label-xs" style={{ marginBottom: 12 }}>Active advisories</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.advisories.map((adv: any) => {
              const color = SEVERITY_COLORS[adv.severity] || SEVERITY_COLORS.info;
              return (
                <div
                  key={adv.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    padding: "14px 16px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 6,
                    background: "#111",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color,
                        marginRight: 8,
                      }}
                    >
                      {adv.severity}
                    </span>
                    <span style={{ fontSize: 13, color: "#888" }}>
                      {adv.type?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "#c0c0c0", maxWidth: 600, lineHeight: 1.5 }}>
                    {adv.action}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
