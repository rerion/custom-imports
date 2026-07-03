import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import ts from "typescript";
import { importDefaultExport } from "./import-default-export.js";
import type { AnyPlugin } from "./plugin.js";

const SUPPORTED_EXTENSIONS = new Set([".ts", ".mts", ".js", ".mjs"]);

export interface UserConfig {
    sourceDir: string;
    shadowDir: string;
    plugins: AnyPlugin[];
    esm?: boolean;
}

function describeValue(value: unknown): string {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return "array";
    }

    return typeof value;
}

export function validateUserConfig(
    value: unknown,
    configPath: string,
): UserConfig {
    if (typeof value !== "object" || value === null) {
        throw new Error(
            `Config at ${configPath} must default-export an object, got ${describeValue(value)}`,
        );
    }

    const config = value as Record<string, unknown>;
    const problems: string[] = [];

    if (!("sourceDir" in config)) {
        problems.push('missing required field "sourceDir"');
    } else if (typeof config.sourceDir !== "string") {
        problems.push(
            `"sourceDir" must be a string, got ${describeValue(config.sourceDir)}`,
        );
    }

    if (!("shadowDir" in config)) {
        problems.push('missing required field "shadowDir"');
    } else if (typeof config.shadowDir !== "string") {
        problems.push(
            `"shadowDir" must be a string, got ${describeValue(config.shadowDir)}`,
        );
    }

    if (!("plugins" in config)) {
        problems.push('missing required field "plugins"');
    } else if (!Array.isArray(config.plugins)) {
        problems.push(
            `"plugins" must be an array, got ${describeValue(config.plugins)}`,
        );
    }

    if (
        "esm" in config &&
        config.esm !== undefined &&
        typeof config.esm !== "boolean"
    ) {
        problems.push(
            `"esm" must be a boolean, got ${describeValue(config.esm)}`,
        );
    }

    if (problems.length > 0) {
        throw new Error(
            `Invalid config at ${configPath}: ${problems.join("; ")}`,
        );
    }

    return value as UserConfig;
}

async function compileTypeScriptConfig(configPath: string): Promise<string> {
    const source = await readFile(configPath, "utf8");
    const result = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
        fileName: configPath,
    });

    const cacheDir = join(dirname(configPath), ".custom-imports", "cache");
    await mkdir(cacheDir, { recursive: true });

    const outputPath = join(cacheDir, `${basename(configPath)}.mjs`);
    await writeFile(outputPath, result.outputText, "utf8");

    return outputPath;
}

export async function loadConfig(configPath: string): Promise<UserConfig> {
    const absolutePath = resolve(configPath);
    const extension = extname(absolutePath);

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw new Error(
            `Unsupported config format "${extension}". Expected .ts, .mts, .js, or .mjs`,
        );
    }

    const modulePath =
        extension === ".ts" || extension === ".mts"
            ? await compileTypeScriptConfig(absolutePath)
            : absolutePath;

    const exported = await importDefaultExport(modulePath);
    return validateUserConfig(exported, absolutePath);
}
