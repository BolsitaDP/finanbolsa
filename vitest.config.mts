import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // "node", not "jsdom": everything under test here is pure logic (balance
    // arithmetic, recurring detection) with no DOM. Reaching for jsdom would
    // only slow the suite down and imply component coverage that doesn't exist.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
