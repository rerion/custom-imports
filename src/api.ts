import { readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  buildFromRoot,
  generateAsset,
  isRelativeImport,
  isSourceFile,
  resolveImports,
  resolveTargetKind,
  walkSourceFiles,
  type AssetImport,
  type TargetKind,
} from "./build.js";
import type { UserConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { ImportTracker } from "./import-tracker.js";
import { parseImportSpecifiers, type Import } from "./parse-imports.js";
import { resolveShadowImport } from "./resolve-import.js";
import { removeAssetShadow } from "./shadow.js";

export type { TargetKind } from "./build.js";

export type CustomImportsOptions =
  | { projectRoot: string; config: UserConfig }
  | { projectRoot: string; configPath: string };

export interface RegenerateTargetOptions {
  /** Require the target to be in the import graph from a prior `build()`. Never builds on demand. */
  requireTracked?: boolean;
}

export interface CustomImports {
  readonly sourceDir: string;
  readonly shadowDir: string;
  readonly esm: boolean;

  build(): Promise<void>;
  extractImports(sourcePath: string): Promise<Import[]>;
  syncSource(sourcePath: string): Promise<boolean>;
  syncSourceRemoved(sourcePath: string): Promise<boolean>;
  regenerateTarget(
    targetPath: string,
    options?: RegenerateTargetOptions,
  ): Promise<void>;
  cleanImport(targetPath: string): Promise<void>;
  cleanAll(): Promise<void>;
  targetKind(targetPath: string): Promise<TargetKind>;
  resolveImport(
    source: string,
    importer: string | undefined,
  ): Promise<string | null>;
}

export async function createCustomImports(
  options: CustomImportsOptions,
): Promise<CustomImports> {
  const config =
    "configPath" in options
      ? await loadConfig(options.configPath)
      : options.config;
  const { projectRoot } = options;
  const sourceDir = resolve(projectRoot, config.sourceDir);
  const shadowDir = resolve(projectRoot, config.shadowDir);
  const esm = config.esm ?? false;
  let tracker: ImportTracker | undefined;

  async function readSourceImports(sourcePath: string): Promise<Import[]> {
    if (!isSourceFile(sourcePath)) {
      throw new Error(`Not a TypeScript source file: ${sourcePath}`);
    }

    const absolutePath = join(sourceDir, sourcePath);
    const source = await readFile(absolutePath, "utf8");

    return resolveImports(
      sourcePath,
      await parseImportSpecifiers(absolutePath, source),
      esm,
    );
  }

  async function findAssetImport(
    targetPath: string,
  ): Promise<AssetImport | undefined> {
    for (const absolutePath of await walkSourceFiles(sourceDir)) {
      const importerPath = relative(sourceDir, absolutePath);

      for (const imp of await readSourceImports(importerPath)) {
        if (!isRelativeImport(imp.source)) {
          continue;
        }

        if (imp.resolvedPath === targetPath) {
          return { import: imp, importer: importerPath };
        }
      }
    }

    return undefined;
  }

  async function ensureTracker(): Promise<ImportTracker> {
    if (!tracker) {
      const buildResult = await buildFromRoot(projectRoot, config);
      tracker = ImportTracker.fromBuildResult(
        config,
        sourceDir,
        shadowDir,
        buildResult,
      );
    }

    return tracker;
  }

  function failIfRequired(requireTracked: boolean, message: string): void {
    if (requireTracked) {
      throw new Error(message);
    }
  }

  return {
    sourceDir,
    shadowDir,
    esm,

    async build(): Promise<void> {
      const buildResult = await buildFromRoot(projectRoot, config);
      tracker = ImportTracker.fromBuildResult(
        config,
        sourceDir,
        shadowDir,
        buildResult,
      );
    },

    async extractImports(sourcePath: string): Promise<Import[]> {
      return readSourceImports(sourcePath);
    },

    async syncSource(sourcePath: string): Promise<boolean> {
      const activeTracker = await ensureTracker();
      const imports = await readSourceImports(sourcePath);
      return activeTracker.sourceChanged(sourcePath, imports);
    },

    async syncSourceRemoved(sourcePath: string): Promise<boolean> {
      const activeTracker = await ensureTracker();
      return activeTracker.sourceDeleted(sourcePath);
    },

    async regenerateTarget(
      targetPath: string,
      options: RegenerateTargetOptions = {},
    ): Promise<void> {
      const requireTracked = options.requireTracked ?? false;
      const kind = await resolveTargetKind(
        config.plugins,
        targetPath,
        sourceDir,
      );

      if (kind === "none") {
        failIfRequired(
          requireTracked,
          `No plugin handles import target: ${targetPath}`,
        );
        return;
      }

      if (tracker?.isImportTarget(targetPath)) {
        const changed = await tracker.importTargetChanged(targetPath);
        if (requireTracked && !changed) {
          throw new Error(`Import target is not tracked: ${targetPath}`);
        }
        return;
      }

      if (requireTracked) {
        if (!tracker) {
          throw new Error(
            "Import graph is not initialized. Call build() first.",
          );
        }

        throw new Error(`Import target is not tracked: ${targetPath}`);
      }

      await removeAssetShadow(shadowDir, targetPath);

      const assetImport = await findAssetImport(targetPath);
      if (!assetImport) {
        throw new Error(`No importer found for import target: ${targetPath}`);
      }

      await generateAsset(config, sourceDir, shadowDir, assetImport);
    },

    async targetKind(targetPath: string): Promise<TargetKind> {
      return resolveTargetKind(config.plugins, targetPath, sourceDir);
    },

    async resolveImport(
      source: string,
      importer: string | undefined,
    ): Promise<string | null> {
      return resolveShadowImport({
        source,
        importer,
        sourceDir,
        shadowDir,
        esm,
        targetKind: (path) => resolveTargetKind(config.plugins, path, sourceDir),
      });
    },

    async cleanImport(targetPath: string): Promise<void> {
      await removeAssetShadow(shadowDir, targetPath);
    },

    async cleanAll(): Promise<void> {
      await rm(shadowDir, { recursive: true, force: true });
      tracker = undefined;
    },
  };
}
