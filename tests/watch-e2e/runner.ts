import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assertShadows } from "../build-e2e/runner.js";

const CONFIG_FILE = "custom-imports.config.ts";
const SHADOW_DIR = ".shadow";

const cliPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../dist/cli.js",
);

export interface WatchScenario {
    name: string;
    outputDir: string;
    action: (inputDir: string) => Promise<void>;
    updatePattern?: RegExp;
    expectNoUpdate?: boolean;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createRunDirectory(sourceInputDir: string): Promise<string> {
    const runDir = await mkdtemp(join(tmpdir(), "custom-imports-watch-"));
    await cp(sourceInputDir, runDir, { recursive: true });
    return runDir;
}

async function waitForPattern(
    getOutput: () => string,
    pattern: RegExp,
    timeoutMs: number,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (pattern.test(getOutput())) {
            return;
        }

        await sleep(20);
    }

    throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${pattern}. Output so far:\n${getOutput()}`,
    );
}

function waitForExit(child: ChildProcess): Promise<number | null> {
    return new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code));
    });
}

async function stopWatch(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    child.kill("SIGTERM");

    const exited = await Promise.race([
        waitForExit(child).then(() => true),
        sleep(2_000).then(() => false),
    ]);

    if (!exited && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await waitForExit(child);
    }
}

async function runWatchInDirectory(
    runDir: string,
    scenario: WatchScenario,
    signal: AbortSignal,
): Promise<string> {
    const configPath = join(runDir, CONFIG_FILE);
    const shadowDir = join(runDir, SHADOW_DIR);

    const child = spawn(
        process.execPath,
        [cliPath, "--config", configPath, "--watch"],
        {
            cwd: runDir,
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
    });

    const getStdout = (): string =>
        Buffer.concat(stdoutChunks).toString("utf8");

    const onAbort = (): void => {
        void stopWatch(child);
    };

    if (signal.aborted) {
        onAbort();
        throw signal.reason;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    try {
        await waitForPattern(getStdout, /watching /, 10_000);
        const stdoutBeforeAction = getStdout().length;

        await scenario.action(runDir);

        if (scenario.expectNoUpdate) {
            await sleep(300);
            const outputAfterAction = getStdout().slice(stdoutBeforeAction);

            if (/update /.test(outputAfterAction)) {
                throw new Error(
                    `Expected no watch update, but received:\n${outputAfterAction}`,
                );
            }
        } else if (scenario.updatePattern) {
            await waitForPattern(
                () => getStdout().slice(stdoutBeforeAction),
                scenario.updatePattern,
                10_000,
            );
        } else {
            throw new Error(
                `Scenario "${scenario.name}" must define updatePattern or expectNoUpdate`,
            );
        }

        await stopWatch(child);

        const exitCode = child.exitCode;
        if (exitCode !== null && exitCode !== 0 && exitCode !== 143) {
            const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
            throw new Error(
                stderr || `custom-imports --watch exited with code ${exitCode}`,
            );
        }

        return shadowDir;
    } catch (error) {
        await stopWatch(child);
        throw error;
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}

export async function assertWatchScenario(
    sourceInputDir: string,
    scenario: WatchScenario,
    signal: AbortSignal,
): Promise<void> {
    const runDir = await createRunDirectory(sourceInputDir);

    try {
        const shadowDir = await runWatchInDirectory(runDir, scenario, signal);
        await assertShadows(
            {
                name: scenario.name,
                root: "",
                inputDir: runDir,
                outputDir: scenario.outputDir,
            },
            shadowDir,
        );
    } finally {
        await rm(runDir, { recursive: true, force: true });
    }
}

async function walkFiles(directory: string): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    const files: string[] = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...(await walkFiles(entryPath)));
            continue;
        }

        if (entry.isFile()) {
            files.push(entryPath);
        }
    }

    return files.sort();
}

function isTextFile(path: string): boolean {
    return !/\.(png|jpg|jpeg|gif|webp|ico)$/i.test(path);
}

async function readShadowFile(
    path: string,
    shadowDir: string,
): Promise<string | Buffer> {
    const { readFile } = await import("node:fs/promises");
    const { normalizeShadowContent } = await import("../build-e2e/runner.js");

    if (isTextFile(path)) {
        const content = await readFile(path, "utf8");
        return normalizeShadowContent(content, shadowDir);
    }

    return readFile(path);
}

export async function writeScenarioExpected(
    sourceInputDir: string,
    scenario: WatchScenario,
    signal: AbortSignal,
): Promise<void> {
    const runDir = await createRunDirectory(sourceInputDir);

    try {
        const shadowDir = await runWatchInDirectory(runDir, scenario, signal);

        await rm(scenario.outputDir, { recursive: true, force: true });

        for (const filePath of await walkFiles(shadowDir)) {
            const relativePath = relative(shadowDir, filePath);
            const outputPath = join(scenario.outputDir, relativePath);
            const content = await readShadowFile(filePath, shadowDir);

            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, content);
        }
    } finally {
        await rm(runDir, { recursive: true, force: true });
    }
}
