import { describe, expect, it } from "vitest";
import type { CustomImports, TargetKind } from "custom-imports";
import { resolveShadowImport } from "../../packages/vite/src/resolve.js";

function createApi(options: {
  esm?: boolean;
  targetKind?: (path: string) => TargetKind;
} = {}): CustomImports {
  const targetKind = options.targetKind ?? ((path) =>
    path.endsWith(".txt") ? "js" : "none");

  return {
    sourceDir: "/project/src",
    shadowDir: "/project/.shadow",
    esm: options.esm ?? false,
    build: async () => {},
    extractImports: async () => [],
    syncSource: async () => false,
    syncSourceRemoved: async () => false,
    regenerateTarget: async () => {},
    cleanImport: async () => {},
    cleanAll: async () => {},
    targetKind: async (path) => targetKind(path),
  };
}

describe("resolveShadowImport", () => {
  it("resolves relative asset imports to shadow modules", async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt",
        importer: "/project/src/main.ts",
        api: createApi(),
        esm: false,
      }),
    ).resolves.toBe("/project/.shadow/message.txt.js");
  });

  it("resolves nested importers", async () => {
    await expect(
      resolveShadowImport({
        source: "./note.txt",
        importer: "/project/src/components/card.ts",
        api: createApi(),
        esm: false,
      }),
    ).resolves.toBe("/project/.shadow/components/note.txt.js");
  });

  it("strips ESM suffixes when esm is enabled", async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt.js",
        importer: "/project/src/main.ts",
        api: createApi({ esm: true }),
        esm: true,
      }),
    ).resolves.toBe("/project/.shadow/message.txt.js");
  });

  it("returns null for imports outside sourceDir", async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt",
        importer: "/project/lib/main.ts",
        api: createApi(),
        esm: false,
      }),
    ).resolves.toBeNull();
  });

  it("returns null for unhandled asset types", async () => {
    await expect(
      resolveShadowImport({
        source: "./logo.svg",
        importer: "/project/src/main.ts",
        api: createApi(),
        esm: false,
      }),
    ).resolves.toBeNull();
  });

  it("returns null for bare specifiers", async () => {
    await expect(
      resolveShadowImport({
        source: "react",
        importer: "/project/src/main.ts",
        api: createApi(),
        esm: false,
      }),
    ).resolves.toBeNull();
  });

  it('returns null when targetKind is "assets"', async () => {
    await expect(
      resolveShadowImport({
        source: "./message.txt",
        importer: "/project/src/main.ts",
        api: createApi({
          targetKind: (path) => (path.endsWith(".txt") ? "assets" : "none"),
        }),
        esm: false,
      }),
    ).resolves.toBeNull();
  });
});
