import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { CustomImports } from "custom-imports";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith(".");
}

function resolveImportPath(importerPath: string, specifier: string): string {
  return relative(".", resolve(dirname(importerPath), specifier));
}

function stripEsmImportSuffix(resolvedPath: string): string {
  if (resolvedPath.endsWith(".mjs")) {
    return resolvedPath.slice(0, -4);
  }

  if (resolvedPath.endsWith(".js")) {
    return resolvedPath.slice(0, -3);
  }

  return resolvedPath;
}

function shadowModulePath(shadowDir: string, resolvedPath: string): string {
  return `${join(shadowDir, resolvedPath)}.js`;
}

export function isSourcePath(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path));
}

export interface ResolveShadowImportOptions {
  source: string;
  importer: string | undefined;
  api: CustomImports;
  esm: boolean;
}

export async function resolveShadowImport(
  options: ResolveShadowImportOptions,
): Promise<string | null> {
  const { source, importer, api, esm } = options;

  if (!importer || !isRelativeImport(source)) {
    return null;
  }

  const absoluteImporter = resolve(importer);
  const absoluteSourceDir = api.sourceDir;

  if (
    absoluteImporter !== absoluteSourceDir &&
    !absoluteImporter.startsWith(`${absoluteSourceDir}/`)
  ) {
    return null;
  }

  const importerPath = relative(absoluteSourceDir, absoluteImporter);
  let resolvedPath = resolveImportPath(importerPath, source);

  if (esm) {
    resolvedPath = stripEsmImportSuffix(resolvedPath);
  }

  if ((await api.targetKind(resolvedPath)) !== "js") {
    return null;
  }

  const shadowPath = shadowModulePath(api.shadowDir, resolvedPath);
  return isAbsolute(shadowPath) ? shadowPath : resolve(shadowPath);
}
