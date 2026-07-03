import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createContext, runPluginGeneration } from "../../src/context.js";
import { PluginError } from "../../src/plugin.js";
import type { Context, Plugin } from "../../src/plugin.js";
import { shadowPaths } from "../../src/shadow.js";
import { projectPath, seed } from "../helpers/project.js";

const contextOptions = {
  sourceDir: projectPath("src"),
  shadowDir: projectPath(".shadow"),
  pluginName: "test",
  import: {
    source: "./note.txt",
    resolvedPath: "note.txt",
    importer: "main.ts",
  },
};

describe("createContext", () => {
  it("creates js and dts writers under the shadow path", async () => {
    seed({ "src/note.txt": "hello" });

    const [ctx] = await createContext(projectPath("src/note.txt"), contextOptions);
    const paths = shadowPaths(contextOptions.shadowDir, "note.txt");

    expect(ctx.jsFile.path).toBe(paths.jsPath);
    expect(ctx.dtsFile.path).toBe(paths.dtsPath);
  });

  it("exposes path, sourceDir, and newAssetFile on the context", async () => {
    seed({ "src/note.txt": "hello" });

    const [ctx] = await createContext(projectPath("src/note.txt"), contextOptions);

    expect(ctx.path).toBe(projectPath("src/note.txt"));
    expect(ctx.sourceDir).toBe(contextOptions.sourceDir);
    expect(typeof ctx.newAssetFile).toBe("function");
  });
});

describe("Context.newAssetFile", () => {
  it("creates an append-only writer for a relative asset path", async () => {
    seed({ "src/logo.svg": "<svg />" });

    const [ctx] = await createContext(projectPath("src/logo.svg"), {
      ...contextOptions,
      import: {
        source: "./logo.svg",
        resolvedPath: "logo.svg",
        importer: "main.ts",
      },
    });

    const writer = await ctx.newAssetFile("copy/logo.svg");
    await writer.write("bytes");

    const paths = shadowPaths(contextOptions.shadowDir, "logo.svg");
    const copiedAsset = join(dirname(paths.shadowBase), "copy/logo.svg");

    await expect(readFile(copiedAsset, "utf8")).resolves.toBe("bytes");
  });

  it("appends shadow-root-relative paths to the .assets manifest", async () => {
    seed({ "src/assets/logo.svg": "<svg />" });

    const [ctx] = await createContext(projectPath("src/assets/logo.svg"), {
      ...contextOptions,
      import: {
        source: "./logo.svg",
        resolvedPath: "assets/logo.svg",
        importer: "main.ts",
      },
    });

    await ctx.newAssetFile("logo.svg");

    await expect(
      readFile(
        shadowPaths(contextOptions.shadowDir, "assets/logo.svg").assetsPath,
        "utf8",
      ),
    ).resolves.toBe("assets/logo.svg\n");
  });

  it("rejects duplicate asset paths", async () => {
    seed({ "src/logo.svg": "<svg />" });

    const [ctx] = await createContext(projectPath("src/logo.svg"), {
      ...contextOptions,
      import: {
        source: "./logo.svg",
        resolvedPath: "logo.svg",
        importer: "main.ts",
      },
    });

    await ctx.newAssetFile("copy/logo.svg");

    await expect(ctx.newAssetFile("copy/logo.svg")).rejects.toThrow(
      "File already exists",
    );
  });

  it("treats absolute paths as shadow-root-relative", async () => {
    seed({ "src/logo.svg": "<svg />" });

    const [ctx] = await createContext(projectPath("src/logo.svg"), {
      ...contextOptions,
      import: {
        source: "./logo.svg",
        resolvedPath: "logo.svg",
        importer: "main.ts",
      },
    });

    const writer = await ctx.newAssetFile("/shared/logo-copy.svg");
    await writer.write("bytes");

    const copiedAsset = join(contextOptions.shadowDir, "shared/logo-copy.svg");

    await expect(readFile(copiedAsset, "utf8")).resolves.toBe("bytes");
    await expect(
      readFile(shadowPaths(contextOptions.shadowDir, "logo.svg").assetsPath, "utf8"),
    ).resolves.toBe("shared/logo-copy.svg\n");
  });

  it("rejects relative paths that escape the shadow directory", async () => {
    seed({ "src/logo.svg": "<svg />" });

    const [ctx] = await createContext(projectPath("src/logo.svg"), {
      ...contextOptions,
      import: {
        source: "./logo.svg",
        resolvedPath: "logo.svg",
        importer: "main.ts",
      },
    });

    await expect(ctx.newAssetFile("../../../outside.txt")).rejects.toThrow(
      "Asset path escapes shadow directory",
    );
  });

  it("rejects absolute paths that escape the shadow directory", async () => {
    seed({ "src/logo.svg": "<svg />" });

    const [ctx] = await createContext(projectPath("src/logo.svg"), {
      ...contextOptions,
      import: {
        source: "./logo.svg",
        resolvedPath: "logo.svg",
        importer: "main.ts",
      },
    });

    await expect(ctx.newAssetFile("/../outside.txt")).rejects.toThrow(
      "Asset path escapes shadow directory",
    );
  });
});

describe("Context.error", () => {
  it("returns a PluginError with plugin and import details", async () => {
    seed({ "src/note.txt": "hello" });

    const [ctx] = await createContext(projectPath("src/note.txt"), contextOptions);

    expect(() => ctx.error("plugin failed")).toThrow(PluginError);
    try {
      ctx.error("plugin failed");
    } catch (error) {
      expect(error).toMatchObject({
        message: "plugin failed",
        pluginName: "test",
        importer: "main.ts",
        source: "./note.txt",
        resolvedPath: "note.txt",
        kind: "plugin",
      });
    }
  });
});

describe("runPluginGeneration", () => {
  const successPlugin: Plugin = {
    name: "success",
    matches: () => true,
    async generate(ctx: Context) {
      await ctx.jsFile.write("export default {};\n");
      await ctx.done();
    },
  };

  it("awaits plugin.generate and resolves when done() is called", async () => {
    seed({ "src/note.txt": "hello" });

    await expect(
      runPluginGeneration(successPlugin, projectPath("src/note.txt"), contextOptions),
    ).resolves.toBeUndefined();
  });

  it("rejects when the plugin throws", async () => {
    seed({ "src/note.txt": "hello" });

    const plugin: Plugin = {
      name: "failing",
      matches: () => true,
      async generate(ctx) {
        ctx.error("boom");
      },
    };

    await expect(
      runPluginGeneration(plugin, projectPath("src/note.txt"), contextOptions),
    ).rejects.toMatchObject({
      message: "boom",
      kind: "plugin",
    });
  });

  it("rejects when done() is not called", async () => {
    seed({ "src/note.txt": "hello" });

    const plugin: Plugin = {
      name: "hanging",
      matches: () => true,
      async generate() {},
    };

    await expect(
      Promise.race([
        runPluginGeneration(plugin, projectPath("src/note.txt"), contextOptions),
        new Promise((resolve) => {
          setTimeout(() => resolve("pending"), 50);
        }),
      ]),
    ).resolves.toBe("pending");
  });

  it("allows calling done() more than once", async () => {
    seed({ "src/note.txt": "hello" });

    const plugin: Plugin = {
      name: "double-done",
      matches: () => true,
      async generate(ctx) {
        await ctx.done();
        await ctx.done();
      },
    };

    await expect(
      runPluginGeneration(plugin, projectPath("src/note.txt"), contextOptions),
    ).resolves.toBeUndefined();
  });
});
