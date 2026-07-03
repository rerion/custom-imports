import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { runPluginGeneration } from "./context.js";
import type { UserConfig } from "./config.js";
import type { Plugin } from "./plugin.js";
import { parseImportSpecifiers, type Import } from "./parse-imports.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

export function getProjectPaths(configPath: string, config: UserConfig) {
  const projectRoot = dirname(resolve(configPath));
  return {
    projectRoot,
    sourceDir: resolve(projectRoot, config.sourceDir),
    shadowDir: resolve(projectRoot, config.shadowDir),
  };
}

export function resolveImportPath(
  importerPath: string,
  specifier: string,
): string {
  return relative(".", resolve(dirname(importerPath), specifier));
}

export function stripEsmImportSuffix(resolvedPath: string): string {
  if (resolvedPath.endsWith(".mjs")) {
    return resolvedPath.slice(0, -4);
  }

  if (resolvedPath.endsWith(".js")) {
    return resolvedPath.slice(0, -3);
  }

  return resolvedPath;
}

export function resolveImports(
  importerPath: string,
  specifiers: string[],
  esm = false,
): Import[] {
  return specifiers.map((source) => {
    let resolvedPath = resolveImportPath(importerPath, source);

    if (esm && isRelativeImport(source)) {
      resolvedPath = stripEsmImportSuffix(resolvedPath);
    }

    return { source, resolvedPath };
  });
}

export interface AssetImport {
  import: Import;
  importer: string;
}

export interface ParsedSourceFile {
  path: string;
  imports: Import[];
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

export function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith(".");
}

export function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path));
}

export async function findMatchingPlugin(
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

export async function generateAsset(
  config: UserConfig,
  sourceDir: string,
  shadowDir: string,
  assetImport: AssetImport,
): Promise<void> {
  const plugin = await findMatchingPlugin(
    config.plugins,
    assetImport.import.resolvedPath,
    sourceDir,
  );

  if (!plugin) {
    return;
  }

  const assetPath = resolve(sourceDir, assetImport.import.resolvedPath);

  await runPluginGeneration(plugin, assetPath, {
    sourceDir,
    shadowDir,
    pluginName: plugin.name,
    import: {
      source: assetImport.import.source,
      resolvedPath: assetImport.import.resolvedPath,
      importer: assetImport.importer,
    },
  });
}

function collectAssetImports(
  files: ParsedSourceFile[],
): Map<string, AssetImport> {
  const assetImports = new Map<string, AssetImport>();

  for (const file of files) {
    for (const imp of file.imports) {
      if (!isRelativeImport(imp.source)) {
        continue;
      }

      if (!assetImports.has(imp.resolvedPath)) {
        assetImports.set(imp.resolvedPath, {
          import: imp,
          importer: file.path,
        });
      }
    }
  }

  return assetImports;
}

export async function build(
  configPath: string,
  config: UserConfig,
): Promise<BuildResult> {
  const { sourceDir, shadowDir } = getProjectPaths(configPath, config);
  const sourceFiles = await walkSourceFiles(sourceDir);
  const files: ParsedSourceFile[] = [];

  for (const absolutePath of sourceFiles) {
    const importerPath = relative(sourceDir, absolutePath);
    const source = await readFile(absolutePath, "utf8");
    const imports = resolveImports(
      importerPath,
      await parseImportSpecifiers(absolutePath, source),
      config.esm ?? false,
    );

    files.push({
      path: importerPath,
      imports,
    });
  }

  const assetImports = collectAssetImports(files);
  const generated: string[] = [];

  await rm(shadowDir, { recursive: true, force: true });

  for (const [resolvedPath, assetImport] of assetImports) {
    await generateAsset(config, sourceDir, shadowDir, assetImport);
    generated.push(resolvedPath);
  }

  return {
    sourceDir,
    shadowDir,
    files,
    generated,
  };
}

export async function buildProject(configPath: string): Promise<BuildResult> {
  const config = await loadConfig(configPath);
  const result = await build(configPath, config);

  console.log(
    `build (${configPath}, ${config.plugins.length} plugins, ${result.files.length} files, ${result.generated.length} generated)`,
  );

  for (const file of result.files) {
    for (const imp of file.imports) {
      console.log(`  ${file.path}: ${imp.resolvedPath}`);
    }
  }

  for (const assetPath of result.generated) {
    console.log(`  generated ${assetPath}`);
  }

  return result;
}
