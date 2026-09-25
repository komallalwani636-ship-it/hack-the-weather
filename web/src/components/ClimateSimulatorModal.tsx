import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "../api";
import { useApp } from "../context/AppContext";

interface ClimateSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESETS = [
  {
    id: "normal",
    label: "Optimal Baseline",
    tag: "OPTIMAL",
    color: "#248a3d",
    bg: "rgba(52, 199, 89, 0.1)",
    border: "rgba(52, 199, 89, 0.25)",
    desc: "Standard mild Kenyan highland conditions with balanced moisture.",
  },
  {
    id: "storm",
    label: "Torrential Downpour",
    tag: "STORM",
    color: "#0071e3",
    bg: "rgba(0, 113, 227, 0.1)",
    border: "rgba(0, 113, 227, 0.25)",
    desc: "89% 3h rain probability, high wind gust, operations warning fired.",
  },
  {
    id: "heatwave",
    label: "Extreme Heatwave",
    tag: "HEATWAVE",
    color: "#b25e02",
    bg: "rgba(255, 159, 10, 0.1)",
    border: "rgba(255, 159, 10, 0.25)",
    desc: "36.8°C with high humidity, WBGT High warning, peak solar radiation.",
  },
  {
    id: "drought",
    label: "Severe Soil Drought",
    tag: "DROUGHT",
    color: "#ca8a04",
    bg: "rgba(202, 138, 4, 0.1)",
    border: "rgba(202, 138, 4, 0.25)",
    desc: "Soil water deficit -32.4 mm, urgent 38.9 mm irrigation advisory triggered.",
  },
  {
    id: "sensor_fault",
    label: "QC Cross-Fail Anomaly",
    tag: "ANOMALY",
    color: "#d70015",
    bg: "rgba(255, 59, 48, 0.1)",
    border: "rgba(255, 59, 48, 0.25)",
    desc: "Gauge 1 reads 12.5mm vs Gauge 2 at 0.0mm; triggers automated QC flag.",
  },
];

