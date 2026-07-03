import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createWatchSession } from "./watch-session.js";

export async function watchProject(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);

  console.log(`watch (${configPath}, ${config.plugins.length} plugins)`);

  const session = await createWatchSession({
    config,
    projectRoot: dirname(resolve(configPath)),
    onReady() {
      console.log(
        `watching ${session.buildResult.sourceDir} (${session.tracker.sourceCount} source files, ${session.tracker.targetCount} assets)`,
      );
    },
    onUpdate(relativePath) {
      console.log(`update ${relativePath}`);
    },
  });

  await new Promise<void>((_resolve, reject) => {
    const watcher = session.watch();

    const shutdown = (): void => {
      void watcher.close().finally(() => {
        process.exit(0);
      });
    };

    watcher.on("error", (error) => {
      void watcher.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  });
}
