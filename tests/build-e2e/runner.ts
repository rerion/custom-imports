import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const INPUT_DIR = "input";
const OUTPUT_DIR = "output";
const SHADOW_DIR = ".shadow";
const CACHE_DIR = ".custom-imports";
const CONFIG_FILE = "custom-imports.config.ts";

const cliPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../dist/cli.js",
);

export interface BuildFixture {
    name: string;
    root: string;
    inputDir: string;
    outputDir: string;
}

export function normalizeShadowContent(
    content: string,
    shadowDir: string,
): string {
    return content.replaceAll(shadowDir, "<shadow>");
}

export async function discoverFixtures(
    fixturesRoot: string,
): Promise<BuildFixture[]> {
    const entries = await readdir(fixturesRoot, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
            name: entry.name,
            root: join(fixturesRoot, entry.name),
            inputDir: join(fixturesRoot, entry.name, INPUT_DIR),
            outputDir: join(fixturesRoot, entry.name, OUTPUT_DIR),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export async function cleanupFixtureInput(inputDir: string): Promise<void> {
    await rm(join(inputDir, SHADOW_DIR), { recursive: true, force: true });
    await rm(join(inputDir, CACHE_DIR), { recursive: true, force: true });
}

export async function cleanupAllFixtures(
    fixturesRoot: string,
): Promise<void> {
    for (const fixture of await discoverFixtures(fixturesRoot)) {
        await cleanupFixtureInput(fixture.inputDir);
    }
}

async function walkFiles(directory: string): Promise<string[]> {
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
    if (isTextFile(path)) {
        const content = await readFile(path, "utf8");
        return normalizeShadowContent(content, shadowDir);
    }

    return readFile(path);
}

export async function runCustomImports(
    fixture: BuildFixture,
    signal: AbortSignal,
): Promise<string> {
    const configPath = join(fixture.inputDir, CONFIG_FILE);
    const shadowDir = join(fixture.inputDir, SHADOW_DIR);

    await cleanupFixtureInput(fixture.inputDir);

    await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
            reject(
                signal.reason instanceof Error
                    ? signal.reason
                    : new Error("custom-imports run aborted", {
                          cause: signal.reason,
                      }),
            );
        };

        if (signal.aborted) {
            onAbort();
            return;
        }

        signal.addEventListener("abort", onAbort, { once: true });

        const child = spawn(
            process.execPath,
            [cliPath, "--config", configPath],
            {
                cwd: fixture.inputDir,
                stdio: ["ignore", "pipe", "pipe"],
                env: process.env,
                signal,
            },
        );

        const stderrChunks: Buffer[] = [];
        const stdoutChunks: Buffer[] = [];

        child.stdout.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
        });

        child.stderr.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
        });

        child.on("error", (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
        });

        child.on("close", (code) => {
            signal.removeEventListener("abort", onAbort);

            if (signal.aborted) {
                onAbort();
                return;
            }

            if (code === 0) {
                resolve();
                return;
            }

            const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
            const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
            const output = [stderr, stdout].filter(Boolean).join("\n");

            reject(
                new Error(
                    output ||
                        `custom-imports exited with code ${code ?? "unknown"}`,
                ),
            );
        });
    });

    return shadowDir;
}

export async function assertShadows(
    fixture: BuildFixture,
    shadowDir: string,
): Promise<void> {
    const actualFiles = new Set(
        (await walkFiles(shadowDir)).map((path) => relative(shadowDir, path)),
    );
    const expectedFiles = new Set(
        (await walkFiles(fixture.outputDir)).map((path) =>
            relative(fixture.outputDir, path),
        ),
    );

    const missing = [...expectedFiles].filter((path) => !actualFiles.has(path));
    const extra = [...actualFiles].filter((path) => !expectedFiles.has(path));

    if (missing.length > 0 || extra.length > 0) {
        throw new Error(
            [
                `Fixture "${fixture.name}" shadow file list mismatch`,
                missing.length > 0 ? `missing: ${missing.join(", ")}` : undefined,
                extra.length > 0 ? `extra: ${extra.join(", ")}` : undefined,
            ]
                .filter(Boolean)
                .join("\n"),
        );
    }

    for (const relativePath of expectedFiles) {
        const expectedPath = join(fixture.outputDir, relativePath);
        const actualPath = join(shadowDir, relativePath);
        const expected = isTextFile(expectedPath)
            ? await readFile(expectedPath, "utf8")
            : await readFile(expectedPath);
        const actual = await readShadowFile(actualPath, shadowDir);

        if (Buffer.isBuffer(expected)) {
            if (!Buffer.isBuffer(actual) || !expected.equals(actual)) {
                throw new Error(
                    `Fixture "${fixture.name}" binary mismatch at ${relativePath}`,
                );
            }
            continue;
        }

        if (expected !== actual) {
            throw new Error(
                `Fixture "${fixture.name}" text mismatch at ${relativePath}`,
            );
        }
    }
}

export async function assertShadowMatchesExpected(
    fixture: BuildFixture,
    signal: AbortSignal,
): Promise<void> {
    const shadowDir = await runCustomImports(fixture, signal);
    await assertShadows(fixture, shadowDir);
}

export async function writeExpected(
    fixture: BuildFixture,
    signal: AbortSignal,
): Promise<void> {
    const shadowDir = await runCustomImports(fixture, signal);

    await rm(fixture.outputDir, { recursive: true, force: true });

    for (const filePath of await walkFiles(shadowDir)) {
        const relativePath = relative(shadowDir, filePath);
        const outputPath = join(fixture.outputDir, relativePath);
        const content = await readShadowFile(filePath, shadowDir);

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, content);
    }
}
