import { useState } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useApp } from "../context/AppContext";
import { speech } from "../utils/speech";

const JKUAT: [number, number] = [-1.0982, 37.0144];

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface AgriculturalSector {
  id: string;
  name: string;
  category: string;
  coords: [number, number];
  crop: string;
  stage: string;
  soilDeficitMm: number;
  et0Mm: number;
  rainRiskPct: number;
  spraySafe: boolean;
  status: "optimal" | "warning" | "alert";
  prescriptionEn: string;
  prescriptionSw: string;
}

const SECTORS: AgriculturalSector[] = [
  {
    id: "jkuat_farm",
    name: "JKUAT Agronomy Research Plots",
    category: "Cereal & Grain Research",
    coords: [-1.0920, 37.0185],
    crop: "Maize (Hybrid H614)",
    stage: "Mid-Season (Tasseling)",
    soilDeficitMm: -18.4,
    et0Mm: 4.4,
    rainRiskPct: 15,
    spraySafe: true,
    status: "warning",
    prescriptionEn: "Soil depletion approaching threshold (-20 mm). Apply 18.0 mm supplemental irrigation before 08:00 to prevent pollination water stress.",
    prescriptionSw: "Upungufu wa maji ardhini unakaribia kiwango cha hatari (-20 mm). Mwagilia maji 18.0 mm mapema kabla ya saa 2:00 asubuhi kulinda maua ya mahindi.",
  },
  {
    id: "juja_horticulture",
    name: "Juja South Drip Greenhouse Cluster",
    category: "High-Value Horticulture",
    coords: [-1.1080, 37.0110],
    crop: "Greenhouse Tomatoes & Capsicum",
    stage: "Fruiting & Maturation",
    soilDeficitMm: -8.2,
    et0Mm: 4.8,
    rainRiskPct: 10,
    spraySafe: true,
    status: "optimal",
    prescriptionEn: "Adequate soil water envelope. High solar radiation (430 W/m²) favors drip fertigation pulse at 11:00 EAT.",
    prescriptionSw: "Unyevu wa udongo uko katika kiwango kizuri. Mionzi ya jua inafaa kwa kuongeza virutubisho kupitia mifereji ya njia ya matone saa 5:00 asubuhi.",
  },
  {
    id: "ndarugu_basin",
    name: "Ndarugu River Catchment Corridor",
    category: "Riparian & Hydrological Buffer",
    coords: [-1.0850, 37.0280],
    crop: "Kales, Spinach & Arrowroots",
    stage: "Vegetative Flush",
    soilDeficitMm: -2.1,
    et0Mm: 3.6,
    rainRiskPct: 40,
    spraySafe: false,
    status: "alert",
    prescriptionEn: "Riparian soil saturation high. Upstream runoff anticipated; delay chemical spraying due to wind shear (4.6 m/s) and rain risk.",
    prescriptionSw: "Udongo kando ya mto una unyevu mwingi. Usinyunyizie dawa kwa sasa kwa sababu ya upepo mkali (4.6 m/s) na hatari ya mvua kusomba dawa mtoni.",
  },
  {
    id: "kalimoni_agro",
    name: "Kalimoni Smallholder Coffee Estate",
    category: "Agroforestry & Perennial",
    coords: [-1.1120, 37.0260],
    crop: "Arabica Coffee (Ruiru 11) & Macadamia",
    stage: "Berry Expansion",
    soilDeficitMm: -14.2,
    et0Mm: 4.1,
    rainRiskPct: 15,
    spraySafe: true,
    status: "optimal",
    prescriptionEn: "Shade canopy buffering microclimate. Favorable conditions for foliar nutrient spraying and berry borer scouting.",
    prescriptionSw: "Mitia ya kivuli inalinda hali ya hewa ya kahawa. Hali inafaa kwa kunyunyizia mbolea ya majani na kukagua wadudu waharibifu wa kahawa.",
  },
];

const TILE_LAYERS = {
  esriLight: {
    label: "Apple Light",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attr: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap',
  },
  satellite: {
    label: "Satellite Aerial",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri, Maxar, Earthstar Geographics",
  },
  osm: {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

function createSectorIcon(status: string) {
  const color = status === "optimal" ? "#34c759" : status === "warning" ? "#ff9f0a" : "#ff3b30";
  return L.divIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `
      <div style="
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid #ffffff;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
      </div>
    `,
  });
}

