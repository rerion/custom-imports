import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "vitest";
import {
    assertShadowMatchesExpected,
    cleanupFixtureInput,
    discoverFixtures,
    writeExpected,
} from "./runner.js";

const fixturesRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures",
);

const fixtures = await discoverFixtures(fixturesRoot);
const updateExpected = process.env.UPDATE_EXPECTED === "1";

for (const fixture of fixtures) {
    describe.concurrent(`build/${fixture.name}`, () => {
        afterEach(async () => {
            await cleanupFixtureInput(fixture.inputDir);
        });

        it(
            updateExpected
                ? "updates expected shadow output"
                : "matches expected shadow output",
            async ({ signal }) => {
                if (updateExpected) {
                    await writeExpected(fixture, signal);
                    return;
                }

                await assertShadowMatchesExpected(fixture, signal);
            },
        );
    });
}
