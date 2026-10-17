import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  // ECharts lives in the lazily loaded project chunk; ~260 kB gzipped is expected.
  build: { chunkSizeWarningLimit: 900 },
});
