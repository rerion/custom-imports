import { describe, expect, it } from "vitest";
import {
  extractImportSpecifiers,
  getParserSession,
  parseImportSpecifiers,
} from "../../src/parse-imports.js";

async function specifiersFromSource(
  filePath: string,
  source: string,
): Promise<string[]> {
  const { parser, typescript, tsx } = await getParserSession();
  parser.setLanguage(filePath.endsWith(".tsx") ? tsx : typescript);
  const tree = parser.parse(source);
  expect(tree).not.toBeNull();
  const specifiers = extractImportSpecifiers(tree!);
  tree!.delete();
  return specifiers;
}

describe("extractImportSpecifiers", () => {
  it("extracts default import specifiers", async () => {
    await expect(
      specifiersFromSource("input.ts", 'import greeting from "./greeting.txt";'),
    ).resolves.toEqual(["./greeting.txt"]);
  });

  it("extracts named import specifiers", async () => {
    await expect(
      specifiersFromSource(
        "input.ts",
        'import { format, parse } from "./lib/format";',
      ),
    ).resolves.toEqual(["./lib/format"]);
  });

  it("extracts namespace import specifiers", async () => {
    await expect(
      specifiersFromSource("input.ts", 'import * as assets from "./assets";'),
    ).resolves.toEqual(["./assets"]);
  });

  it("extracts side-effect import specifiers", async () => {
    await expect(
      specifiersFromSource("input.ts", 'import "./side-effect";'),
    ).resolves.toEqual(["./side-effect"]);
  });

  it("extracts multiple import statements in source order", async () => {
    const source = [
      'import greeting from "./greeting.txt";',
      'import banner from "./assets/banner.txt";',
      'import { format } from "./lib/format";',
    ].join("\n");

    await expect(specifiersFromSource("input.ts", source)).resolves.toEqual([
      "./greeting.txt",
      "./assets/banner.txt",
      "./lib/format",
    ]);
  });

  it("returns an empty list when there are no imports", async () => {
    await expect(
      specifiersFromSource("input.ts", "export const value = 1;\n"),
    ).resolves.toEqual([]);
  });

  it("handles single-quoted specifiers", async () => {
    await expect(
      specifiersFromSource("input.ts", "import greeting from './greeting.txt';"),
    ).resolves.toEqual(["./greeting.txt"]);
  });

  it("ignores dynamic import()", async () => {
    await expect(
      specifiersFromSource(
        "input.ts",
        'const module = await import("./dynamic.txt");',
      ),
    ).resolves.toEqual([]);
  });

  it("ignores export … from re-exports", async () => {
    await expect(
      specifiersFromSource(
        "input.ts",
        'export { greeting } from "./greeting.txt";',
      ),
    ).resolves.toEqual([]);
  });
});

describe("parseImportSpecifiers", () => {
  it("parses .ts sources with the TypeScript grammar", async () => {
    await expect(
      parseImportSpecifiers("main.ts", 'import note from "./note.txt";'),
    ).resolves.toEqual(["./note.txt"]);
  });

  it("parses .tsx sources with the TSX grammar", async () => {
    const source = [
      'import avatar from "./avatar.svg";',
      "export function Hero() {",
      "  return <img src={avatar} />;",
      "}",
    ].join("\n");

    await expect(parseImportSpecifiers("Hero.tsx", source)).resolves.toEqual([
      "./avatar.svg",
    ]);
  });
});
