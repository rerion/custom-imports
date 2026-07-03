import { readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { UserConfig } from "./config.js";
import {
  findMatchingPlugin,
  generateAsset,
  isRelativeImport,
  isSourceFile,
  resolveImports,
  walkSourceFiles,
  type AssetImport,
} from "./build.js";
import { parseImportSpecifiers, type Import } from "./parse-imports.js";
import { removeAssetShadow } from "./shadow.js";

export interface CustomImportsOptions {
  config: UserConfig;
  projectRoot: string;
}

export interface CustomImports {
  readonly sourceDir: string;
  readonly shadowDir: string;

  extractImports(sourcePath: string): Promise<Import[]>;
  regenerateImport(targetPath: string): Promise<void>;
  cleanImport(targetPath: string): Promise<void>;
  cleanAll(): Promise<void>;
  canHandle(targetPath: string): Promise<boolean>;
}

export function createCustomImports(
  options: CustomImportsOptions,
): CustomImports {
  const { config, projectRoot } = options;
  const sourceDir = resolve(projectRoot, config.sourceDir);
  const shadowDir = resolve(projectRoot, config.shadowDir);
  const esm = config.esm ?? false;

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

  return {
    sourceDir,
    shadowDir,

    async extractImports(sourcePath: string): Promise<Import[]> {
      return readSourceImports(sourcePath);
    },

    async canHandle(targetPath: string): Promise<boolean> {
      return (await findMatchingPlugin(config.plugins, targetPath, sourceDir)) !==
        undefined;
    },

    async cleanImport(targetPath: string): Promise<void> {
      await removeAssetShadow(shadowDir, targetPath);
    },

    async cleanAll(): Promise<void> {
      await rm(shadowDir, { recursive: true, force: true });
    },

    async regenerateImport(targetPath: string): Promise<void> {
      if (!(await findMatchingPlugin(config.plugins, targetPath, sourceDir))) {
        return;
      }

      await removeAssetShadow(shadowDir, targetPath);

      const assetImport = await findAssetImport(targetPath);
      if (!assetImport) {
        throw new Error(`No importer found for import target: ${targetPath}`);
      }

      await generateAsset(config, sourceDir, shadowDir, assetImport);
    },
  };
}
