import { describe, expect, it } from "vitest";
import { PluginError } from "../../src/plugin.js";

describe("PluginError", () => {
  it("sets name, message, and error details", () => {
    const error = new PluginError("boom", {
      pluginName: "test",
      importer: "src/main.ts",
      source: "./asset.txt",
      resolvedPath: "src/asset.txt",
      kind: "plugin",
    });

    expect(error.name).toBe("PluginError");
    expect(error.message).toBe("boom");
    expect(error).toBeInstanceOf(Error);
  });

  it("includes pluginName, importer, source, resolvedPath, and kind", () => {
    const details = {
      pluginName: "image-copy",
      importer: "src/card.ts",
      source: "./logo.svg",
      resolvedPath: "src/logo.svg",
      kind: "internal" as const,
    };
    const error = new PluginError("failed", details);

    expect(error.pluginName).toBe(details.pluginName);
    expect(error.importer).toBe(details.importer);
    expect(error.source).toBe(details.source);
    expect(error.resolvedPath).toBe(details.resolvedPath);
    expect(error.kind).toBe("internal");
  });
});
