import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
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
  onReady: () => void,
  onError: (error: Error) => void,
): FSWatcher {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const schedule = (absolutePath: string): void => {
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
  };

  const watcher = chokidar.watch(context.sourceDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 50,
      pollInterval: 10,
    },
  });

  watcher.once("ready", onReady);

  watcher.on("all", (_event, absolutePath) => {
    schedule(absolutePath);
  });

  watcher.on("error", (error) => {
    onError(error instanceof Error ? error : new Error(String(error)));
  });

  return watcher;
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

  const context: WatchContext = {
    sourceDir,
    tracker,
    esm: config.esm ?? false,
  };

  await new Promise<void>((_resolve, reject) => {
    let watcher: FSWatcher;

    const shutdown = (): void => {
      void watcher.close().finally(() => {
        process.exit(0);
      });
    };

    watcher = watchSourceDirectory(
      context,
      () => {
        console.log(
          `watching ${sourceDir} (${tracker.sourceCount} source files, ${tracker.targetCount} assets)`,
        );
      },
      (error) => {
        void watcher.close();
        reject(error);
      },
    );

    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  });
}
