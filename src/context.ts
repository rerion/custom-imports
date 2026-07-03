import { access, appendFile, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Context, PluginErrorDetails, Writer } from "./plugin.js";
import { PluginError } from "./plugin.js";
import { shadowPaths } from "./shadow.js";

export interface CreateContextImport {
  source: string;
  resolvedPath: string;
  importer: string;
}

export interface CreateContextOptions {
  sourceDir: string;
  shadowDir: string;
  pluginName: string;
  assetsAndTypesOnly?: boolean;
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

async function appendAssetManifest(
  manifestPath: string,
  relativePath: string,
  details: PluginErrorDetails,
): Promise<void> {
  if (await fileExists(manifestPath)) {
    await appendFile(manifestPath, `${relativePath}\n`);
    return;
  }

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${relativePath}\n`, { flag: "wx" });
}

function isInsideDirectory(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);

  if (resolvedRoot === resolvedTarget) {
    return true;
  }

  const rel = relative(resolvedRoot, resolvedTarget);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function resolveNewAssetPath(
  assetPath: string,
  shadowDir: string,
  assetOutputDir: string,
  details: PluginErrorDetails,
): { filePath: string; manifestPath: string } {
  const shadowRoot = resolve(shadowDir);
  const resolvedAssetOutputDir = resolve(assetOutputDir);

  let filePath: string;
  if (assetPath.startsWith("/") || isAbsolute(assetPath)) {
    const fromShadowRoot = assetPath.replace(/^[/\\]+/, "");
    if (!fromShadowRoot) {
      throw pluginError(`Asset path must not be empty: ${assetPath}`, {
        ...details,
        kind: "internal",
      });
    }

    filePath = resolve(shadowRoot, fromShadowRoot);
  } else {
    filePath = resolve(resolvedAssetOutputDir, assetPath);
  }

  if (!isInsideDirectory(shadowRoot, filePath)) {
    throw pluginError(`Asset path escapes shadow directory: ${assetPath}`, {
      ...details,
      kind: "internal",
    });
  }

  return {
    filePath,
    manifestPath: relative(shadowRoot, filePath),
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
  const { shadowBase, assetsPath } = shadowPaths(
    options.shadowDir,
    assetRelativePath,
  );
  const jsPath = `${shadowBase}.js`;
  const dtsPath = `${shadowBase}.d.ts`;
  const assetOutputDir = dirname(shadowBase);

  const jsFile = options.assetsAndTypesOnly
    ? undefined
    : await createAppendWriter(jsPath, details);
  const dtsFile = await createAppendWriter(dtsPath, details);

  let resolveDone!: () => void;
  const doneBuildingPromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  let finished = false;

  const context: Context = {
    path: assetPath,
    sourceDir: options.sourceDir,
    ...(jsFile ? { jsFile } : {}),
    dtsFile,

    async newAssetFile(assetPath: string): Promise<Writer> {
      const { filePath, manifestPath } = resolveNewAssetPath(
        assetPath,
        options.shadowDir,
        assetOutputDir,
        details,
      );
      const writer = await createAppendWriter(filePath, details);
      await appendAssetManifest(assetsPath, manifestPath, details);
      return writer;
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
  plugin: {
    name: string;
    assetsAndTypesOnly?: boolean;
    generate(ctx: Context): Promise<unknown>;
  },
  assetPath: string,
  options: CreateContextOptions,
): Promise<void> {
  const [context, doneBuildingPromise] = await createContext(assetPath, {
    ...options,
    assetsAndTypesOnly: plugin.assetsAndTypesOnly ?? false,
  });

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
