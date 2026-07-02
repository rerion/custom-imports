import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import type { UserConfig } from "./config.js";
import { parseImports, type ImportStatement, type RawImportStatement } from "./parse-imports.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function resolveImportPath(importerPath: string, specifier: string): string {
  return relative(".", resolve(dirname(importerPath), specifier));
}

function resolveImports(
  importerPath: string,
  imports: RawImportStatement[],
): ImportStatement[] {
  return imports.map((imp) => ({
    ...imp,
    resolvedPath: resolveImportPath(importerPath, imp.source),
  }));
}

export interface ParsedSourceFile {
  path: string;
  imports: ImportStatement[];
}

export interface BuildResult {
  sourceDir: string;
  files: ParsedSourceFile[];
}

async function walkSourceFiles(
  directory: string,
  files: string[] = [],
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await walkSourceFiles(entryPath, files);
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function build(
  configPath: string,
  config: UserConfig,
): Promise<BuildResult> {
  const projectRoot = dirname(resolve(configPath));
  const sourceDir = resolve(projectRoot, config.sourceDir);
  const sourceFiles = await walkSourceFiles(sourceDir);
  const files: ParsedSourceFile[] = [];

  for (const absolutePath of sourceFiles) {
    const importerPath = relative(sourceDir, absolutePath);
    const source = await readFile(absolutePath, "utf8");
    const imports = resolveImports(
      importerPath,
      await parseImports(absolutePath, source),
    );

    files.push({
      path: importerPath,
      imports,
    });
  }

  return {
    sourceDir,
    files,
  };
}