export function ClimateSimulatorModal({ isOpen, onClose }: ClimateSimulatorModalProps) {
  const { applySimulation, resetSimulation, state } = useApp();
  const [selectedPreset, setSelectedPreset] = useState("storm");
  const [temp, setTemp] = useState(24);
  const [rh, setRh] = useState(70);
  const [solar, setSolar] = useState(500);
  const [wind, setWind] = useState(2.5);
  const [rain1, setRain1] = useState(0);
  const [rain2, setRain2] = useState(0);
  const [crop, setCrop] = useState("maize");
  const [stage, setStage] = useState("mid");

  const [loading, setLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId === "storm") {
      setTemp(18.5);
      setRh(94);
      setSolar(95);
      setWind(9.2);
      setRain1(18.5);
      setRain2(18.2);
    } else if (presetId === "heatwave") {
      setTemp(36.8);
      setRh(74);
      setSolar(980);
      setWind(1.1);
      setRain1(0);
      setRain2(0);
    } else if (presetId === "drought") {
      setTemp(33.2);
      setRh(24);
      setSolar(880);
      setWind(4.8);
      setRain1(0);
      setRain2(0);
    } else if (presetId === "sensor_fault") {
      setTemp(22.0);
      setRh(65);
      setSolar(450);
      setWind(2.5);
      setRain1(12.5);
      setRain2(0);
    } else {
      setTemp(22.8);
      setRh(66);
      setSolar(420);
      setWind(2.6);
      setRain1(0);
      setRain2(0);
    }
  };

  const runSimulation = async () => {
    setLoading(true);
    try {
      const payload = {
        temp_sht_c: temp,
        humidity_sht_pct: rh,
        si1145_visible: Math.round(solar * (65535 / 800)),
        wind_speed_ms: wind,
        rain_gauge_1_mm: rain1,
        rain_gauge_2_mm: rain2,
        crop,
        stage,
      };

      const res = await fetch(`${API_URL}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Simulation failed: ${res.statusText}`);
      }

      const data = await res.json();
      setSimResult(data);

      applySimulation(
        {
          timestamp_utc: new Date().toISOString(),
          sensors: {
            temp_sht_c: { value: temp, qc_flag: "OK" },
            humidity_sht_pct: { value: rh, qc_flag: "OK" },
            si1145_visible: { value: payload.si1145_visible, qc_flag: "OK" },
            wind_speed_ms: { value: wind, qc_flag: "OK" },
            wind_direction_deg: { value: 145, qc_flag: "OK" },
            rain_gauge_1_mm: { value: rain1, qc_flag: Math.abs(rain1 - rain2) > 2.0 && (rain1 > 0 || rain2 > 0) ? "CROSS_FAIL" : "OK" },
            rain_gauge_2_mm: { value: rain2, qc_flag: Math.abs(rain1 - rain2) > 2.0 && (rain1 > 0 || rain2 > 0) ? "CROSS_FAIL" : "OK" },
            pressure_hpa: { value: 1012.0, qc_flag: "OK" },
            wbgt_c: { value: data.wbgt_c ?? 22.0, qc_flag: "OK" },
          },
          station_id: "CONDUIT_JUJA_SIM",
        },
        data.rain_risk ?? { p_rain_3h: data.p_rain_3h, p_rain_24h: data.p_rain_24h, risk_level_3h: data.p_rain_3h > 0.6 ? "warning" : "info" },
        data.irrigation ?? {
          crop,
          stage,
          irrigation_required: data.irrigation_required,
          irrigation_action: data.irrigation_action,
          et0_today_mm: data.et0_today_mm,
          water_balance_mm: data.water_balance_mm,
        },
        data.advisories ?? [],
        selectedPreset.toUpperCase()
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    resetSimulation();
    setSimResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/30 backdrop-blur-md"
        />

        {/* Modal Window (Apple Glassmorphism Dialog) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 15 }}
          className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-black/10 bg-white/95 p-6 shadow-2xl backdrop-blur-2xl md:p-8"
          style={{
            borderRadius: 16,
            boxShadow: "0 24px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08)",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-black/5 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="apple-badge badge-blue">
                  SIMULATION STUDIO
                </span>
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                Microclimate Stress Engine
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Stress-test the ML rain risk model, FAO-56 Penman-Monteith ET₀ engine, and automated QC rules.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-black/5 text-sm font-semibold text-slate-600 transition hover:bg-black/10 hover:text-slate-900"
            >
              ✕
            </button>
          </div>

          {/* Active status indicator */}
          {state.isSimulated && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>
                  Currently Broadcasting Simulation: <strong>{state.simulatedScenario}</strong>
                </span>
              </div>
              <button
                onClick={handleReset}
                className="rounded-md bg-amber-500/20 px-3 py-1 font-semibold text-amber-900 transition hover:bg-amber-500/30"
              >
                Reset to Live Telemetry
              </button>
            </div>
          )}

          {/* Preset Buttons (Disciplined 10px radius) */}
          <div className="mt-6">
            <label className="apple-subhead">
              Select Preset Scenario
            </label>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {PRESETS.map((p) => {
                const active = selectedPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePresetSelect(p.id)}
                    className="flex flex-col items-start p-3 text-left transition-all duration-150"
                    style={{
                      background: active ? "#ffffff" : "rgba(0, 0, 0, 0.03)",
                      border: `1.5px solid ${active ? p.color : "rgba(0, 0, 0, 0.08)"}`,
                      borderRadius: 10,
                      boxShadow: active ? "0 2px 8px rgba(0, 0, 0, 0.08)" : "none",
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-slate-900">{p.label}</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: p.color,
                          background: p.bg,
                          padding: "2px 5px",
                          borderRadius: 4,
                          border: `1px solid ${p.border}`,
                        }}
                      >
                        {p.tag}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-tight text-slate-500">{p.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sliders Grid */}
          <div className="mt-6 rounded-xl border border-black/5 bg-black/[0.02] p-5">
            <h4 className="apple-subhead mb-3">
              Fine-Tune Physical Parameter Sliders
            </h4>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {/* Temperature */}
              <div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Air Temperature</span>
                  <span className="text-amber-700 font-bold">{temp.toFixed(1)} °C</span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="48"
                  step="0.5"
                  value={temp}
                  onChange={(e) => setTemp(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-amber-600"
                />
              </div>

              {/* Relative Humidity */}
              <div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Relative Humidity</span>
                  <span className="text-sky-700 font-bold">{rh.toFixed(0)} %</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={rh}
                  onChange={(e) => setRh(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-sky-600"
                />
              </div>

              {/* Solar Radiation */}
              <div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Solar Radiation</span>
                  <span className="text-amber-700 font-bold">{solar} W/m²</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1200"
                  step="25"
                  value={solar}
                  onChange={(e) => setSolar(parseInt(e.target.value))}
                  className="mt-2 w-full accent-amber-600"
                />
              </div>

              {/* Wind Speed */}
              <div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Wind Speed</span>
                  <span className="text-teal-700 font-bold">{wind.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="0.2"
                  value={wind}
                  onChange={(e) => setWind(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-teal-600"
                />
              </div>

              {/* Rain Gauge 1 */}
              <div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Rain Gauge 1</span>
                  <span className="text-emerald-700 font-bold">{rain1.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={rain1}
                  onChange={(e) => setRain1(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-emerald-600"
                />
              </div>

              {/* Rain Gauge 2 */}
              <div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Rain Gauge 2 (Cross-Check)</span>
                  <span className="text-emerald-700 font-bold">{rain2.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={rain2}
                  onChange={(e) => setRain2(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={handleReset}
              className="rounded-lg border border-black/10 bg-black/5 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-black/10"
            >
              Reset to Live Telemetry
            </button>

            <button
              onClick={runSimulation}
              disabled={loading}
              className="rounded-lg bg-[#0071e3] px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0077ed] active:scale-95 disabled:opacity-50"
            >
              {loading ? "Computing Models..." : "Execute & Apply to Dashboard"}
            </button>
          </div>

          {/* Live Diagnostic Breakdown */}
          {simResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4"
            >
              <div className="flex items-center justify-between border-b border-emerald-500/15 pb-2.5">
                <span className="apple-subhead" style={{ color: "#248a3d" }}>
                  Physics & Decision Verification
                </span>
                <span className="apple-badge badge-green">
                  SYNCHRONIZED
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-lg border border-black/5 bg-white p-3">
                  <p className="text-[11px] font-semibold text-slate-500">FAO-56 ET₀</p>
                  <p className="text-lg font-bold text-sky-700">{simResult.et0_today_mm} mm</p>
                </div>
                <div className="rounded-lg border border-black/5 bg-white p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Water Balance</p>
                  <p
                    className="text-lg font-bold"
                    style={{ color: simResult.irrigation_required ? "#d70015" : "#248a3d" }}
                  >
                    {simResult.water_balance_mm} mm
                  </p>
                </div>
                <div className="rounded-lg border border-black/5 bg-white p-3">
                  <p className="text-[11px] font-semibold text-slate-500">WBGT Heat Level</p>
                  <p className="text-lg font-bold text-amber-700">{simResult.heat_level}</p>
                </div>
                <div className="rounded-lg border border-black/5 bg-white p-3">
                  <p className="text-[11px] font-semibold text-slate-500">3h Rain Prob.</p>
                  <p className="text-lg font-bold text-teal-700">
                    {Math.round(simResult.p_rain_3h * 100)}%
                  </p>
                </div>
              </div>

              {/* Advisories triggered */}
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700">
                  Advisories Triggered ({simResult.advisories.length}):
                </p>
                <div className="mt-2 space-y-1.5">
                  {simResult.advisories.map((a: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3.5 py-2 text-xs"
                    >
                      <span className="font-medium text-slate-800">{a.action}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {a.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
