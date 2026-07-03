import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: "unit",
                    environment: "node",
                    setupFiles: ["./tests/setup.ts"],
                    include: ["tests/unit/**/*.test.ts"],
                },
            },
            {
                test: {
                    name: "integration",
                    environment: "node",
                    include: ["tests/integration/**/*.test.ts"],
                },
            },
        ],
    },
});
