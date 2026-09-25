import { useState } from "react";
import { useApp } from "../context/AppContext";
import { speech } from "../utils/speech";

interface UssdState {
  screen: "home" | "weather" | "irrigation" | "spray" | "soil" | "lang";
  lang: "sw" | "en";
}

export function FarmerDispatch() {
  const { state } = useApp();
  const [ussd, setUssd] = useState<UssdState>({ screen: "home", lang: "sw" });
  const [inputVal, setInputVal] = useState("");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeFarmer, setActiveFarmer] = useState("wanjiku");

  const obs = state.latest?.sensors || {};
  const temp = obs.temp_sht_c?.value ?? 22.4;
  const rh = obs.humidity_sht_pct?.value ?? 68;
  const wind = obs.wind_speed_ms?.value ?? 2.1;
  const p3 = (state.rainRisk?.p_rain_3h ?? 0.15) * 100;
  const p24 = (state.rainRisk?.p_rain_24h ?? 0.25) * 100;
  const et0 = state.irrigation?.et0_today_mm ?? 4.2;
  const soilWater = state.irrigation?.water_balance_mm ?? -8.4;
  const irrAction = state.irrigation?.irrigation_action ?? "No irrigation required today";

  function handleUssdSend(choice?: string) {
    const val = (choice ?? inputVal).trim();
    setInputVal("");

    if (ussd.screen === "home") {
      if (val === "1") setUssd({ ...ussd, screen: "weather" });
      else if (val === "2") setUssd({ ...ussd, screen: "irrigation" });
      else if (val === "3") setUssd({ ...ussd, screen: "spray" });
      else if (val === "4") setUssd({ ...ussd, screen: "soil" });
      else if (val === "5") setUssd({ ...ussd, lang: ussd.lang === "sw" ? "en" : "sw" });
    } else {
      if (val === "0" || val === "") setUssd({ ...ussd, screen: "home" });
    }
  }

  function handlePlayAudio(text: string, lang: "en" | "sw") {
    if (isPlayingAudio) {
      speech.stop();
      setIsPlayingAudio(false);
    } else {
      speech.speak(text, lang);
      setIsPlayingAudio(true);
      setTimeout(() => setIsPlayingAudio(false), 9000);
    }
  }

  // Pre-configured smallholder personas in Juja
  const FARMERS = {
    wanjiku: {
      name: "Mama Wanjiku",
      location: "Juja Farm (Sector B)",
      crop: "Maize & Beans (2.5 Acres)",
      phone: "+254 722 ••• 419",
      smsText: `[SENTINEL JKUAT] Habari Mama Wanjiku: Mvukizo leo ni ${et0.toFixed(1)} mm. Unyevu wa shamba una upungufu wa ${Math.abs(soilWater).toFixed(1)} mm. Hatari ya mvua 24h ni ${p24.toFixed(0)}%. Ushauri: Mwagilia mimea mapema kabla ya 08:00 EAT. Piga *384*96# kwa maelezo zaidi.`,
      smsLang: "sw" as const,
    },
    kamau: {
      name: "John Kamau",
      location: "Kalimoni Greenhouses",
      crop: "Drip Tomatoes & Capsicum",
      phone: "+254 733 ••• 882",
      smsText: `[SENTINEL JKUAT] Field Advisory: Today's solar radiation is strong. Wind speed is ${wind.toFixed(1)} m/s (safe for foliar feeding). Irrigation requirement: ${et0.toFixed(1)} mm. Spray window is OPTIMAL until 14:00 EAT. Free USSD: *384*96#`,
      smsLang: "en" as const,
    },
    otieno: {
      name: "Peter Otieno",
      location: "Ndarugu River Basin",
      crop: "Kales & Traditional Vegetables",
      phone: "+254 710 ••• 154",
      smsText: `[SENTINEL JKUAT] Tahadhari ya Mvua: Hatari ya mvua masaa 3 ni ${p3.toFixed(0)}%. Kasi ya upepo ni ${wind.toFixed(1)} m/s. Usinyunyizie viuatilifu kwa sasa ili kuzuia dawa kuoshwa mtoni. Unyevu wa udongo unatosha. Huduma ya bure *384*96#`,
      smsLang: "sw" as const,
    },
  };

  const activeFarmerData = FARMERS[activeFarmer as keyof typeof FARMERS];

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <span className="apple-badge badge-green" style={{ marginBottom: 8 }}>
          LAST-MILE COMMUNITY RESILIENCE
        </span>
        <h1 className="apple-title" style={{ margin: "4px 0 0 0" }}>
          Farmer Dispatch & USSD Gateway
        </h1>
        <p style={{ fontSize: 14, color: "#6e6e73", marginTop: 6, fontWeight: 400 }}>
          Zero-data accessible climate intelligence for smallholders across Juja & Kiambu. Powered by 2G GSM & USSD (*384*96#).
        </p>
      </div>

      {/* Impact Stats Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <div className="apple-card" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Active Smallholders Reached</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#1d1d1f" }}>1,420</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: "#248a3d", fontWeight: 600 }}>Juja, Ruiru & Ndarugu Basin</p>
        </div>

        <div className="apple-card" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Irrigation Water Saved</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0071e3" }}>34.2%</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: "#6e6e73" }}>Via FAO-56 Rain Suppression</p>
        </div>

        <div className="apple-card" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Data Cost for Farmers</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#248a3d" }}>KES 0.00</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: "#248a3d", fontWeight: 600 }}>Zero-rated GSM / Safaricom</p>
        </div>

        <div className="apple-card" style={{ padding: "18px 20px" }}>
          <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#86868b", fontWeight: 600 }}>Dispatched Language</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#b25e02" }}>Bilingual</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: "#6e6e73" }}>Kiswahili Sanifu & English</p>
        </div>
      </div>

      {/* Main Grid: USSD Feature Phone Simulator + SMS Broadcast Terminal */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 24, marginBottom: 32 }}>
        {/* Left: USSD Feature Phone Simulator */}
        <div className="apple-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <p className="apple-subhead" style={{ margin: 0 }}>Interactive 2G USSD Simulator</p>
              <span style={{ fontSize: 11, color: "#86868b" }}>Dial Code: *384*96# (Zero-Rated)</span>
            </div>
            <button
              onClick={() => setUssd({ screen: "home", lang: ussd.lang })}
              style={{
                background: "rgba(0, 0, 0, 0.04)",
                border: "1px solid rgba(0, 0, 0, 0.08)",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reset Session
            </button>
          </div>

          {/* Feature Phone Screen Container */}
          <div
            style={{
              background: "#1c231e",
              borderRadius: 12,
              padding: "20px",
              boxShadow: "inset 0 2px 10px rgba(0, 0, 0, 0.5)",
              border: "4px solid #2d3730",
              fontFamily: "'Courier New', Courier, monospace",
              color: "#68d391",
              minHeight: 220,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #2d3730", paddingBottom: 6, marginBottom: 12, fontSize: 10, color: "#9ae6b4" }}>
                <span>CONDUIT SENTINEL JKUAT</span>
                <span>*384*96#</span>
              </div>

              {ussd.screen === "home" && (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#ffffff", fontWeight: "bold" }}>
                    {ussd.lang === "sw" ? "Chagua Huduma ya Kilimo:" : "Select Agricultural Service:"}
                  </p>
                  <p style={{ margin: 0 }}>1. {ussd.lang === "sw" ? "Hali ya Hewa (Weather)" : "Current Weather"}</p>
                  <p style={{ margin: 0 }}>2. {ussd.lang === "sw" ? "Umwagiliaji Mahindi/Maharagwe" : "Irrigation Dosage (FAO-56)"}</p>
                  <p style={{ margin: 0 }}>3. {ussd.lang === "sw" ? "Usalama wa Kupulizia Dawa" : "Pesticide Spray Safety"}</p>
                  <p style={{ margin: 0 }}>4. {ussd.lang === "sw" ? "Unyevu wa Udongo Shambani" : "Soil Water Balance"}</p>
                  <p style={{ margin: 0 }}>5. {ussd.lang === "sw" ? "Badilisha Lugha (English)" : "Badilisha Lugha (Kiswahili)"}</p>
                </div>
              )}

              {ussd.screen === "weather" && (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#ffffff", fontWeight: "bold" }}>
                    {ussd.lang === "sw" ? "Hali ya Hewa Kituo cha JKUAT:" : "JKUAT Live Weather:"}
                  </p>
                  <p style={{ margin: 0 }}>• Joto: {temp.toFixed(1)} C | Unyevu: {rh.toFixed(0)}%</p>
                  <p style={{ margin: 0 }}>• Hatari ya Mvua (3h): {p3.toFixed(0)}%</p>
                  <p style={{ margin: 0 }}>• Hatari ya Mvua (24h): {p24.toFixed(0)}%</p>
                  <p style={{ margin: "8px 0 0 0", color: "#9ae6b4" }}>0. Rudi Nyuma (Back)</p>
                </div>
              )}

              {ussd.screen === "irrigation" && (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#ffffff", fontWeight: "bold" }}>
                    {ussd.lang === "sw" ? "Ushauri wa Umwagiliaji:" : "Irrigation Prescription:"}
                  </p>
                  <p style={{ margin: 0 }}>• Mvukizo (ET0): {et0.toFixed(1)} mm/siku</p>
                  <p style={{ margin: 0 }}>• Upungufu: {Math.abs(soilWater).toFixed(1)} mm</p>
                  <p style={{ margin: "4px 0 0 0", color: "#fbd38d" }}>
                    {ussd.lang === "sw"
                      ? "Ushauri: Mwagilia mimea mapema kabla ya saa 2:00 asubuhi."
                      : "Prescription: Irrigate early morning before 08:00 EAT."}
                  </p>
                  <p style={{ margin: "8px 0 0 0", color: "#9ae6b4" }}>0. Rudi Nyuma (Back)</p>
                </div>
              )}

              {ussd.screen === "spray" && (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#ffffff", fontWeight: "bold" }}>
                    {ussd.lang === "sw" ? "Usalama wa Kupulizia Dawa:" : "Pesticide Spray Safety:"}
                  </p>
                  <p style={{ margin: 0 }}>• Upepo: {wind.toFixed(1)} m/s (Salama &lt; 4.0)</p>
                  <p style={{ margin: 0 }}>• Hatari Mvua 3h: {p3.toFixed(0)}%</p>
                  <p style={{ margin: "4px 0 0 0", color: wind < 4.0 ? "#9ae6b4" : "#feb2b2" }}>
                    {wind < 4.0
                      ? (ussd.lang === "sw" ? "HALI INAFAA: Upepo uko salama." : "OPTIMAL: Safe spray conditions.")
                      : (ussd.lang === "sw" ? "HATARI: Upepo mkali unapeperusha dawa." : "UNFAVORABLE: High drift risk.")}
                  </p>
                  <p style={{ margin: "8px 0 0 0", color: "#9ae6b4" }}>0. Rudi Nyuma (Back)</p>
                </div>
              )}

              {ussd.screen === "soil" && (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#ffffff", fontWeight: "bold" }}>
                    {ussd.lang === "sw" ? "Unyevu wa Udongo (FAO-56):" : "Soil Moisture Status:"}
                  </p>
                  <p style={{ margin: 0 }}>• Mizani ya Maji: {soilWater.toFixed(1)} mm</p>
                  <p style={{ margin: 0 }}>• Kiwango Salama: &gt; -20 mm</p>
                  <p style={{ margin: "4px 0 0 0", color: "#9ae6b4" }}>
                    {soilWater > -20
                      ? (ussd.lang === "sw" ? "Unyevu unatosha kukidhi mahitaji." : "Adequate root moisture.")
                      : (ussd.lang === "sw" ? "Upungufu umeanza; mwagilia maji." : "Deficit threshold crossed.")}
                  </p>
                  <p style={{ margin: "8px 0 0 0", color: "#9ae6b4" }}>0. Rudi Nyuma (Back)</p>
                </div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Enter 1, 2, 3... or 0"
                  style={{
                    flex: 1,
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid #2d3730",
                    color: "#ffffff",
                    padding: "6px 10px",
                    fontSize: 12,
                    borderRadius: 4,
                    outline: "none",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleUssdSend()}
                />
                <button
                  onClick={() => handleUssdSend()}
                  style={{
                    background: "#2f855a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 4,
                    padding: "6px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Quick Keypad buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {["1", "2", "3", "4", "5", "0"].map((k) => (
              <button
                key={k}
                onClick={() => handleUssdSend(k)}
                style={{
                  background: "rgba(0, 0, 0, 0.03)",
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  borderRadius: 6,
                  padding: "8px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#1d1d1f",
                  cursor: "pointer",
                }}
              >
                Key {k}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Automated SMS Broadcast Simulator */}
        <div className="apple-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <p className="apple-subhead" style={{ margin: 0 }}>Automated GSM SMS Gateway</p>
              <span style={{ fontSize: 11, color: "#86868b" }}>Live Smallholder Cooperative Broadcast</span>
            </div>
            <span className="apple-badge badge-blue">Safaricom Telemetry Push</span>
          </div>

          {/* Farmer Persona Picker */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#86868b", display: "block", marginBottom: 6 }}>
              Select Registered Smallholder Profile:
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(FARMERS).map(([key, f]) => (
                <button
                  key={key}
                  onClick={() => setActiveFarmer(key)}
                  className={`apple-segment-btn${activeFarmer === key ? " active" : ""}`}
                  style={{ fontSize: 11, padding: "6px 12px" }}
                >
                  {f.name} ({f.location.split(" ")[0]})
                </button>
              ))}
            </div>
          </div>

          {/* Farmer Card */}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.02)",
              borderRadius: 8,
              padding: "12px 16px",
              border: "1px solid rgba(0, 0, 0, 0.04)",
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <strong>{activeFarmerData.name}</strong>
              <span style={{ color: "#86868b" }}>{activeFarmerData.phone}</span>
            </div>
            <p style={{ margin: 0, color: "#6e6e73" }}>
              {activeFarmerData.location} · {activeFarmerData.crop}
            </p>
          </div>

          {/* Mobile SMS Bubble Preview */}
          <div
            style={{
              background: "#e9e9eb",
              borderRadius: 16,
              padding: "16px 18px",
              color: "#1d1d1f",
              fontSize: 13,
              lineHeight: 1.5,
              position: "relative",
              marginBottom: 18,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#0071e3" }}>
                SENDER: SENTINEL-JKUAT
              </span>
              <span style={{ fontSize: 10, color: "#86868b" }}>
                Today 06:30 EAT
              </span>
            </div>
            <p style={{ margin: 0 }}>
              {activeFarmerData.smsText}
            </p>
          </div>

          {/* Audio Accessibility Action */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#86868b" }}>
              Accessibility for non-literate farmers:
            </span>
            <button
              onClick={() => handlePlayAudio(activeFarmerData.smsText, activeFarmerData.smsLang)}
              className="apple-btn apple-btn-primary"
              style={{ fontSize: 12, height: 36, padding: "0 14px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span>{isPlayingAudio ? "Stop Audio" : "Sikiliza Sauti (Listen)"}</span>
              <span style={{ fontSize: 13 }}>{isPlayingAudio ? "⏹" : "🔊"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Field Extension Officer Agronomic Report Export */}
      <div className="apple-card" style={{ padding: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px 0", color: "#1d1d1f" }}>
            County Agricultural Extension Officer Report
          </h3>
          <p style={{ fontSize: 13, color: "#6e6e73", margin: 0 }}>
            Generate a certified microclimate advisory bulletin for Kiambu County ward agricultural extension officers.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="apple-btn apple-btn-secondary"
          style={{ height: 40, padding: "0 18px", fontSize: 13 }}
        >
          Print / Export Field Report
        </button>
      </div>
    </div>
  );
}
