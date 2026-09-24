import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { motion } from "framer-motion";
import { Suspense } from "react";
import { formatEat } from "../api";
import { GlobeScene } from "../components/GlobeScene";
import { SensorCard } from "../components/SensorCard";
import { isStale, useApp } from "../context/AppContext";

const META: Record<string, { label: string; unit: string }> = {
  temp_sht_c: { label: "Air temperature", unit: "°C" },
  humidity_sht_pct: { label: "Humidity", unit: "%" },
  pressure_hpa: { label: "Pressure", unit: "hPa" },
  rain_gauge_1_mm: { label: "Rain gauge 1", unit: "mm" },
  rain_gauge_2_mm: { label: "Rain gauge 2", unit: "mm" },
  wind_speed_ms: { label: "Wind", unit: "m/s" },
  wbgt_c: { label: "WBGT", unit: "°C" },
  si1145_visible: { label: "Solar index", unit: "" },
};

function StatChip({
  label,
  value,
  color = "#34d399",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-center"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

export function LiveStationPanel() {
  const { state } = useApp();
  const sensors = state.observations?.sensors || {};
  const rain = state.rainRisk;
  const stale = !state.apiAvailable || isStale(state);

  const rainPct3h = rain?.p_rain_3h != null ? `${Math.round(rain.p_rain_3h * 100)}%` : "—";
  const rainPct24h = rain?.p_rain_24h != null ? `${Math.round(rain.p_rain_24h * 100)}%` : "—";
  const rainColor3h =
    rain?.p_rain_3h != null
      ? rain.p_rain_3h > 0.7
        ? "#ef4444"
        : rain.p_rain_3h > 0.4
        ? "#fbbf24"
        : "#34d399"
      : "#94a3b8";

  return (
    <div className="relative min-h-screen">
      {/* Hero section with 3D globe */}
      <div className="relative flex flex-col items-center overflow-hidden pb-8 pt-6 md:flex-row md:gap-8">
        {/* Globe */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative h-64 w-64 shrink-0 md:h-80 md:w-80"
        >
          <Canvas camera={{ position: [0, 0, 2.5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
            <Suspense fallback={null}>
              <GlobeScene
                hasRain={(rain?.p_rain_3h ?? 0) > 0.5}
                hasHeat={(sensors?.wbgt_c?.value ?? 0) > 32}
              />
              <OrbitControls
                enableZoom={false}
                enablePan={false}
                autoRotate={false}
                minPolarAngle={Math.PI / 4}
                maxPolarAngle={(3 * Math.PI) / 4}
              />
            </Suspense>
          </Canvas>
          {/* Glow ring under globe */}
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 h-8 w-48 -translate-x-1/2 rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(52,211,153,0.2), transparent 70%)" }}
          />
        </motion.div>

        {/* Header info */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex flex-col gap-4"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/70">
              JKUAT Conduit Weather Station
            </p>
            <h2 className="text-gradient text-3xl font-bold md:text-4xl">Live Station</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatEat(state.observations?.timestamp_utc)} · {stale ? "⚠️ Cached" : "🟢 Real-time"}
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatChip label="Rain 3h" value={rainPct3h} color={rainColor3h} />
            <StatChip label="Rain 24h" value={rainPct24h} />
            <StatChip
              label="ET₀ Today"
              value={
                state.irrigation?.et0_today_mm != null
                  ? `${state.irrigation.et0_today_mm.toFixed(1)} mm`
                  : "—"
              }
              color="#60a5fa"
            />
            <StatChip
              label="Sensors"
              value={`${Object.values(sensors).filter((s: any) => s.qc_flag === "OK").length}/${Object.keys(META).length} OK`}
              color="#a78bfa"
            />
          </div>

          {/* Advisory banner if active */}
          {state.advisories.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl p-3"
              style={{
                background: "rgba(251,191,36,0.1)",
                border: "1px solid rgba(251,191,36,0.3)",
                boxShadow: "0 0 20px rgba(251,191,36,0.1)",
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                ⚠️ Active Advisory
              </p>
              <p className="mt-0.5 text-sm text-amber-200">
                {state.advisories[0].action}
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Sensor grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {Object.entries(META).map(([key, meta], idx) => {
          const reading = sensors[key] || { value: null, qc_flag: "MISSING" };
          return (
            <SensorCard
              key={key}
              name={meta.label}
              unit={meta.unit}
              value={reading.value}
              flag={reading.qc_flag}
              updated={state.observations?.timestamp_utc}
              series={state.observations?.history?.[key] || [{ t: "now", v: reading.value ?? 0 }]}
              index={idx}
            />
          );
        })}
      </motion.div>
    </div>
  );
}
