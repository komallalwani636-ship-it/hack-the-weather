import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from "react";
import { API_URL, getJson } from "../api";

export type ThemeMode = "dark" | "light";

export interface LocationInfo {
  id: string;
  code: string;
  name: string;
  shortName: string;
  zone: string;
  county: string;
  lat: number;
  lon: number;
  elevation: string;
  soilType: string;
  primaryCrops: string;
  activeSensors: number;
  description: string;
  imageUrl: string;
  tempOffset: number;
  rhOffset: number;
  rainOffset: number;
}

export const LOCATIONS: LocationInfo[] = [
  {
    id: "jkuat_main",
    code: "AWS-01",
    name: "JKUAT Main Agro-Met Station",
    shortName: "JKUAT Juja",
    zone: "Research Farm Central",
    county: "Kiambu County",
    lat: -1.0982,
    lon: 37.0144,
    elevation: "1,530 m ASL",
    soilType: "Deep Nitisols (Humic Red Clay Loam)",
    primaryCrops: "Maize (H614), French Beans, Sorghum",
    activeSensors: 8,
    description: "Primary reference Automated Weather Station (AWS) at JKUAT University Farm. Real-time pyranometer, dual tipping bucket rain gauges, and aspirated psychrometer.",
    imageUrl: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=1200&q=80",
    tempOffset: 0.0,
    rhOffset: 0.0,
    rainOffset: 0.0,
  },
  {
    id: "juja_farm",
    code: "AWS-02",
    name: "Juja Farm Agro-Horticulture Outstation",
    shortName: "Juja East",
    zone: "Semi-Arid Lowland Basin",
    county: "Kiambu County",
    lat: -1.1150,
    lon: 37.1120,
    elevation: "1,485 m ASL",
    soilType: "Chromic Vertisols (Black Cotton Soil)",
    primaryCrops: "French Beans, Tomatoes, Watermelon, Onions",
    activeSensors: 7,
    description: "Commercial horticulture outpost with high wind exposure and higher evaporative demand. Critical for drip irrigation scheduling and frost watch.",
    imageUrl: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80",
    tempOffset: 1.4,
    rhOffset: -5.2,
    rainOffset: -0.05,
  },
  {
    id: "thika_agmet",
    code: "AWS-03",
    name: "Thika Agroforestry & Coffee Research Site",
    shortName: "Thika North",
    zone: "Highland Agroforestry Corridor",
    county: "Kiambu County",
    lat: -1.0330,
    lon: 37.0690,
    elevation: "1,550 m ASL",
    soilType: "Andosols (Volcanic Ash Loam)",
    primaryCrops: "Coffee (Ruiru 11/SL28), Macadamia, Avocados",
    activeSensors: 8,
    description: "Monitoring canopy microclimates for Coffee Berry Disease (CBD) and Leaf Rust risks driven by dew duration and relative humidity spikes.",
    imageUrl: "https://images.unsplash.com/photo-1524486361537-8ad15938e1a3?auto=format&fit=crop&w=1200&q=80",
    tempOffset: -0.8,
    rhOffset: 4.8,
    rainOffset: 0.12,
  },
  {
    id: "ruiru_basin",
    code: "AWS-04",
    name: "Ruiru Basin Irrigation & Wetland Station",
    shortName: "Ruiru South",
    zone: "Alluvial River Basin",
    county: "Kiambu County",
    lat: -1.1480,
    lon: 36.9600,
    elevation: "1,510 m ASL",
    soilType: "Pellic Vertisols (Heavy Alluvial Clay)",
    primaryCrops: "Vegetables, Kales (Sukuma Wiki), Cabbage, Fodder",
    activeSensors: 7,
    description: "Low-lying river basin prone to nocturnal temperature inversion and high soil moisture retention. Key for flood buffer early warnings.",
    imageUrl: "https://images.unsplash.com/photo-1628352081506-83c43123ed6d?auto=format&fit=crop&w=1200&q=80",
    tempOffset: -0.3,
    rhOffset: 6.5,
    rainOffset: 0.08,
  },
];

export interface AppState {
  observations: any | null;
  advisories: any[];
  forecast: any | null;
  rainRisk: any | null;
  irrigation: any | null;
  lastUpdatedUtc: string | null;
  apiAvailable: boolean;
  usingCachedData: boolean;
  pollIntervalMs: number;
  isSimulated: boolean;
  simulatedScenario: string | null;
  selectedLocationId: string;
  theme: ThemeMode;
}

const initial: AppState = {
  observations: null,
  advisories: [],
  forecast: null,
  rainRisk: null,
  irrigation: null,
  lastUpdatedUtc: null,
  apiAvailable: true,
  usingCachedData: false,
  pollIntervalMs: 60_000,
  isSimulated: false,
  simulatedScenario: null,
  selectedLocationId: "jkuat_main",
  theme: (localStorage.getItem("sentinel_theme") as ThemeMode) || "dark",
};

type Action =
  | { type: "snapshot"; payload: Partial<AppState> }
  | { type: "simulate"; payload: any }
  | { type: "reset_simulation" }
  | { type: "set_location"; payload: string }
  | { type: "set_theme"; payload: ThemeMode };

