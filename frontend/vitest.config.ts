import path from "node:path";
import solidPlugin from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solidPlugin({ solid: { generate: "dom", hydratable: false } })],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/index.tsx", "src/setupTests.ts"],
      thresholds: {
        lines: 100,
        functions: 99,
        branches: 100,
        statements: 100,
      },
    },
    server: {
      deps: {
        inline: [/solid-js/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    conditions: ["development", "browser"],
  },
});
