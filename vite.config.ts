import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_WORKSPACE, workspaceMiddleware } from "./server/workspace.mjs";
import { attachKernel } from "./server/kernel.mjs";

// Dev server only for now. The MX launcher (bin/squero-mx) serves dist/ with the same workspace
// API and kernel bridge. dedupe: @paperboat/shared is a linked sibling with its own
// node_modules; keep one React and one three.

function mxServer(): Plugin {
  return {
    name: "mx-server",
    configureServer(server) {
      server.middlewares.use("/__mx/workspace", workspaceMiddleware(DEFAULT_WORKSPACE));
      if (server.httpServer) attachKernel(server.httpServer, { workspace: DEFAULT_WORKSPACE });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/__mx/workspace", workspaceMiddleware(DEFAULT_WORKSPACE));
      if (server.httpServer) attachKernel(server.httpServer, { workspace: DEFAULT_WORKSPACE });
    },
  };
}

export default defineConfig({
  plugins: [react(), mxServer()],
  resolve: { dedupe: ["react", "react-dom", "three"] },
  build: { chunkSizeWarningLimit: 900 },
  server: { port: 3049, fs: { allow: [".."] } },
  preview: { port: 3049 },
});
