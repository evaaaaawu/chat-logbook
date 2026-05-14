import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    include: ["**/*.e2e.test.ts"],
    testTimeout: 10000,
  },
});
