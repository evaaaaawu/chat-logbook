import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/*.e2e.test.ts"],
  },
});
