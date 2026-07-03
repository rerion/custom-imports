import { isAbsolute, resolve } from "node:path";
import {
  isRelativeImport,
  relativePathInDir,
  resolveImportPath,
  stripEsmImportSuffix,
  type TargetKind,
} from "./build.js";
import { shadowPaths } from "./shadow.js";

export interface ResolveShadowImportOptions {
  source: string;
  importer: string | undefined;
  sourceDir: string;
  shadowDir: string;
  esm: boolean;
  targetKind: (path: string) => Promise<TargetKind>;
}

export async function resolveShadowImport(
  options: ResolveShadowImportOptions,
): Promise<string | null> {
  const { source, importer, sourceDir, shadowDir, esm, targetKind } = options;

  if (!importer || !isRelativeImport(source)) {
    return null;
  }

  const importerPath = relativePathInDir(importer, sourceDir);
  if (importerPath === null) {
    return null;
  }

  let resolvedPath = resolveImportPath(importerPath, source);

  if (esm) {
    resolvedPath = stripEsmImportSuffix(resolvedPath);
  }

  if ((await targetKind(resolvedPath)) !== "js") {
    return null;
  }

  const shadowPath = shadowPaths(shadowDir, resolvedPath).jsPath;
  return isAbsolute(shadowPath) ? shadowPath : resolve(shadowPath);
}
