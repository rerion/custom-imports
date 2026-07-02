import { access, appendFile, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Context, PluginErrorDetails, Writer } from "./plugin.js";
import { PluginError } from "./plugin.js";

export interface CreateContextImport {
  source: string;
  resolvedPath: string;
  importer: string;
}

export interface CreateContextOptions {
  sourceDir: string;
  shadowDir: string;
  pluginName: string;
  import: CreateContextImport;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function pluginError(
  message: string,
  details: PluginErrorDetails,
): PluginError {
  return new PluginError(message, details);
}

async function createAppendWriter(
  filePath: string,
  details: PluginErrorDetails,
): Promise<Writer> {
  if (await fileExists(filePath)) {
    throw pluginError(`File already exists: ${filePath}`, {
      ...details,
      kind: "internal",
    });
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, "", { flag: "wx" });

  return {
    path: filePath,
    async write(chunk: Uint8Array | string): Promise<void> {
      await appendFile(filePath, chunk);
    },
  };
}

export async function createContext(
  assetPath: string,
  options: CreateContextOptions,
): Promise<[Context, Promise<void>]> {
  const details: PluginErrorDetails = {
    pluginName: options.pluginName,
    importer: options.import.importer,
    source: options.import.source,
    resolvedPath: options.import.resolvedPath,
    kind: "internal",
  };

  const assetRelativePath = relative(options.sourceDir, assetPath);
  const shadowBase = join(options.shadowDir, assetRelativePath);
  const jsPath = `${shadowBase}.js`;
  const dtsPath = `${shadowBase}.d.ts`;
  const assetOutputDir = dirname(shadowBase);

  const jsFile = await createAppendWriter(jsPath, details);
  const dtsFile = await createAppendWriter(dtsPath, details);

  let resolveDone!: () => void;
  const doneBuildingPromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  let finished = false;

  const context: Context = {
    path: assetPath,
    sourceDir: options.sourceDir,
    jsFile,
    dtsFile,

    async newAssetFile(relativePath: string): Promise<Writer> {
      const assetPath = join(assetOutputDir, relativePath);
      return createAppendWriter(assetPath, details);
    },

    error(message: string): never {
      throw pluginError(message, { ...details, kind: "plugin" });
    },

    async done(): Promise<void> {
      if (finished) {
        return;
      }

      finished = true;
      resolveDone();
    },
  };

  return [context, doneBuildingPromise];
}

export async function runPluginGeneration(
  plugin: { name: string; generate(ctx: Context): Promise<unknown> },
  assetPath: string,
  options: CreateContextOptions,
): Promise<void> {
  const [context, doneBuildingPromise] = await createContext(assetPath, options);

  try {
    await plugin.generate(context);
    await doneBuildingPromise;
  } catch (error: unknown) {
    if (error instanceof PluginError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new PluginError(message, {
      pluginName: options.pluginName,
      importer: options.import.importer,
      source: options.import.source,
      resolvedPath: options.import.resolvedPath,
      kind: "internal",
    });
  }
}
