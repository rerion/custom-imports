import { relative } from "node:path";
import {
  createCustomImports,
  type CustomImports,
  type UserConfig,
} from "custom-imports";
import type { ModuleNode, Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { isSourcePath, resolveShadowImport } from "./resolve.js";

interface PluginContext {
  api: CustomImports;
}

function allowShadowDir(shadowDir: string, config: ResolvedConfig): void {
  const allow = config.server.fs.allow;
  if (!allow.includes(shadowDir)) {
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

function isInSourceDir(file: string, sourceDir: string): string | null {
  const relativePath = relative(sourceDir, file);
  if (relativePath.startsWith("..")) {
    return null;
  }

  return relativePath;
}

async function syncFile(
  api: CustomImports,
  relativePath: string,
): Promise<boolean> {
  if (isSourcePath(relativePath)) {
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

      return resolveShadowImport({
        source,
        importer,
        api: ctx.api,
        esm: ctx.api.esm,
      });
    },

    configureServer(server) {
      if (!ctx) {
        return;
      }

      allowShadowDir(ctx.api.shadowDir, server.config);

      server.watcher.on("unlink", (file) => {
        const relativePath = isInSourceDir(file, ctx!.api.sourceDir);
        if (!relativePath || !isSourcePath(relativePath)) {
          return;
        }

        void ctx!.api.syncSourceRemoved(relativePath).then((changed) => {
          if (!changed) {
            return;
          }

          for (const module of shadowModules(ctx!.api.shadowDir, server)) {
            server.moduleGraph.invalidateModule(module);
          }
        });
      });
    },

    async handleHotUpdate({ file, server }) {
      if (!ctx) {
        return;
      }

      const relativePath = isInSourceDir(file, ctx.api.sourceDir);
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
