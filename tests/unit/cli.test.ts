import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_CONFIG,
  initConfig,
  parseCliArgs,
  printHelp,
} from "../../src/cli.js";
import { projectPath, ensureProjectRoot } from "../helpers/project.js";

describe("parseCliArgs", () => {
  it("uses default config path when --config is omitted", () => {
    const options = parseCliArgs([]);

    expect(options.configPath).toBe(resolve("custom-imports.config.ts"));
    expect(options.watch).toBe(false);
    expect(options.init).toBe(false);
    expect(options.help).toBe(false);
  });

  it("resolves --config to an absolute path", () => {
    const options = parseCliArgs(["--config", "other.config.ts"]);

    expect(options.configPath).toBe(resolve("other.config.ts"));
  });

  it("parses --watch", () => {
    expect(parseCliArgs(["--watch"]).watch).toBe(true);
  });

  it("parses -h and --help", () => {
    expect(parseCliArgs(["-h"]).help).toBe(true);
    expect(parseCliArgs(["--help"]).help).toBe(true);
  });

  it("parses --init", () => {
    expect(parseCliArgs(["--init"]).init).toBe(true);
  });

  it("rejects --init combined with --watch", () => {
    expect(() => parseCliArgs(["--init", "--watch"])).toThrow(
      "--init cannot be combined with other options",
    );
  });

  it("rejects --init combined with --config", () => {
    expect(() => parseCliArgs(["--init", "--config", "foo.ts"])).toThrow(
      "--init cannot be combined with other options",
    );
  });

  it("rejects unknown options (strict parsing)", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow("Unknown option");
  });
});

describe("initConfig", () => {
  it("writes the default config template when the file does not exist", async () => {
    ensureProjectRoot();
    const configPath = projectPath("custom-imports.config.ts");

    await initConfig(configPath);

    await expect(readFile(configPath, "utf8")).resolves.toBe(EMPTY_CONFIG);
  });

  it("rejects when the config file already exists", async () => {
    ensureProjectRoot();
    const configPath = projectPath("custom-imports.config.ts");
    await initConfig(configPath);

    await expect(initConfig(configPath)).rejects.toThrow(
      "Config file already exists",
    );
  });
});

describe("printHelp", () => {
  it("prints usage and option descriptions", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    printHelp();

    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).toContain("Usage: custom-imports");
    expect(log.mock.calls[0]![0]).toContain("--watch");
    expect(log.mock.calls[0]![0]).toContain("--init");

    log.mockRestore();
  });
});