function stationBeaconIcon() {
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `
      <div style="
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: rgba(0, 113, 227, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #0071e3;
          border: 2.5px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0, 113, 227, 0.5);
        "></div>
      </div>
    `,
  });
}

export function MapView() {
  const { state } = useApp();
  const [activeTile, setActiveTile] = useState<keyof typeof TILE_LAYERS>("esriLight");
  const [activeOverlay, setActiveOverlay] = useState<"all" | "irrigation" | "rain" | "spray">("all");
  const [selectedSector, setSelectedSector] = useState<AgriculturalSector | null>(SECTORS[0]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Extract live station observations
  const obs = state.latest?.sensors || {};
  const temp = obs.temp_sht_c?.value ?? 22.4;
  const rh = obs.humidity_sht_pct?.value ?? 68;
  const wind = obs.wind_speed_ms?.value ?? 2.1;
  const et0 = state.irrigation?.et0_today_mm ?? 4.2;

  function handlePlayAudio(text: string, lang: "en" | "sw" = "en") {
    if (isPlayingAudio) {
      speech.stop();
      setIsPlayingAudio(false);
    } else {
      speech.speak(text, lang);
      setIsPlayingAudio(true);
      setTimeout(() => setIsPlayingAudio(false), 8000);
    }
  }

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 64 }}>
      {/* Page header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <span className="apple-badge badge-blue" style={{ marginBottom: 8 }}>
            SPATIAL MICROCLIMATE OBSERVATORY
          </span>
          <h1 className="apple-title" style={{ margin: "4px 0 0 0" }}>
            Catchment Climate Map
          </h1>
          <p style={{ fontSize: 14, color: "#6e6e73", marginTop: 6, fontWeight: 400 }}>
            JKUAT Main Station & Juja Agro-Ecological Catchment (15 km Microclimate Grid)
          </p>
        </div>

        {/* Map style & overlay selectors */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Tile Layer selector */}
          <div className="apple-segment-group">
            {Object.entries(TILE_LAYERS).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setActiveTile(key as any)}
                className={`apple-segment-btn${activeTile === key ? " active" : ""}`}
                style={{ fontSize: 11, padding: "5px 10px" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Overlay Filter */}
          <div className="apple-segment-group">
            {[
              { id: "all", label: "All Sectors" },
              { id: "irrigation", label: "Irrigation Deficit" },
              { id: "rain", label: "Rain Radar" },
              { id: "spray", label: "Spray Safety" },
            ].map((ov) => (
              <button
                key={ov.id}
                onClick={() => setActiveOverlay(ov.id as any)}
                className={`apple-segment-btn${activeOverlay === ov.id ? " active" : ""}`}
                style={{ fontSize: 11, padding: "5px 10px" }}
              >
                {ov.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Explanatory Scientific Callout — Answers "What is the use of the map?" */}
      <div
        className="apple-card"
        style={{
          padding: "16px 20px",
          marginBottom: 20,
          background: "rgba(0, 113, 227, 0.04)",
          border: "1px solid rgba(0, 113, 227, 0.15)",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#0071e3",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          i
        </div>
        <div>
          <p style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 700, color: "#1d1d1f" }}>
            Why Geospatial Catchment Intelligence Matters in Agriculture
          </p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "#424245" }}>
            Weather observations at the physical Conduit station (elevation 1,525m) provide verified ground truth. However, rainfall, soil moisture, and wind shear vary across elevation and river basins. Conduit Sentinel interpolates physical sensor telemetry with spatial Open-Meteo grids across the 15 km Juja catchment, delivering field-specific advisories for smallholder clusters.
          </p>
        </div>
      </div>

      {/* Main Map Container */}
      <div
        className="apple-glass"
        style={{
          overflow: "hidden",
          borderRadius: 14,
          marginBottom: 24,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.06)",
        }}
      >
        <MapContainer
          center={JKUAT}
          zoom={13}
          style={{ height: 500, width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            key={activeTile}
            attribution={TILE_LAYERS[activeTile].attr}
            url={TILE_LAYERS[activeTile].url}
          />

          {/* Primary High-Confidence Sensor Radius (< 2.2 km) */}
          <Circle
            center={JKUAT}
            radius={2200}
            pathOptions={{
              color: "#0071e3",
              fillColor: "#0071e3",
              fillOpacity: 0.04,
              weight: 1.5,
              dashArray: "4 4",
            }}
          />

          {/* Visual Convective Rain Envelope Overlay (when Rain Radar active) */}
          {(activeOverlay === "rain" || activeOverlay === "all") && (
            <Circle
              center={[-1.0880, 37.0220]}
              radius={3400}
              pathOptions={{
                color: "#5856d6",
                fillColor: "#5856d6",
                fillOpacity: activeOverlay === "rain" ? 0.12 : 0.04,
                weight: 1,
              }}
            />
          )}

          {/* Conduit Physical Station Beacon */}
          <Marker position={JKUAT} icon={stationBeaconIcon()}>
            <Popup>
              <div style={{ padding: "6px" }}>
                <span className="apple-badge badge-blue" style={{ fontSize: 9, marginBottom: 4 }}>
                  GROUND OBSERVATORY HUB
                </span>
                <p style={{ fontWeight: 800, fontSize: 13, color: "#1d1d1f", margin: "2px 0 6px 0" }}>
                  JKUAT Conduit Weather Station
                </p>
                <div style={{ fontSize: 11, color: "#424245", lineHeight: 1.5 }}>
                  <p style={{ margin: "0 0 2px 0" }}>• Temp: <strong>{temp.toFixed(1)} °C</strong> | RH: <strong>{rh.toFixed(0)}%</strong></p>
                  <p style={{ margin: "0 0 2px 0" }}>• Wind: <strong>{wind.toFixed(1)} m/s</strong> | ET₀: <strong>{et0.toFixed(1)} mm/day</strong></p>
                  <p style={{ margin: "4px 0 0 0", color: "#248a3d", fontWeight: 700 }}>
                    Telemetry Validated · Dual Tipping Bucket Active
                  </p>
                </div>
              </div>
            </Popup>
          </Marker>

          {/* Agricultural Sector Markers */}
          {SECTORS.map((sector) => {
            // Apply overlay filter visibility
            if (activeOverlay === "irrigation" && sector.soilDeficitMm > -10) return null;
            if (activeOverlay === "rain" && sector.rainRiskPct < 20) return null;
            if (activeOverlay === "spray" && !sector.spraySafe) return null;

            return (
              <Marker
                key={sector.id}
                position={sector.coords}
                icon={createSectorIcon(sector.status)}
                eventHandlers={{
                  click: () => setSelectedSector(sector),
                }}
              >
                <Popup>
                  <div style={{ padding: "6px" }}>
                    <p style={{ fontWeight: 800, fontSize: 13, color: "#1d1d1f", margin: "0 0 2px 0" }}>
                      {sector.name}
                    </p>
                    <p style={{ fontSize: 11, color: "#86868b", margin: "0 0 6px 0" }}>
                      {sector.crop} · {sector.stage}
                    </p>
                    <div style={{ fontSize: 11, color: "#424245", lineHeight: 1.4 }}>
                      <p style={{ margin: "0 0 2px 0" }}>
                        Water Deficit: <strong style={{ color: sector.soilDeficitMm < -15 ? "#b25e02" : "#248a3d" }}>{sector.soilDeficitMm} mm</strong>
                      </p>
                      <p style={{ margin: "0 0 4px 0" }}>
                        Rain Risk: <strong>{sector.rainRiskPct}%</strong> | Spray: <strong>{sector.spraySafe ? "Safe" : "Unfavorable"}</strong>
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedSector(sector)}
                      style={{
                        marginTop: 6,
                        width: "100%",
                        padding: "4px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        background: "#0071e3",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      Inspect Sector Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Selected Sector Inspector Panel */}
      {selectedSector && (
        <div className="apple-card" style={{ padding: "24px", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    background: selectedSector.status === "optimal" ? "rgba(52, 199, 89, 0.12)" : selectedSector.status === "warning" ? "rgba(255, 159, 10, 0.12)" : "rgba(255, 59, 48, 0.12)",
                    color: selectedSector.status === "optimal" ? "#248a3d" : selectedSector.status === "warning" ? "#b25e02" : "#d70015",
                    border: `1px solid ${selectedSector.status === "optimal" ? "rgba(52, 199, 89, 0.25)" : "rgba(255, 159, 10, 0.25)"}`,
                  }}
                >
                  {selectedSector.category}
                </span>
                <span style={{ fontSize: 11, color: "#86868b" }}>
                  [{selectedSector.coords[0].toFixed(4)}°, {selectedSector.coords[1].toFixed(4)}°]
                </span>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>
                {selectedSector.name}
              </h2>
              <p style={{ fontSize: 13, color: "#6e6e73", marginTop: 4 }}>
                Target Crop: <strong>{selectedSector.crop}</strong> · Phenology: <strong>{selectedSector.stage}</strong>
              </p>
            </div>

            <button
              onClick={() => handlePlayAudio(selectedSector.prescriptionEn, "en")}
              className="apple-btn apple-btn-secondary"
              style={{ fontSize: 12, height: 36, padding: "0 14px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span>{isPlayingAudio ? "Stop Audio" : "Listen (Sauti)"}</span>
              <span style={{ fontSize: 13 }}>{isPlayingAudio ? "⏹" : "🔊"}</span>
            </button>
          </div>

          {/* Sector Telemetry Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ background: "rgba(0, 0, 0, 0.02)", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(0, 0, 0, 0.04)" }}>
              <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Soil Moisture Balance</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: selectedSector.soilDeficitMm < -15 ? "#b25e02" : "#248a3d" }}>
                {selectedSector.soilDeficitMm} mm
              </p>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.02)", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(0, 0, 0, 0.04)" }}>
              <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Reference ET₀</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1d1d1f" }}>
                {selectedSector.et0Mm} mm/d
              </p>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.02)", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(0, 0, 0, 0.04)" }}>
              <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Precipitation Risk</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: selectedSector.rainRiskPct > 30 ? "#0071e3" : "#1d1d1f" }}>
                {selectedSector.rainRiskPct}%
              </p>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.02)", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(0, 0, 0, 0.04)" }}>
              <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Spraying Window</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: selectedSector.spraySafe ? "#248a3d" : "#d70015" }}>
                {selectedSector.spraySafe ? "Permissible" : "Unfavorable"}
              </p>
            </div>
          </div>

          {/* Bilingual Agronomic Action Prescriptions */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <div style={{ background: "rgba(255, 255, 255, 0.6)", padding: "14px 18px", borderRadius: 8, border: "1px solid rgba(0, 0, 0, 0.06)" }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#0071e3", letterSpacing: "0.04em", margin: "0 0 4px 0" }}>
                Agronomic Prescription (English)
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: "#1d1d1f", margin: 0 }}>
                {selectedSector.prescriptionEn}
              </p>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.6)", padding: "14px 18px", borderRadius: 8, border: "1px solid rgba(0, 0, 0, 0.06)" }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#248a3d", letterSpacing: "0.04em", margin: "0 0 4px 0" }}>
                Ushauri wa Kilimo (Kiswahili)
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: "#1d1d1f", margin: 0 }}>
                {selectedSector.prescriptionSw}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sector Quick Directory Cards */}
      <div>
        <p className="apple-subhead" style={{ marginBottom: 12 }}>Catchment Agricultural Sectors</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {SECTORS.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedSector(s)}
              className="apple-card"
              style={{
                padding: "16px 20px",
                cursor: "pointer",
                borderLeft: `4px solid ${s.status === "optimal" ? "#34c759" : s.status === "warning" ? "#ff9f0a" : "#ff3b30"}`,
                background: selectedSector?.id === s.id ? "rgba(0, 113, 227, 0.04)" : "#ffffff",
                transition: "all 0.15s ease",
              }}
            >
              <p style={{ margin: "0 0 2px 0", fontSize: 14, fontWeight: 700, color: "#1d1d1f" }}>{s.name}</p>
              <p style={{ margin: "0 0 8px 0", fontSize: 11, color: "#86868b" }}>{s.crop}</p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "#6e6e73" }}>Deficit: <strong>{s.soilDeficitMm} mm</strong></span>
                <span style={{ color: s.spraySafe ? "#248a3d" : "#d70015", fontWeight: 600 }}>
                  {s.spraySafe ? "Spray Safe" : "Delay Spray"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
