import { describe, expect, it } from "vitest";
import type { TargetKind } from "custom-imports";
import { resolveShadowImport } from "../../src/resolve-import.js";

function createOptions(options: {
  esm?: boolean;
  targetKind?: (path: string) => TargetKind;
} = {}) {
  const targetKind = options.targetKind ?? ((path) =>
    path.endsWith(".txt") ? "js" : "none");

  return {
    sourceDir: "/project/src",
    shadowDir: "/project/.shadow",
    esm: options.esm ?? false,
    targetKind: async (path: string) => targetKind(path),
  };
}

describe("resolveShadowImport", () => {
  it("resolves relative asset imports to shadow modules", async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt",
        importer: "/project/src/main.ts",
        ...createOptions(),
      }),
    ).resolves.toBe("/project/.shadow/message.txt.js");
  });

  it("resolves nested importers", async () => {
    await expect(
      resolveShadowImport({
        source: "./note.txt",
        importer: "/project/src/components/card.ts",
        ...createOptions(),
      }),
    ).resolves.toBe("/project/.shadow/components/note.txt.js");
  });

  it("strips ESM suffixes when esm is enabled", async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt.js",
        importer: "/project/src/main.ts",
        ...createOptions({ esm: true }),
      }),
    ).resolves.toBe("/project/.shadow/message.txt.js");
  });

  it("returns null for imports outside sourceDir", async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt",
        importer: "/project/lib/main.ts",
        ...createOptions(),
      }),
    ).resolves.toBeNull();
  });

  it("returns null for unhandled asset types", async () => {
    await expect(
      resolveShadowImport({
        source: "./logo.svg",
        importer: "/project/src/main.ts",
        ...createOptions(),
      }),
    ).resolves.toBeNull();
  });

  it("returns null for bare specifiers", async () => {
    await expect(
      resolveShadowImport({
        source: "react",
        importer: "/project/src/main.ts",
        ...createOptions(),
      }),
    ).resolves.toBeNull();
  });

  it('returns null when targetKind is "assets"', async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt",
        importer: "/project/src/main.ts",
        ...createOptions({
          targetKind: (path) => (path.endsWith(".txt") ? "assets" : "none"),
        }),
      }),
    ).resolves.toBeNull();
  });
});

describe("relativePathInDir", () => {
  it("returns a relative path when file is inside dir", async () => {
    const { relativePathInDir } = await import("../../src/build.js");

    expect(relativePathInDir("/project/src/nested/main.ts", "/project/src")).toBe(
      "nested/main.ts",
    );
    expect(relativePathInDir("/project/src", "/project/src")).toBe("");
    expect(relativePathInDir("/project/lib/main.ts", "/project/src")).toBeNull();
  });
});
