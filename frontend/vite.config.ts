import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/setupTests.ts"],
		exclude: ["**/node_modules/**", "**/*.integration.test.ts"]
	},
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				changeOrigin: true,
				// Keep the /api prefix so backend routes like /api/upload continue to match.
				// Vite will forward /api/upload to http://localhost:3000/api/upload.
			}
		}
	}
});
