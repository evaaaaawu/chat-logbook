import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/checkpoint/schema.ts",
  out: "./drizzle/checkpoint",
});
