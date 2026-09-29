import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{shared,games,connectors,backend}/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 60_000,
  },
});
