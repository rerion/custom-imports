import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
    defineConfig,
    loadConfig,
    validateUserConfig,
} from "../../src/config.js";
import { importDefaultExportMock } from "../mocks/import-default-export.js";
import { projectPath, seed } from "../helpers/project.js";

const emptyPlugins = { sourceDir: "src", shadowDir: ".shadow", plugins: [] };
const configPath = projectPath("custom-imports.config.ts");

describe("defineConfig", () => {
    it("returns the config object unchanged", () => {
        const config = defineConfig(emptyPlugins);
        expect(config).toBe(emptyPlugins);
    });
});

describe("validateUserConfig", () => {
    it("accepts a valid config", () => {
        expect(validateUserConfig(emptyPlugins, configPath)).toEqual(
            emptyPlugins,
        );
    });

    it("rejects non-object values", () => {
        expect(() => validateUserConfig(42, configPath)).toThrow(
            "must default-export an object, got number",
        );
    });

    it("rejects null", () => {
        expect(() => validateUserConfig(null, configPath)).toThrow(
            "must default-export an object, got null",
        );
    });

    it("reports missing required fields", () => {
        expect(() => validateUserConfig({ sourceDir: "src" }, configPath)).toThrow(
            'missing required field "shadowDir"; missing required field "plugins"',
        );
    });

    it("reports wrong field types", () => {
        expect(() =>
            validateUserConfig(
                { sourceDir: 1, shadowDir: ".shadow", plugins: [] },
                configPath,
            ),
        ).toThrow('"sourceDir" must be a string, got number');
    });

    it("reports multiple validation problems in one error", () => {
        expect(() => validateUserConfig({}, configPath)).toThrow(
            'missing required field "sourceDir"; missing required field "shadowDir"; missing required field "plugins"',
        );
    });
});

describe("loadConfig", () => {
    it("compiles .ts configs and imports the default export from cache", async () => {
        seed({
            "custom-imports.config.ts": `export default {
  sourceDir: "src",
  shadowDir: ".shadow",
  plugins: [],
};`,
        });
        importDefaultExportMock.mockResolvedValue(emptyPlugins);

        const config = await loadConfig(projectPath("custom-imports.config.ts"));

        expect(config).toEqual(emptyPlugins);
        expect(importDefaultExportMock).toHaveBeenCalledWith(
            projectPath(".custom-imports/cache/custom-imports.config.ts.mjs"),
        );
        await expect(
            readFile(
                projectPath(".custom-imports/cache/custom-imports.config.ts.mjs"),
                "utf8",
            ),
        ).resolves.toContain("export default");
    });

    it("imports .mjs configs without compiling", async () => {
        const loaded = {
            sourceDir: "lib",
            shadowDir: ".output",
            plugins: [],
        };
        importDefaultExportMock.mockResolvedValue(loaded);

        const config = await loadConfig(projectPath("custom-imports.config.mjs"));

        expect(config).toEqual(loaded);
        expect(importDefaultExportMock).toHaveBeenCalledWith(
            projectPath("custom-imports.config.mjs"),
        );
    });

    it("rejects unsupported file extensions", async () => {
        await expect(
            loadConfig(projectPath("custom-imports.config.json")),
        ).rejects.toThrow('Unsupported config format ".json"');
        expect(importDefaultExportMock).not.toHaveBeenCalled();
    });
});
