import { defineConfig } from "vitest/config";
import { TEST_BACKEND_PORT } from "./src/integration/constants.ts";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.integration.test.ts"],
    env: {
      VITE_API_URL: `http://localhost:${TEST_BACKEND_PORT}`,
    },
    globalSetup: ["./src/integration/globalSetup.ts"],
    setupFiles: ["./src/integration/setupFetchEnvironment.ts"],
  },
});