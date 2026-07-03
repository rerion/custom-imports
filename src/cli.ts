#!/usr/bin/env node

import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildProject } from "./build.js";
import { watchProject } from "./watch.js";

const DEFAULT_CONFIG_PATH = "custom-imports.config.ts";

export const EMPTY_CONFIG = `import { defineConfig } from "custom-imports";

export default defineConfig({
    sourceDir: "src",
    shadowDir: ".shadow",
    plugins: [],
});
`;

const HELP_TEXT = `Usage: custom-imports [options]

Options:
  --config <path>  Path to config file (default: ${DEFAULT_CONFIG_PATH})
  --watch          Watch for changes and rebuild incrementally
  --init           Create an empty config file (cannot be combined with other options)
  -h, --help       Show this help message
`;

export interface CliOptions {
  watch: boolean;
  configPath: string;
  init: boolean;
  help: boolean;
}

export function printHelp(): void {
  console.log(HELP_TEXT.trimEnd());
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      watch: { type: "boolean", default: false },
      config: { type: "string" },
      init: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.init && (values.watch || values.config !== undefined)) {
    throw new Error("--init cannot be combined with other options");
  }

  return {
    watch: values.watch ?? false,
    configPath: resolve(values.config ?? DEFAULT_CONFIG_PATH),
    init: values.init ?? false,
    help: values.help ?? false,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function initConfig(configPath: string): Promise<void> {
  if (await fileExists(configPath)) {
    throw new Error(`Config file already exists: ${configPath}`);
  }

  await writeFile(configPath, EMPTY_CONFIG, "utf8");
  console.log(`Created ${configPath}`);
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.init) {
    await initConfig(options.configPath);
    return;
  }

  if (options.watch) {
    await watchProject(options.configPath);
    return;
  }

  await buildProject(options.configPath);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
