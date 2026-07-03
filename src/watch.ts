import { access, readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { constants } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  build,
  getProjectPaths,
  resolveImports,
} from "./build.js";
import { loadConfig } from "./config.js";
import { ImportTracker } from "./import-tracker.js";
import { parseImportSpecifiers } from "./parse-imports.js";

interface WatchContext {
  sourceDir: string;
  tracker: ImportTracker;
  esm: boolean;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadImports(
  sourceDir: string,
  sourcePath: string,
  esm: boolean,
) {
  const absolutePath = join(sourceDir, sourcePath);
  const source = await readFile(absolutePath, "utf8");
  return resolveImports(
    sourcePath,
    await parseImportSpecifiers(absolutePath, source),
    esm,
  );
}

async function processWatchEvent(
  context: WatchContext,
  absolutePath: string,
): Promise<void> {
  const relativePath = relative(context.sourceDir, absolutePath);

  if (relativePath.startsWith("..")) {
    return;
  }

  if (context.tracker.isSource(relativePath)) {
    const exists = await fileExists(absolutePath);

    if (!exists) {
      if (await context.tracker.sourceDeleted(relativePath)) {
        console.log(`update ${relativePath}`);
      }
      return;
    }

    const imports = await loadImports(
      context.sourceDir,
      relativePath,
      context.esm,
    );
    if (await context.tracker.sourceChanged(relativePath, imports)) {
      console.log(`update ${relativePath}`);
    }
    return;
  }

  if (await context.tracker.importTargetChanged(relativePath)) {
    console.log(`update ${relativePath}`);
  }
}

function watchSourceDirectory(
  context: WatchContext,
  onError: (error: Error) => void,
): void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  watch(
    context.sourceDir,
    { recursive: true },
    (_event, filename) => {
      if (!filename) {
        return;
      }

      const absolutePath = resolve(context.sourceDir, filename);
      const existing = pending.get(absolutePath);
      if (existing) {
        clearTimeout(existing);
      }

      pending.set(
        absolutePath,
        setTimeout(() => {
          pending.delete(absolutePath);
          void processWatchEvent(context, absolutePath).catch(onError);
        }, 50),
      );
    },
  );
}

export async function watchProject(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);

  console.log(`watch (${configPath}, ${config.plugins.length} plugins)`);

  const buildResult = await build(configPath, config);
  const { sourceDir, shadowDir } = getProjectPaths(configPath, config);
  const tracker = ImportTracker.fromBuildResult(
    config,
    sourceDir,
    shadowDir,
    buildResult,
  );

  console.log(
    `watching ${sourceDir} (${tracker.sourceCount} source files, ${tracker.targetCount} assets)`,
  );

  const context: WatchContext = {
    sourceDir,
    tracker,
    esm: config.esm ?? false,
  };

  await new Promise<void>((_resolve, reject) => {
    watchSourceDirectory(context, (error) => {
      reject(error);
    });
  });
}
