import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react() as never, tailwindcss() as never],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The keyset list endpoint's wire contract, shared with the API so the
      // page-limit cap has one source of truth (#143).
      "@contract": path.resolve(__dirname, "../api/src/list-contract.ts"),
    },
  },
  server: {
    open: true,
    proxy: {
      "/api": "http://localhost:3101",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
