import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ClimateSimulatorModal } from "./components/ClimateSimulatorModal";
import { NavigationBar } from "./components/NavigationBar";
import { useApp } from "./context/AppContext";
import { AlertsFeed } from "./pages/AlertsFeed";
import { AskSentinel } from "./pages/AskSentinel";
import { FarmerDispatch } from "./pages/FarmerDispatch";
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
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", color: "#1d1d1f" }}>
      <NavigationBar onOpenSimulator={() => setSimulatorOpen(true)} />
      <ClimateSimulatorModal isOpen={simulatorOpen} onClose={() => setSimulatorOpen(false)} />

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
                background: "rgba(255, 159, 10, 0.12)",
                backdropFilter: "blur(16px)",
                borderBottom: "1px solid rgba(255, 159, 10, 0.25)",
                padding: "8px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                maxWidth: "none",
              }}
            >
              <span style={{ fontSize: 12, color: "#b25e02", fontWeight: 600 }}>
                <strong>SIMULATION ACTIVE</strong> — {state.simulatedScenario}. Synthetic telemetry broadcast for stress testing.
              </span>
              <button
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  background: "#1d1d1f",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={resetSimulation}
              >
                Exit Simulation
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline banner */}
      {!state.apiAvailable && !state.isSimulated && (
        <div
          style={{
            background: "rgba(255, 59, 48, 0.08)",
            backdropFilter: "blur(16px)",
            borderBottom: "1px solid rgba(255, 59, 48, 0.2)",
            padding: "8px 24px",
            fontSize: 12,
            fontWeight: 600,
            color: "#d70015",
            textAlign: "center",
          }}
        >
          Backend offline at 127.0.0.1:8000 — displaying cached observations
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
              <Route path="/dispatch"     element={<FarmerDispatch />} />
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
