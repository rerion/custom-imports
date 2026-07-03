import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as configModule from "../../src/config.js";
import {
  build,
  buildProject,
  findMatchingPlugin,
  generateAsset,
  getProjectPaths,
  isRelativeImport,
  isSourceFile,
  resolveImportPath,
  resolveImports,
  stripEsmImportSuffix,
} from "../../src/build.js";
import type { Plugin } from "../../src/plugin.js";
import * as contextModule from "../../src/context.js";
import { importDefaultExportMock } from "../mocks/import-default-export.js";
import { projectPath, seed } from "../helpers/project.js";

const stubPlugin: Plugin = {
  name: "stub",
  matches(path) {
    return path.endsWith(".txt");
  },
  async generate(ctx) {
    await ctx.jsFile.write("export default {};\n");
    await ctx.dtsFile.write("declare const value: string;\n");
    await ctx.done();
  },
};

const testConfig = {
  sourceDir: "src",
  shadowDir: ".shadow",
  plugins: [stubPlugin],
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("getProjectPaths", () => {
  it("resolves sourceDir and shadowDir relative to the config file directory", () => {
    const configPath = projectPath("custom-imports.config.ts");

    expect(getProjectPaths(configPath, testConfig)).toEqual({
      projectRoot: projectPath(),
      sourceDir: projectPath("src"),
      shadowDir: projectPath(".shadow"),
    });
  });
});

describe("resolveImportPath", () => {
  it("resolves sibling-relative specifiers", () => {
    expect(resolveImportPath("src/components/card.ts", "./note.txt")).toBe(
      "src/components/note.txt",
    );
  });

  it("resolves parent-relative specifiers", () => {
    expect(
      resolveImportPath("src/components/Hero.ts", "../assets/banner.txt"),
    ).toBe("src/assets/banner.txt");
  });

  it("resolves nested relative paths", () => {
    expect(
      resolveImportPath("src/main.ts", "./assets/copy/sidebar.txt"),
    ).toBe("src/assets/copy/sidebar.txt");
  });

  it("returns project-relative posix paths", () => {
    expect(resolveImportPath("src/a/b/c.ts", "../../data/deep.txt")).toBe(
      "src/data/deep.txt",
    );
  });
});

describe("resolveImports", () => {
  it("maps specifiers to { source, resolvedPath } pairs", () => {
    expect(resolveImports("src/main.ts", ["./greeting.txt"])).toEqual([
      { source: "./greeting.txt", resolvedPath: "src/greeting.txt" },
    ]);
  });

  it("preserves specifier order", () => {
    expect(
      resolveImports("src/main.ts", ["./a.txt", "./b.txt", "../c.txt"]),
    ).toEqual([
      { source: "./a.txt", resolvedPath: "src/a.txt" },
      { source: "./b.txt", resolvedPath: "src/b.txt" },
      { source: "../c.txt", resolvedPath: "c.txt" },
    ]);
  });

  it("strips .js and .mjs suffixes from relative imports in esm mode", () => {
    expect(
      resolveImports("src/main.ts", ["./greeting.txt.js"], true),
    ).toEqual([
      { source: "./greeting.txt.js", resolvedPath: "src/greeting.txt" },
    ]);

    expect(
      resolveImports("src/main.ts", ["./assets/copy/sidebar.txt.mjs"], true),
    ).toEqual([
      {
        source: "./assets/copy/sidebar.txt.mjs",
        resolvedPath: "src/assets/copy/sidebar.txt",
      },
    ]);
  });

  it("does not strip suffixes from relative imports when esm mode is off", () => {
    expect(
      resolveImports("src/main.ts", ["./greeting.txt.js"], false),
    ).toEqual([
      { source: "./greeting.txt.js", resolvedPath: "src/greeting.txt.js" },
    ]);
  });

  it("does not strip suffixes from bare specifiers in esm mode", () => {
    expect(resolveImports("src/main.ts", ["lodash"], true)).toEqual([
      { source: "lodash", resolvedPath: "src/lodash" },
    ]);
  });
});

describe("stripEsmImportSuffix", () => {
  it("strips .js and .mjs suffixes", () => {
    expect(stripEsmImportSuffix("assets/logo.svg.js")).toBe("assets/logo.svg");
    expect(stripEsmImportSuffix("assets/widgets.count.mjs")).toBe(
      "assets/widgets.count",
    );
    expect(stripEsmImportSuffix("greeting.txt")).toBe("greeting.txt");
  });
});

describe("isRelativeImport", () => {
  it("returns true for ./ and ../ specifiers", () => {
    expect(isRelativeImport("./foo")).toBe(true);
    expect(isRelativeImport("../bar")).toBe(true);
  });

  it("returns false for bare and absolute specifiers", () => {
    expect(isRelativeImport("lodash")).toBe(false);
    expect(isRelativeImport("/abs/path")).toBe(false);
  });
});

describe("isSourceFile", () => {
  it("returns true for .ts and .tsx", () => {
    expect(isSourceFile("main.ts")).toBe(true);
    expect(isSourceFile("view.tsx")).toBe(true);
  });

  it("returns false for other extensions", () => {
    expect(isSourceFile("readme.md")).toBe(false);
    expect(isSourceFile("asset.txt")).toBe(false);
  });
});

describe("findMatchingPlugin", () => {
  it("returns the first plugin whose matches() returns true", async () => {
    const first: Plugin = {
      name: "first",
      matches: () => true,
      generate: async () => {},
    };
    const second: Plugin = {
      name: "second",
      matches: () => true,
      generate: async () => {},
    };

    await expect(
      findMatchingPlugin([first, second], "src/a.txt", projectPath("src")),
    ).resolves.toBe(first);
  });

  it("returns undefined when no plugin matches", async () => {
    await expect(
      findMatchingPlugin([stubPlugin], "src/logo.svg", projectPath("src")),
    ).resolves.toBeUndefined();
  });
});

describe("generateAsset", () => {
  it("skips generation when no plugin matches", async () => {
    const spy = vi.spyOn(contextModule, "runPluginGeneration");

    await generateAsset(
      { ...testConfig, plugins: [] },
      projectPath("src"),
      projectPath(".shadow"),
      {
        import: { source: "./note.txt", resolvedPath: "note.txt" },
        importer: "card.ts",
      },
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("runs plugin generation when a plugin matches", async () => {
    seed({ "src/note.txt": "hello" });
    const spy = vi.spyOn(contextModule, "runPluginGeneration");

    await generateAsset(
      testConfig,
      projectPath("src"),
      projectPath(".shadow"),
      {
        import: { source: "./note.txt", resolvedPath: "note.txt" },
        importer: "card.ts",
      },
    );

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe("build", () => {
  it("walks source files and parses imports", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
      "src/lib/util.ts": "export const x = 1;\n",
    });

    const result = await build(projectPath("custom-imports.config.ts"), {
      ...testConfig,
      plugins: [],
    });

    expect(result.files).toHaveLength(2);
    expect(result.files.find((file) => file.path === "main.ts")?.imports).toEqual(
      [{ source: "./note.txt", resolvedPath: "note.txt" }],
    );
  });

  it("deduplicates assets by resolvedPath", async () => {
    seed({
      "src/a.ts": 'import note from "./shared.txt";\n',
      "src/b.ts": 'import note from "./shared.txt";\n',
      "src/shared.txt": "hello\n",
    });

    const result = await build(
      projectPath("custom-imports.config.ts"),
      testConfig,
    );

    expect(result.generated).toEqual(["shared.txt"]);
  });

  it("clears shadowDir before generating", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
      "src/note.txt": "hello\n",
      ".shadow/stale.txt.js": "stale\n",
    });

    await build(projectPath("custom-imports.config.ts"), testConfig);

    await expect(
      exists(projectPath(".shadow/stale.txt.js")),
    ).resolves.toBe(false);
    await expect(
      exists(projectPath(".shadow/note.txt.js")),
    ).resolves.toBe(true);
  });

  it("generates shadow output for matched assets", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
      "src/note.txt": "hello\n",
    });

    const result = await build(projectPath("custom-imports.config.ts"), testConfig);

    expect(result.generated).toEqual(["note.txt"]);
    await expect(
      readFile(projectPath(".shadow/note.txt.js"), "utf8"),
    ).resolves.toContain("export default");
  });
});

describe("buildProject", () => {
  it("loads config and runs build", async () => {
    seed({
      "src/main.ts": "export const x = 1;\n",
    });
    importDefaultExportMock.mockResolvedValue({
      sourceDir: "src",
      shadowDir: ".shadow",
      plugins: [],
    });

    const result = await buildProject(projectPath("custom-imports.config.mjs"));

    expect(result.files).toHaveLength(1);
  });

  it("logs build summary and import lines", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
      "src/note.txt": "hello\n",
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const loadSpy = vi
      .spyOn(configModule, "loadConfig")
      .mockResolvedValue(testConfig);

    await buildProject(projectPath("custom-imports.config.ts"));

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/build \(.*1 files, 1 generated\)/),
    );
    expect(log).toHaveBeenCalledWith("  main.ts: note.txt");
    expect(log).toHaveBeenCalledWith("  generated note.txt");

    log.mockRestore();
    loadSpy.mockRestore();
  });
});
