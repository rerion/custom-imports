import type { UserConfig } from "./config.js";
import {
  generateAsset,
  isRelativeImport,
  isSourceFile,
  type AssetImport,
  type BuildResult,
} from "./build.js";
import type { Import } from "./parse-imports.js";
import { removeAssetShadow } from "./shadow.js";

type SourceImports = Map<string, Import>;

function relativeImports(imports: Import[]): Import[] {
  return imports.filter((imp) => isRelativeImport(imp.source));
}

function toSourceImports(imports: Import[]): SourceImports {
  return new Map(imports.map((imp) => [imp.resolvedPath, imp] as const));
}

export class ImportTracker {
  private readonly sources = new Map<string, SourceImports>();
  private readonly targets = new Set<string>();
  private readonly refs = new Map<string, Set<string>>();

  constructor(
    private readonly config: UserConfig,
    private readonly sourceDir: string,
    private readonly shadowDir: string,
  ) {}

  static fromBuildResult(
    config: UserConfig,
    sourceDir: string,
    shadowDir: string,
    buildResult: BuildResult,
  ): ImportTracker {
    const tracker = new ImportTracker(config, sourceDir, shadowDir);

    for (const file of buildResult.files) {
      tracker.setSourceImports(file.path, file.imports);
    }

    return tracker;
  }

  get sourceCount(): number {
    return this.sources.size;
  }

  get targetCount(): number {
    return this.targets.size;
  }

  isSource(path: string): boolean {
    return isSourceFile(path);
  }

  isImportTarget(path: string): boolean {
    return this.targets.has(path);
  }

  private setSourceImports(sourcePath: string, imports: Import[]): void {
    const sourceImports = toSourceImports(relativeImports(imports));
    this.sources.set(sourcePath, sourceImports);

    for (const resolvedPath of sourceImports.keys()) {
      this.targets.add(resolvedPath);
      const importers = this.refs.get(resolvedPath) ?? new Set<string>();
      importers.add(sourcePath);
      this.refs.set(resolvedPath, importers);
    }
  }

  private removeSource(sourcePath: string): string[] {
    const previous = [...(this.sources.get(sourcePath)?.keys() ?? [])];
    this.sources.delete(sourcePath);
    return previous;
  }

  private dropTargetIfUnreferenced(resolvedPath: string): boolean {
    const importers = this.refs.get(resolvedPath);
    if (importers && importers.size > 0) {
      return false;
    }

    this.refs.delete(resolvedPath);
    this.targets.delete(resolvedPath);
    return true;
  }

  private assetImport(
    sourcePath: string,
    resolvedPath: string,
  ): AssetImport | undefined {
    const imp = this.sources.get(sourcePath)?.get(resolvedPath);
    if (!imp) {
      return undefined;
    }

    return { import: imp, importer: sourcePath };
  }

  async sourceChanged(
    sourcePath: string,
    imports: Import[],
  ): Promise<boolean> {
    const next = toSourceImports(relativeImports(imports));
    const previous = this.sources.get(sourcePath) ?? new Map<string, Import>();

    const added = [...next.keys()].filter((path) => !previous.has(path));
    const removed = [...previous.keys()].filter((path) => !next.has(path));

    if (added.length === 0 && removed.length === 0) {
      return false;
    }

    this.sources.set(sourcePath, next);

    for (const resolvedPath of removed) {
      this.refs.get(resolvedPath)?.delete(sourcePath);

      if (this.dropTargetIfUnreferenced(resolvedPath)) {
        await removeAssetShadow(this.shadowDir, resolvedPath);
        console.log(`  removed ${resolvedPath}`);
      }
    }

    for (const resolvedPath of added) {
      const importers = this.refs.get(resolvedPath) ?? new Set<string>();
      const wasUnreferenced = importers.size === 0;
      importers.add(sourcePath);
      this.refs.set(resolvedPath, importers);
      this.targets.add(resolvedPath);

      if (wasUnreferenced) {
        const assetImport = this.assetImport(sourcePath, resolvedPath);
        if (assetImport) {
          await generateAsset(
            this.config,
            this.sourceDir,
            this.shadowDir,
            assetImport,
          );
          console.log(`  generated ${resolvedPath}`);
        }
      }
    }

    return true;
  }

  async sourceDeleted(sourcePath: string): Promise<boolean> {
    if (!this.sources.has(sourcePath)) {
      return false;
    }

    const removed = this.removeSource(sourcePath);

    for (const resolvedPath of removed) {
      this.refs.get(resolvedPath)?.delete(sourcePath);

      if (this.dropTargetIfUnreferenced(resolvedPath)) {
        await removeAssetShadow(this.shadowDir, resolvedPath);
        console.log(`  removed ${resolvedPath}`);
      }
    }

    return true;
  }

  async importTargetChanged(resolvedPath: string): Promise<boolean> {
    if (!this.targets.has(resolvedPath)) {
      return false;
    }

    const importers = this.refs.get(resolvedPath);
    const importer = importers ? [...importers][0] : undefined;
    if (!importer) {
      return false;
    }

    const assetImport = this.assetImport(importer, resolvedPath);
    if (!assetImport) {
      return false;
    }

    await removeAssetShadow(this.shadowDir, resolvedPath);
    await generateAsset(
      this.config,
      this.sourceDir,
      this.shadowDir,
      assetImport,
    );

    console.log(`  regenerated ${resolvedPath} (${importers!.size} refs)`);
    return true;
  }
}
