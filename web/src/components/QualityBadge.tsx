const MAP: Record<string, { bg: string; text: string; glow: string }> = {
  OK: { bg: "rgba(52,211,153,0.15)", text: "#34d399", glow: "0 0 8px rgba(52,211,153,0.3)" },
  SPIKE: { bg: "rgba(251,191,36,0.15)", text: "#fbbf24", glow: "0 0 8px rgba(251,191,36,0.3)" },
  FLATLINE: { bg: "rgba(251,191,36,0.15)", text: "#fbbf24", glow: "0 0 8px rgba(251,191,36,0.3)" },
  RANGE_FAIL: { bg: "rgba(249,115,22,0.15)", text: "#f97316", glow: "0 0 8px rgba(249,115,22,0.3)" },
  CROSS_FAIL: { bg: "rgba(249,115,22,0.15)", text: "#f97316", glow: "0 0 8px rgba(249,115,22,0.3)" },
  MISSING: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", glow: "0 0 8px rgba(239,68,68,0.3)" },
};

export function QualityBadge({ flag }: { flag: string }) {
  const style = MAP[flag] || { bg: "rgba(148,163,184,0.15)", text: "#94a3b8", glow: "none" };
  return (
    <span
      style={{
        background: style.bg,
        color: style.text,
        boxShadow: style.glow,
        border: `1px solid ${style.text}30`,
      }}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
    >
      <span className="sr-only">Data quality: </span>
      {flag}
    </span>
  );
}
