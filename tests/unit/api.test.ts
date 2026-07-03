import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCustomImports } from "../../src/api.js";
import type { Plugin } from "../../src/plugin.js";
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

const config = {
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

describe("createCustomImports", () => {
  it("exposes resolved source and shadow directories", () => {
    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    expect(api.sourceDir).toBe(projectPath("src"));
    expect(api.shadowDir).toBe(projectPath(".shadow"));
  });

  it("extractImports returns resolved imports for a source file", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await expect(api.extractImports("main.ts")).resolves.toEqual([
      { source: "./note.txt", resolvedPath: "note.txt" },
    ]);
  });

  it("canHandle reports whether a plugin matches a target path", async () => {
    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await expect(api.canHandle("note.txt")).resolves.toBe(true);
    await expect(api.canHandle("logo.svg")).resolves.toBe(false);
  });

  it("regenerateImport cleans and generates shadow output", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
      "src/note.txt": "hello\n",
      ".shadow/note.txt.js": "stale\n",
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await api.regenerateImport("note.txt");

    await expect(
      readFile(projectPath(".shadow/note.txt.js"), "utf8"),
    ).resolves.toBe("export default {};\n");
  });

  it("cleanImport is idempotent", async () => {
    seed({
      ".shadow/note.txt.js": "js\n",
      ".shadow/note.txt.d.ts": "dts\n",
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await api.cleanImport("note.txt");
    await api.cleanImport("note.txt");

    await expect(exists(projectPath(".shadow/note.txt.js"))).resolves.toBe(
      false,
    );
  });

  it("cleanAll removes the shadow directory", async () => {
    seed({
      ".shadow/note.txt.js": "js\n",
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await api.cleanAll();

    await expect(exists(projectPath(".shadow"))).resolves.toBe(false);
  });
});

describe("extractImports", () => {
  it("strips .js suffixes in esm mode", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt.js";\n',
    });

    const api = createCustomImports({
      config: { ...config, esm: true },
      projectRoot: projectPath(),
    });

    await expect(api.extractImports("main.ts")).resolves.toEqual([
      { source: "./note.txt.js", resolvedPath: "note.txt" },
    ]);
  });

  it("rejects non-TypeScript source paths", async () => {
    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await expect(api.extractImports("note.txt")).rejects.toThrow(
      "Not a TypeScript source file",
    );
  });

  it("returns multiple resolved imports in source order", async () => {
    seed({
      "src/main.ts": [
        'import note from "./note.txt";',
        'import banner from "./assets/banner.txt";',
        "",
      ].join("\n"),
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await expect(api.extractImports("main.ts")).resolves.toEqual([
      { source: "./note.txt", resolvedPath: "note.txt" },
      { source: "./assets/banner.txt", resolvedPath: "assets/banner.txt" },
    ]);
  });
});

describe("regenerateImport", () => {
  it("no-ops when no plugin handles the target", async () => {
    seed({
      "src/main.ts": 'import logo from "./logo.svg";\n',
      "src/logo.svg": "<svg />",
      ".shadow/logo.svg.js": "stale\n",
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await api.regenerateImport("logo.svg");

    await expect(
      readFile(projectPath(".shadow/logo.svg.js"), "utf8"),
    ).resolves.toBe("stale\n");
  });

  it("throws when the target has no importer", async () => {
    seed({
      "src/note.txt": "hello\n",
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await expect(api.regenerateImport("note.txt")).rejects.toThrow(
      "No importer found for import target: note.txt",
    );
  });

  it("finds importers in nested source files", async () => {
    seed({
      "src/components/card.ts": 'import note from "./note.txt";\n',
      "src/components/note.txt": "card copy\n",
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await api.regenerateImport("components/note.txt");

    await expect(
      readFile(projectPath(".shadow/components/note.txt.js"), "utf8"),
    ).resolves.toBe("export default {};\n");
  });
});

describe("cleanImport", () => {
  it("removes sidecar assets listed in the .assets manifest", async () => {
    seed({
      ".shadow/widgets.count.js": "js\n",
      ".shadow/widgets.count.d.ts": "dts\n",
      ".shadow/widgets.count.assets": "assets/widgets.1.asset\nassets/widgets.2.asset\n",
      ".shadow/assets/widgets.1.asset": "one\n",
      ".shadow/assets/widgets.2.asset": "two\n",
    });

    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await api.cleanImport("widgets.count");

    await expect(
      exists(projectPath(".shadow/assets/widgets.1.asset")),
    ).resolves.toBe(false);
    await expect(
      exists(projectPath(".shadow/assets/widgets.2.asset")),
    ).resolves.toBe(false);
    await expect(exists(projectPath(".shadow/widgets.count.js"))).resolves.toBe(
      false,
    );
  });
});

describe("cleanAll", () => {
  it("is idempotent when the shadow directory is already missing", async () => {
    const api = createCustomImports({
      config,
      projectRoot: projectPath(),
    });

    await api.cleanAll();
    await api.cleanAll();

    await expect(exists(projectPath(".shadow"))).resolves.toBe(false);
  });
});
