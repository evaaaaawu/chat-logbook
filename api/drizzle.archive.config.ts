import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/archive/schema.ts",
  out: "./drizzle/archive",
});
