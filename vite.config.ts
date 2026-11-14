import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_WORKSPACE, workspaceMiddleware } from "./server/workspace.mjs";
import { attachKernel } from "./server/kernel.mjs";
import { optimizeMiddleware } from "./server/optimize.mjs";
import { juliaMiddleware } from "./server/julia.mjs";
import { backendsMiddleware } from "./server/backends.mjs";
import { configMiddleware } from "./server/config.mjs";

// Dev server only for now. The MX launcher (bin/squero-mx) serves dist/ with the same workspace
// API and kernel bridge. dedupe: @paperboat/shared is a linked sibling with its own
// node_modules; keep one React and one three.

function mxServer(): Plugin {
  return {
    name: "mx-server",
    configureServer(server) {
      server.middlewares.use("/__mx/workspace", workspaceMiddleware(DEFAULT_WORKSPACE));
      server.middlewares.use("/__mx/julia", juliaMiddleware({ workspace: DEFAULT_WORKSPACE }));
      server.middlewares.use("/__mx/backends", backendsMiddleware());
      server.middlewares.use("/__mx/config", configMiddleware());
      server.middlewares.use(optimizeMiddleware());
      if (server.httpServer) attachKernel(server.httpServer, { workspace: DEFAULT_WORKSPACE });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/__mx/workspace", workspaceMiddleware(DEFAULT_WORKSPACE));
      server.middlewares.use("/__mx/julia", juliaMiddleware({ workspace: DEFAULT_WORKSPACE }));
      server.middlewares.use("/__mx/backends", backendsMiddleware());
      server.middlewares.use("/__mx/config", configMiddleware());
      server.middlewares.use(optimizeMiddleware());
      if (server.httpServer) attachKernel(server.httpServer, { workspace: DEFAULT_WORKSPACE });
    },
  };
}

export default defineConfig({
  plugins: [react(), mxServer()],
  resolve: {
    dedupe: [
      "react", "react-dom", "three", "uplot",
      // The shared editor is CodeMirror too: one copy of each, or its extensions do not match.
      "@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/commands",
      "@codemirror/autocomplete", "@codemirror/lint", "@codemirror/merge", "@lezer/highlight",
    ],
  },
  build: { chunkSizeWarningLimit: 900 },
  server: { port: 3049, fs: { allow: [".."] } },
  preview: { port: 3049 },
});
