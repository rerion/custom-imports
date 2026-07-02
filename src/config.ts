import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { Plugin } from "./plugin.js";

const SUPPORTED_EXTENSIONS = new Set([".ts", ".mts", ".js", ".mjs"]);

export interface UserConfig {
    sourceDir: string;
    shadowDir: string;
    plugins: Plugin[];
}

export function defineConfig(config: UserConfig): UserConfig {
    return config;
}

function isUserConfig(value: unknown): value is UserConfig {
    return (
        typeof value === "object" &&
        value !== null &&
        "sourceDir" in value &&
        typeof (value as UserConfig).sourceDir === "string" &&
        "shadowDir" in value &&
        typeof (value as UserConfig).shadowDir === "string" &&
        "plugins" in value &&
        Array.isArray((value as UserConfig).plugins)
    );
}

function assertUserConfig(value: unknown, configPath: string): UserConfig {
    if (!isUserConfig(value)) {
        throw new Error(
            `Config at ${configPath} must default-export a valid config object`,
        );
    }

    return value;
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

async function importDefaultExport(modulePath: string): Promise<unknown> {
    const module = await import(pathToFileURL(modulePath).href);
    return module.default;
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
        extension === ".ts"
            ? await compileTypeScriptConfig(absolutePath)
            : absolutePath;

    const exported = await importDefaultExport(modulePath);
    return assertUserConfig(exported, absolutePath);
}
