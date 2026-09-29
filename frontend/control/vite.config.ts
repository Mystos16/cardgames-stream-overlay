import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  base: "/control/",
  plugins: [svelte()],
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
