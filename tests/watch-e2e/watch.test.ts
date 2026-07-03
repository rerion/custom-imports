import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { createScenarios } from "./scenarios.js";
import { assertWatchScenario, writeScenarioExpected } from "./runner.js";

const fixturesRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures",
);

const sourceInputDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../build-e2e/fixtures/project/input",
);

const scenarios = createScenarios(
    join(fixturesRoot, "project", "scenarios"),
);
const updateExpected = process.env.UPDATE_EXPECTED === "1";

describe("watch-e2e/project", () => {
    for (const scenario of scenarios) {
        it(
            updateExpected
                ? `updates expected output for ${scenario.name}`
                : scenario.name,
            async ({ signal }) => {
                if (updateExpected) {
                    await writeScenarioExpected(
                        sourceInputDir,
                        scenario,
                        signal,
                    );
                    return;
                }

                await assertWatchScenario(sourceInputDir, scenario, signal);
            },
            15_000,
        );
    }
});
