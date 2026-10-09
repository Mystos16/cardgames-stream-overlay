import { resolve } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [svelte()],
  build: {
    rollupOptions: {
      input: {
        control: resolve(import.meta.dirname, "control/index.html"),
        overlay: resolve(import.meta.dirname, "overlay/index.html"),
      },
    },
  },
  server: {
    port: 5173,
    host: process.env.VITE_HOST ?? "127.0.0.1",
    proxy: {
      "/api": backend,
      "/images": backend,
      "/ws": { target: backend.replace(/^http/, "ws"), ws: true },
    },
  },
});
