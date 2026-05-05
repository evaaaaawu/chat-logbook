import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/metadata/schema.ts",
  out: "./drizzle",
});
