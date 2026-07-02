import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { runPluginGeneration } from "./context.js";
import type { UserConfig } from "./config.js";
import type { Plugin } from "./plugin.js";
import {
  parseImports,
  type ImportStatement,
  type RawImportStatement,
} from "./parse-imports.js";

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
  shadowDir: string;
  files: ParsedSourceFile[];
  generated: string[];
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

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith(".");
}

async function findMatchingPlugin(
  plugins: Plugin[],
  resolvedPath: string,
  sourceDir: string,
): Promise<Plugin | undefined> {
  for (const plugin of plugins) {
    if (await plugin.matches(resolvedPath, sourceDir)) {
      return plugin;
    }
  }

  return undefined;
}

export async function build(
  configPath: string,
  config: UserConfig,
): Promise<BuildResult> {
  const projectRoot = dirname(resolve(configPath));
  const sourceDir = resolve(projectRoot, config.sourceDir);
  const shadowDir = resolve(projectRoot, config.shadowDir);
  const sourceFiles = await walkSourceFiles(sourceDir);
  const files: ParsedSourceFile[] = [];
  const assetImports = new Map<
    string,
    { import: ImportStatement; importer: string }
  >();

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

    for (const imp of imports) {
      if (!isRelativeImport(imp.source)) {
        continue;
      }

      if (!assetImports.has(imp.resolvedPath)) {
        assetImports.set(imp.resolvedPath, {
          import: imp,
          importer: importerPath,
        });
      }
    }
  }

  const generated: string[] = [];

  await rm(shadowDir, { recursive: true, force: true });

  for (const [resolvedPath, { import: imp, importer }] of assetImports) {
    const plugin = await findMatchingPlugin(
      config.plugins,
      resolvedPath,
      sourceDir,
    );

    if (!plugin) {
      continue;
    }

    const assetPath = resolve(sourceDir, resolvedPath);

    await runPluginGeneration(plugin, assetPath, {
      sourceDir,
      shadowDir,
      pluginName: plugin.name,
      import: {
        source: imp.source,
        resolvedPath: imp.resolvedPath,
        importer,
      },
    });

    generated.push(resolvedPath);
  }

  return {
    sourceDir,
    shadowDir,
    files,
    generated,
  };
}
