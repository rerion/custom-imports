import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative, resolve } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import {
  buildFromRoot,
  resolveImports,
  type BuildResult,
} from "./build.js";
import type { UserConfig } from "./config.js";
import { ImportTracker } from "./import-tracker.js";
import { parseImportSpecifiers } from "./parse-imports.js";
import { shadowPaths } from "./shadow.js";

export interface WatchSessionOptions {
  config: UserConfig;
  projectRoot: string;
  buildResult?: BuildResult;
  onReady?: () => void;
  onUpdate?: (relativePath: string) => void;
  onError?: (error: Error) => void;
}

export interface WatchSession {
  readonly buildResult: BuildResult;
  readonly tracker: ImportTracker;
  watch(): FSWatcher;
}

interface WatchContext {
  sourceDir: string;
  tracker: ImportTracker;
  esm: boolean;
  onUpdate?: (relativePath: string) => void;
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
        context.onUpdate?.(relativePath);
      }
      return;
    }

    const imports = await loadImports(
      context.sourceDir,
      relativePath,
      context.esm,
    );
    if (await context.tracker.sourceChanged(relativePath, imports)) {
      context.onUpdate?.(relativePath);
    }
    return;
  }

  if (await context.tracker.importTargetChanged(relativePath)) {
    context.onUpdate?.(relativePath);
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

export async function createWatchSession(
  options: WatchSessionOptions,
): Promise<WatchSession> {
  const { config, projectRoot } = options;
  const buildResult =
    options.buildResult ?? (await buildFromRoot(projectRoot, config));
  const sourceDir = resolve(projectRoot, config.sourceDir);
  const shadowDir = resolve(projectRoot, config.shadowDir);
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
    ...(options.onUpdate ? { onUpdate: options.onUpdate } : {}),
  };

  return {
    buildResult,
    tracker,
    watch() {
      return watchSourceDirectory(
        context,
        () => {
          options.onReady?.();
        },
        (error) => {
          options.onError?.(error);
        },
      );
    },
  };
}

export function shadowModulePath(
  shadowDir: string,
  resolvedPath: string,
): string {
  return shadowPaths(shadowDir, resolvedPath).jsPath;
}
