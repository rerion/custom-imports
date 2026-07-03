import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import * as configModule from "../../src/config.js";
import { mergeProject } from "../../src/merge.js";
import { projectPath, seed } from "../helpers/project.js";

const testConfig = {
  sourceDir: "src",
  shadowDir: ".shadow",
  plugins: [],
};

describe("mergeProject", () => {
  it("merges shadow files into the source directory", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
      "src/note.txt": "hello\n",
      ".shadow/note.txt.js": `export default ${JSON.stringify(projectPath(".shadow/note.txt"))};\n`,
      ".shadow/note.txt.d.ts": "declare const value: string;\n",
    });

    const loadSpy = vi
      .spyOn(configModule, "loadConfig")
      .mockResolvedValue(testConfig);

    const fileCount = await mergeProject(projectPath("custom-imports.config.ts"));

    expect(fileCount).toBe(2);
    await expect(
      readFile(projectPath("src/note.txt.js"), "utf8"),
    ).resolves.toBe(
      `export default ${JSON.stringify(projectPath("src/note.txt"))};\n`,
    );
    await expect(
      readFile(projectPath("src/note.txt.d.ts"), "utf8"),
    ).resolves.toBe("declare const value: string;\n");
    await expect(readFile(projectPath("src/main.ts"), "utf8")).resolves.toContain(
      'import note from "./note.txt"',
    );

    loadSpy.mockRestore();
  });

  it("merges source and shadow into --into without changing source", async () => {
    seed({
      "src/main.ts": 'import note from "./note.txt";\n',
      "src/note.txt": "hello\n",
      ".shadow/note.txt.js": "export default {};\n",
    });

    const loadSpy = vi
      .spyOn(configModule, "loadConfig")
      .mockResolvedValue(testConfig);

    await mergeProject(projectPath("custom-imports.config.ts"), "dist");

    await expect(readFile(projectPath("dist/main.ts"), "utf8")).resolves.toContain(
      'import note from "./note.txt"',
    );
    await expect(
      readFile(projectPath("dist/note.txt.js"), "utf8"),
    ).resolves.toBe("export default {};\n");
    await expect(
      readFile(projectPath("src/note.txt.js"), "utf8"),
    ).rejects.toThrow();

    loadSpy.mockRestore();
  });

  it("rejects when the shadow directory is missing", async () => {
    seed({
      "src/main.ts": "export const x = 1;\n",
    });

    const loadSpy = vi
      .spyOn(configModule, "loadConfig")
      .mockResolvedValue(testConfig);

    await expect(
      mergeProject(projectPath("custom-imports.config.ts")),
    ).rejects.toThrow("Shadow directory does not exist");

    loadSpy.mockRestore();
  });
});
