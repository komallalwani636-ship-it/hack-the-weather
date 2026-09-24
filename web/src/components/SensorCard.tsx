import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatEat } from "../api";
import { QualityBadge } from "./QualityBadge";

const SENSOR_ICONS: Record<string, string> = {
  "Air temperature": "🌡️",
  Humidity: "💧",
  Pressure: "🔵",
  "Rain gauge 1": "🌧️",
  "Rain gauge 2": "🌧️",
  Wind: "💨",
  WBGT: "☀️",
  "Solar index": "⚡",
};

const SENSOR_COLORS: Record<string, string> = {
  "Air temperature": "#f97316",
  Humidity: "#60a5fa",
  Pressure: "#a78bfa",
  "Rain gauge 1": "#34d399",
  "Rain gauge 2": "#34d399",
  Wind: "#fbbf24",
  WBGT: "#fb923c",
  "Solar index": "#facc15",
};

export function SensorCard({
  name,
  value,
  unit,
  flag,
  series,
  updated,
  index = 0,
}: {
  name: string;
  value: number | null;
  unit: string;
  flag: string;
  series: { t: string; v: number }[];
  updated?: string;
  index?: number;
}) {
  const color = SENSOR_COLORS[name] || "#34d399";
  const icon = SENSOR_ICONS[name] || "📊";
  const isOk = flag === "OK";

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="card-hover relative overflow-hidden rounded-2xl p-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: isOk
          ? `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`
          : `0 4px 24px rgba(239,68,68,0.1)`,
      }}
    >
      {/* Background glow based on value range */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-20"
        style={{
          background: `radial-gradient(ellipse at top right, ${color}20, transparent 70%)`,
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h3 className="text-sm font-medium text-slate-300">{name}</h3>
          </div>
          <QualityBadge flag={flag} />
        </div>

        <div className="mt-3 flex items-baseline gap-1.5">
          <motion.span
            key={value}
            initial={{ scale: 1.1, color }}
            animate={{ scale: 1, color: "#f1f5f9" }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold tabular-nums text-slate-100"
          >
            {value == null ? "—" : value.toFixed(1)}
          </motion.span>
          <span className="text-sm font-medium" style={{ color }}>{unit}</span>
        </div>

        {/* Sparkline */}
        <div className="mt-3 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <defs>
                <linearGradient id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{
                  background: "rgba(2,8,18,0.9)",
                  border: `1px solid ${color}40`,
                  borderRadius: "8px",
                  color: "#e2e8f0",
                  fontSize: "11px",
                }}
                formatter={(v: number) => [`${v.toFixed(2)} ${unit}`, name]}
                labelFormatter={() => ""}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#grad-${name})`}
                dot={false}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 text-[10px] text-slate-600">{formatEat(updated)}</p>
      </div>
    </motion.article>
  );
}
