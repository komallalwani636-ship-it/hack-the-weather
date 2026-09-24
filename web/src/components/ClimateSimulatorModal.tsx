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
    icon: "🌱",
    color: "#10b981",
    desc: "Standard mild Kenyan highland conditions with balanced moisture.",
  },
  {
    id: "storm",
    label: "Torrential Downpour",
    icon: "⛈️",
    color: "#38bdf8",
    desc: "89% 3h rain probability, high wind gust, operations warning fired.",
  },
  {
    id: "heatwave",
    label: "Extreme Heatwave",
    icon: "🔥",
    color: "#f97316",
    desc: "36.8°C with high humidity, WBGT High warning, peak solar radiation.",
  },
  {
    id: "drought",
    label: "Severe Soil Drought",
    icon: "🏜️",
    color: "#eab308",
    desc: "Soil water deficit -32.4 mm, urgent 38.9 mm irrigation advisory triggered.",
  },
  {
    id: "sensor_fault",
    label: "QC Anomaly (Cross-Fail)",
    icon: "⚠️",
    color: "#ef4444",
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
        scenario: selectedPreset,
        temp_c: temp,
        rh_pct: rh,
        solar_wm2: solar,
        wind_ms: wind,
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

      if (!res.ok) throw new Error("Simulation failed");
      const data = await res.json();
      setSimResult(data);
      applySimulation(data);
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
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-700/60 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl md:p-8"
          style={{
            boxShadow: "0 0 50px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-sm text-emerald-400">
                  🧪
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                  What-If Simulation Studio
                </span>
              </div>
              <h2 className="mt-1 text-2xl font-bold text-white md:text-3xl">
                Microclimate Stress Engine
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Stress-test the ML rain classifier, FAO-56 Penman-Monteith ET₀ model, and automated QC rules in real time.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Active status indicator */}
          {state.isSimulated && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" />
                <span>
                  Currently Broadcasting Simulation: <strong>{state.simulatedScenario}</strong>
                </span>
              </div>
              <button
                onClick={handleReset}
                className="rounded-lg bg-amber-500/20 px-3 py-1 font-semibold text-amber-200 transition hover:bg-amber-500/30"
              >
                Reset to Live Telemetry
              </button>
            </div>
          )}

          {/* Preset Buttons */}
          <div className="mt-6">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Select Preset Scenario:
            </label>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {PRESETS.map((p) => {
                const active = selectedPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePresetSelect(p.id)}
                    className="flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all duration-200"
                    style={{
                      background: active ? `${p.color}18` : "rgba(255, 255, 255, 0.03)",
                      borderColor: active ? p.color : "rgba(255, 255, 255, 0.08)",
                      boxShadow: active ? `0 0 16px ${p.color}30` : "none",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{p.icon}</span>
                      <span className="text-xs font-bold text-slate-200">{p.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-tight text-slate-400">{p.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Sliders Grid */}
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Fine-Tune Physical Parameter Sliders:
            </h4>
            <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {/* Temperature */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Air Temperature</span>
                  <span className="font-bold text-amber-400">{temp.toFixed(1)} °C</span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="48"
                  step="0.5"
                  value={temp}
                  onChange={(e) => setTemp(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-amber-400"
                />
              </div>

              {/* Relative Humidity */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Relative Humidity</span>
                  <span className="font-bold text-sky-400">{rh.toFixed(0)} %</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={rh}
                  onChange={(e) => setRh(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-sky-400"
                />
              </div>

              {/* Solar Radiation */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Solar Radiation</span>
                  <span className="font-bold text-yellow-400">{solar} W/m²</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1200"
                  step="25"
                  value={solar}
                  onChange={(e) => setSolar(parseInt(e.target.value))}
                  className="mt-2 w-full accent-yellow-400"
                />
              </div>

              {/* Wind Speed */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Wind Speed</span>
                  <span className="font-bold text-teal-400">{wind.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="0.2"
                  value={wind}
                  onChange={(e) => setWind(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-teal-400"
                />
              </div>

              {/* Rain Gauge 1 */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Rain Gauge 1</span>
                  <span className="font-bold text-emerald-400">{rain1.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={rain1}
                  onChange={(e) => setRain1(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-emerald-400"
                />
              </div>

              {/* Rain Gauge 2 */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Rain Gauge 2 (Cross-Check)</span>
                  <span className="font-bold text-emerald-400">{rain2.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={rain2}
                  onChange={(e) => setRain2(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-emerald-400"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={handleReset}
              className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
            >
              Reset to Live Telemetry
            </button>

            <button
              onClick={runSimulation}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <span>Computing Models...</span>
              ) : (
                <>
                  <span>🚀 Execute & Apply to Dashboard</span>
                </>
              )}
            </button>
          </div>

          {/* Live Engine Diagnostic Breakdown */}
          {simResult && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5"
            >
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  ⚡ Physics & Decision Engine Verification
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  SYNCHRONIZED
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-900/60 p-3">
                  <p className="text-[10px] text-slate-400">FAO-56 ET₀</p>
                  <p className="text-lg font-bold text-sky-400">{simResult.et0_today_mm} mm</p>
                </div>
                <div className="rounded-xl bg-slate-900/60 p-3">
                  <p className="text-[10px] text-slate-400">Water Balance</p>
                  <p
                    className="text-lg font-bold"
                    style={{ color: simResult.irrigation_required ? "#ef4444" : "#10b981" }}
                  >
                    {simResult.water_balance_mm} mm
                  </p>
                </div>
                <div className="rounded-xl bg-slate-900/60 p-3">
                  <p className="text-[10px] text-slate-400">WBGT Heat Level</p>
                  <p className="text-lg font-bold text-amber-400">{simResult.heat_level}</p>
                </div>
                <div className="rounded-xl bg-slate-900/60 p-3">
                  <p className="text-[10px] text-slate-400">3h Rain Prob.</p>
                  <p className="text-lg font-bold text-teal-400">
                    {Math.round(simResult.p_rain_3h * 100)}%
                  </p>
                </div>
              </div>

              {/* Advisories triggered */}
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-300">
                  Advisories Triggered ({simResult.advisories.length}):
                </p>
                <div className="mt-2 space-y-2">
                  {simResult.advisories.map((a: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/80 px-4 py-2 text-xs"
                    >
                      <span className="font-medium text-slate-200">{a.action}</span>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">
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
