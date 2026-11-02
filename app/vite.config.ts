import { defineConfig } from "vite";

/** `VITE_BASE=/krill/` builds for GitHub Pages; everything else serves from `/`. */
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
