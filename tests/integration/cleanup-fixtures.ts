import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupAllFixtures } from "./runner.js";

const fixturesRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures",
);

await cleanupAllFixtures(fixturesRoot);
