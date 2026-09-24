export function formatEat(iso?: string | null): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatted} (EAT)`;
}

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function getJson<T>(path: string): Promise<T> {
  const demo = new URLSearchParams(window.location.search).has("demo");
  const response = await fetch(`${API_URL}${path}`, {
    headers: demo ? { "X-Demo-Mode": "1" } : undefined,
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}
