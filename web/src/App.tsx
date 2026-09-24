import { AnimatePresence, motion } from "framer-motion";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { NavigationBar } from "./components/NavigationBar";
import { useApp } from "./context/AppContext";
import { AlertsFeed } from "./pages/AlertsFeed";
import { AskSentinel } from "./pages/AskSentinel";
import { HowItWorks } from "./pages/HowItWorks";
import { IrrigationPlanner } from "./pages/IrrigationPlanner";
import { LiveStation } from "./pages/LiveStation";
import { MapView } from "./pages/MapView";

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
  exit:    { opacity: 0,       transition: { duration: 0.12 } },
};

export default function App() {
  const { state, resetSimulation } = useApp();
  const location = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a" }}>
      <NavigationBar />

      {/* Simulation banner */}
      <AnimatePresence>
        {state.isSimulated && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                background: "#140f00",
                borderBottom: "1px solid rgba(245,158,11,0.2)",
                padding: "8px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                maxWidth: "none",
              }}
            >
              <span style={{ fontSize: 12, color: "#f59e0b" }}>
                <strong>Simulation mode</strong> — {state.simulatedScenario}. Data shown is synthetic.
              </span>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 12px", fontSize: 11 }}
                onClick={resetSimulation}
              >
                Exit simulation
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline banner */}
      {!state.apiAvailable && !state.isSimulated && (
        <div
          style={{
            background: "#1a0a00",
            borderBottom: "1px solid rgba(239,68,68,0.2)",
            padding: "8px 24px",
            fontSize: 12,
            color: "#f87171",
            textAlign: "center",
          }}
        >
          Backend unavailable — showing cached data
        </div>
      )}

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Routes location={location}>
              <Route path="/"             element={<LiveStation />} />
              <Route path="/map"          element={<MapView />} />
              <Route path="/irrigation"   element={<IrrigationPlanner />} />
              <Route path="/alerts"       element={<AlertsFeed />} />
              <Route path="/ask"          element={<AskSentinel />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="*"             element={<Navigate to="/" />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
