import { describe, expect, it, vi } from "vitest";
import * as buildModule from "../../src/build.js";
import { ImportTracker } from "../../src/import-tracker.js";
import type { BuildResult } from "../../src/build.js";
import type { Plugin } from "../../src/plugin.js";
import * as shadowModule from "../../src/shadow.js";
import { projectPath } from "../helpers/project.js";

const stubPlugin: Plugin = {
  name: "stub",
  matches(path) {
    return path.endsWith(".txt");
  },
  async generate(ctx) {
    await ctx.jsFile.write("export default {};\n");
    await ctx.done();
  },
};

const config = {
  sourceDir: "src",
  shadowDir: ".shadow",
  plugins: [stubPlugin],
};

const sourceDir = projectPath("src");
const shadowDir = projectPath(".shadow");

function buildResult(files: BuildResult["files"]): BuildResult {
  return {
    sourceDir,
    shadowDir,
    files,
    generated: files.flatMap((file) =>
      file.imports.map((imp) => imp.resolvedPath),
    ),
  };
}

describe("ImportTracker.fromBuildResult", () => {
  it("indexes sources, targets, and importer refs from a build result", () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
        {
          path: "card.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
      ]),
    );

    expect(tracker.sourceCount).toBe(2);
    expect(tracker.targetCount).toBe(1);
    expect(tracker.isImportTarget("note.txt")).toBe(true);
  });
});

describe("ImportTracker.isSource", () => {
  it("delegates to isSourceFile", () => {
    const tracker = new ImportTracker(config, sourceDir, shadowDir);

    expect(tracker.isSource("main.ts")).toBe(true);
    expect(tracker.isSource("note.txt")).toBe(false);
  });
});

describe("ImportTracker.isImportTarget", () => {
  it("returns true for tracked asset paths", () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
      ]),
    );

    expect(tracker.isImportTarget("note.txt")).toBe(true);
    expect(tracker.isImportTarget("other.txt")).toBe(false);
  });
});

describe("ImportTracker.sourceChanged", () => {
  it("returns false when relative imports are unchanged", async () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
      ]),
    );

    await expect(
      tracker.sourceChanged("main.ts", [
        { source: "./note.txt", resolvedPath: "note.txt" },
      ]),
    ).resolves.toBe(false);
  });

  it("removes shadow for dereferenced imports", async () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
      ]),
    );
    const removeSpy = vi
      .spyOn(shadowModule, "removeAssetShadow")
      .mockResolvedValue();

    await tracker.sourceChanged("main.ts", []);

    expect(removeSpy).toHaveBeenCalledWith(shadowDir, "note.txt");
    expect(tracker.isImportTarget("note.txt")).toBe(false);
    removeSpy.mockRestore();
  });

  it("generates shadow for newly referenced imports", async () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [],
        },
      ]),
    );
    const generateSpy = vi
      .spyOn(buildModule, "generateAsset")
      .mockResolvedValue();

    await tracker.sourceChanged("main.ts", [
      { source: "./note.txt", resolvedPath: "note.txt" },
    ]);

    expect(generateSpy).toHaveBeenCalledOnce();
    expect(tracker.isImportTarget("note.txt")).toBe(true);
    generateSpy.mockRestore();
  });

  it("ignores non-relative imports", async () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [],
        },
      ]),
    );
    const generateSpy = vi
      .spyOn(buildModule, "generateAsset")
      .mockResolvedValue();

    await tracker.sourceChanged("main.ts", [
      { source: "lodash", resolvedPath: "node_modules/lodash" },
    ]);

    expect(generateSpy).not.toHaveBeenCalled();
    expect(tracker.isImportTarget("node_modules/lodash")).toBe(false);
    generateSpy.mockRestore();
  });
});

describe("ImportTracker.sourceDeleted", () => {
  it("returns false for unknown sources", async () => {
    const tracker = new ImportTracker(config, sourceDir, shadowDir);

    await expect(tracker.sourceDeleted("missing.ts")).resolves.toBe(false);
  });

  it("removes shadow for imports only referenced by the deleted source", async () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
        {
          path: "card.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
      ]),
    );
    const removeSpy = vi
      .spyOn(shadowModule, "removeAssetShadow")
      .mockResolvedValue();

    await tracker.sourceDeleted("main.ts");

    expect(removeSpy).not.toHaveBeenCalled();
    expect(tracker.isImportTarget("note.txt")).toBe(true);

    await tracker.sourceDeleted("card.ts");

    expect(removeSpy).toHaveBeenCalledWith(shadowDir, "note.txt");
    removeSpy.mockRestore();
  });
});

describe("ImportTracker.importTargetChanged", () => {
  it("returns false for untracked paths", async () => {
    const tracker = new ImportTracker(config, sourceDir, shadowDir);

    await expect(tracker.importTargetChanged("missing.txt")).resolves.toBe(
      false,
    );
  });

  it("regenerates shadow for a changed asset", async () => {
    const tracker = ImportTracker.fromBuildResult(
      config,
      sourceDir,
      shadowDir,
      buildResult([
        {
          path: "main.ts",
          imports: [{ source: "./note.txt", resolvedPath: "note.txt" }],
        },
      ]),
    );
    const removeSpy = vi
      .spyOn(shadowModule, "removeAssetShadow")
      .mockResolvedValue();
    const generateSpy = vi
      .spyOn(buildModule, "generateAsset")
      .mockResolvedValue();

    await expect(tracker.importTargetChanged("note.txt")).resolves.toBe(true);

    expect(removeSpy).toHaveBeenCalledWith(shadowDir, "note.txt");
    expect(generateSpy).toHaveBeenCalledOnce();
    removeSpy.mockRestore();
    generateSpy.mockRestore();
  });
});
