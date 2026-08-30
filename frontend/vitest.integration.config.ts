import { defineConfig } from "vitest/config";
import { TEST_BACKEND_PORT } from "./src/integration/constants";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.integration.test.ts"],
    env: {
      VITE_API_URL: `http://localhost:${TEST_BACKEND_PORT}`,
    },
  },
});