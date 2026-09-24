import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          "three-vendor": ["three", "@react-three/fiber", "@react-three/drei"],
          "charts-vendor": ["recharts"],
          "motion-vendor": ["framer-motion", "gsap"],
          "map-vendor": ["leaflet", "react-leaflet"],
        },
      },
    },
  },
});