function reducer(state: AppState, action: Action): AppState {
  if (action.type === "snapshot") {
    if (state.isSimulated) {
      return state;
    }
    return { ...state, ...action.payload };
  }
  if (action.type === "set_location") {
    return { ...state, selectedLocationId: action.payload };
  }
  if (action.type === "set_theme") {
    localStorage.setItem("sentinel_theme", action.payload);
    return { ...state, theme: action.payload };
  }
  if (action.type === "simulate") {
    const sim = action.payload;
    return {
      ...state,
      isSimulated: true,
      simulatedScenario: sim.label || sim.scenario,
      lastUpdatedUtc: sim.timestamp_utc,
      observations: {
        timestamp_utc: sim.timestamp_utc,
        data_source: `Simulation (${sim.label || sim.scenario})`,
        sensors: sim.sensors,
        history: state.observations?.history || {},
      },
      advisories: sim.advisories || [],
      rainRisk: {
        p_rain_3h: sim.p_rain_3h,
        p_rain_24h: sim.p_rain_24h,
        feature_timestamp_utc: sim.timestamp_utc,
      },
      irrigation: {
        et0_today_mm: sim.et0_today_mm,
        water_balance_mm: sim.water_balance_mm,
        irrigation_required: sim.irrigation_required,
        irrigation_amount_mm: sim.irrigation_amount_mm,
        irrigation_action: sim.irrigation_action,
        kc: sim.kc,
        crop: "maize",
        stage: "mid",
        plan_mm: [sim.irrigation_amount_mm / 7 || 0.5, sim.irrigation_amount_mm / 7 || 0.5, 0, 0, 0, 0, 0],
      },
    };
  }
  if (action.type === "reset_simulation") {
    return { ...state, isSimulated: false, simulatedScenario: null };
  }
  return state;
}

interface AppContextValue {
  state: AppState;
  currentLocation: LocationInfo;
  setLocation: (locationId: string) => void;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  refresh: () => Promise<void>;
  applySimulation: (simData: any) => void;
  resetSimulation: () => void;
}

const Ctx = createContext<AppContextValue>({
  state: initial,
  currentLocation: LOCATIONS[0],
  setLocation: () => undefined,
  toggleTheme: () => undefined,
  setTheme: () => undefined,
  refresh: async () => undefined,
  applySimulation: () => undefined,
  resetSimulation: () => undefined,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, loadCache() ?? initial);

  const currentLocation = LOCATIONS.find((l) => l.id === state.selectedLocationId) || LOCATIONS[0];

  useEffect(() => {
    // Apply theme attribute and class to html root
    if (state.theme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, [state.theme]);

  async function fetchAll() {
    try {
      const results = await Promise.allSettled([
        getJson<any>("/observations/latest"),
        getJson<any>("/advisories"),
        getJson<any>("/forecast"),
        getJson<any>("/risk/rain"),
        getJson<any>("/irrigation"),
        getJson<any>("/health"),
      ]);

      const observations = results[0].status === "fulfilled" ? results[0].value : state.observations;
      const advisories = results[1].status === "fulfilled" ? results[1].value : (state.advisories || []);
      const forecast = results[2].status === "fulfilled" ? results[2].value : state.forecast;
      const rainRisk = results[3].status === "fulfilled" ? results[3].value : state.rainRisk;
      const irrigation = results[4].status === "fulfilled" ? results[4].value : state.irrigation;
      const health = results[5].status === "fulfilled" ? results[5].value : null;

      const anySuccess = results.some((r) => r.status === "fulfilled");

      const snapshot: Partial<AppState> = {
        observations,
        advisories,
        forecast,
        rainRisk,
        irrigation,
        lastUpdatedUtc: health?.data_last_updated_utc || observations?.timestamp_utc || new Date().toISOString(),
        apiAvailable: anySuccess,
        usingCachedData: Boolean(forecast?.using_cached_forecast),
        pollIntervalMs: 60_000,
      };

      if (anySuccess) {
        localStorage.setItem("sentinel-cache", JSON.stringify({ ...state, ...snapshot, cachedAt: Date.now() }));
      }
      dispatch({ type: "snapshot", payload: snapshot });
    } catch {
      const cached = loadCache();
      dispatch({
        type: "snapshot",
        payload: {
          apiAvailable: false,
          usingCachedData: true,
          ...(cached ?? {}),
          lastUpdatedUtc: cached?.lastUpdatedUtc ?? null,
        },
      });
    }
  }

  const setLocation = (locationId: string) => {
    dispatch({ type: "set_location", payload: locationId });
  };

  const setTheme = (theme: ThemeMode) => {
    dispatch({ type: "set_theme", payload: theme });
  };

  const toggleTheme = () => {
    const nextTheme: ThemeMode = state.theme === "dark" ? "light" : "dark";
    dispatch({ type: "set_theme", payload: nextTheme });
  };

  const applySimulation = (simData: any) => {
    dispatch({ type: "simulate", payload: simData });
  };

  const resetSimulation = () => {
    dispatch({ type: "reset_simulation" });
    fetchAll();
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => {
      if (!state.isSimulated) {
        fetchAll();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [state.isSimulated]);

  return (
    <Ctx.Provider
      value={{
        state,
        currentLocation,
        setLocation,
        toggleTheme,
        setTheme,
        refresh: fetchAll,
        applySimulation,
        resetSimulation,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

function loadCache(): (AppState & { cachedAt?: number }) | null {
  try {
    return JSON.parse(localStorage.getItem("sentinel-cache") || "null");
  } catch {
    return null;
  }
}

export function useApp() {
  return useContext(Ctx);
}

export function isStale(state: AppState) {
  if (state.isSimulated) return false;
  if (!state.apiAvailable) return true;
  if (!state.lastUpdatedUtc) return false;
  return Date.now() - new Date(state.lastUpdatedUtc).getTime() > 24 * 3600 * 1000;
}

void API_URL;
