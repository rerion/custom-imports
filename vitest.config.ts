import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        sequence: {
            concurrent: false,
        },
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
                    name: "build-e2e",
                    environment: "node",
                    include: ["tests/build-e2e/**/*.test.ts"],
                },
            },
            {
                test: {
                    name: "watch-e2e",
                    environment: "node",
                    include: ["tests/watch-e2e/**/*.test.ts"],
                },
            },
        ],
    },
});
