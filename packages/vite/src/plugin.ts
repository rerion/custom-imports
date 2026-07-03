import { resolve } from "node:path";
import {
  createCustomImports,
  isSourceFile,
  relativePathInDir,
  type CustomImports,
  type UserConfig,
} from "custom-imports";
import type { ModuleNode, Plugin, ResolvedConfig, ViteDevServer } from "vite";

interface PluginContext {
  api: CustomImports;
}

function allowShadowDir(shadowDir: string, config: ResolvedConfig): void {
  const normalized = resolve(shadowDir);
  const allow = config.server.fs.allow;

  if (!allow.some((entry) => resolve(entry) === normalized)) {
    allow.push(shadowDir);
  }
}

function shadowModules(shadowDir: string, server: ViteDevServer): ModuleNode[] {
  const modules: ModuleNode[] = [];
  const prefix = `${shadowDir}/`;

  for (const module of server.moduleGraph.idToModuleMap.values()) {
    if (module.id?.startsWith(prefix)) {
      modules.push(module);
    }
  }

  return modules;
}

async function syncFile(
  api: CustomImports,
  relativePath: string,
): Promise<boolean> {
  if (isSourceFile(relativePath)) {
    return api.syncSource(relativePath);
  }

  const kind = await api.targetKind(relativePath);
  if (kind === "none") {
    return false;
  }

  await api.regenerateTarget(relativePath, { requireTracked: true });
  return true;
}

export function customImports(config: UserConfig): Plugin {
  let ctx: PluginContext | undefined;

  return {
    name: "custom-imports",
    enforce: "pre",

    async configResolved(viteConfig) {
      const api = await createCustomImports({
        projectRoot: viteConfig.root,
        config,
      });

      ctx = { api };
      allowShadowDir(api.shadowDir, viteConfig);
    },

    async buildStart() {
      if (!ctx) {
        return;
      }

      await ctx.api.build();
    },

    async resolveId(source, importer) {
      if (!ctx) {
        return null;
      }

      return ctx.api.resolveImport(source, importer);
    },

    configureServer(server) {
      if (!ctx) {
        return;
      }

      const { api } = ctx;
      allowShadowDir(api.shadowDir, server.config);

      // Vite has no handleHotDelete; unlink must be handled separately from handleHotUpdate.
      server.watcher.on("unlink", (file) => {
        const relativePath = relativePathInDir(file, api.sourceDir);
        if (!relativePath || !isSourceFile(relativePath)) {
          return;
        }

        void api.syncSourceRemoved(relativePath).then((changed) => {
          if (!changed) {
            return;
          }

          for (const module of shadowModules(api.shadowDir, server)) {
            server.moduleGraph.invalidateModule(module);
          }
        });
      });
    },

    async handleHotUpdate({ file, server }) {
      if (!ctx) {
        return;
      }

      const relativePath = relativePathInDir(file, ctx.api.sourceDir);
      if (!relativePath) {
        return;
      }

      if (!(await syncFile(ctx.api, relativePath))) {
        return;
      }

      return shadowModules(ctx.api.shadowDir, server);
    },
  };
}

export { resolveShadowImport } from "./resolve.js";
export type { ResolveShadowImportOptions } from "./resolve.js";
