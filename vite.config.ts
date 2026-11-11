import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server only for now. The MX launcher (later) will serve dist/ and the kernel bridge.
// dedupe: @paperboat/shared is a linked sibling with its own node_modules; keep one React and one three.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom", "three"] },
  build: { chunkSizeWarningLimit: 900 },
  server: { port: 3049, fs: { allow: [".."] } },
  preview: { port: 3049 },
});
