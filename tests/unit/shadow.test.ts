import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { removeAssetShadow, shadowPaths } from "../../src/shadow.js";
import { projectPath, seed } from "../helpers/project.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("shadowPaths", () => {
  it("derives .js, .d.ts, and .assets paths from shadowDir and resolvedPath", () => {
    expect(shadowPaths("/shadow", "note.txt")).toEqual({
      shadowBase: join("/shadow", "note.txt"),
      jsPath: join("/shadow", "note.txt.js"),
      dtsPath: join("/shadow", "note.txt.d.ts"),
      assetsPath: join("/shadow", "note.txt.assets"),
    });
  });
});

describe("removeAssetShadow", () => {
  it("deletes .js, .d.ts, and .assets files", async () => {
    const shadowDir = projectPath(".shadow");
    const resolvedPath = "note.txt";
    const paths = shadowPaths(shadowDir, resolvedPath);

    seed({
      [paths.jsPath.replace(`${projectPath()}/`, "")]: "js",
      [paths.dtsPath.replace(`${projectPath()}/`, "")]: "dts",
      [paths.assetsPath.replace(`${projectPath()}/`, "")]: "",
    });

    await removeAssetShadow(shadowDir, resolvedPath);

    await expect(exists(paths.jsPath)).resolves.toBe(false);
    await expect(exists(paths.dtsPath)).resolves.toBe(false);
    await expect(exists(paths.assetsPath)).resolves.toBe(false);
  });

  it("deletes asset files listed in the .assets manifest", async () => {
    const shadowDir = projectPath(".shadow");
    const resolvedPath = "logo.svg";
    const paths = shadowPaths(shadowDir, resolvedPath);
    const copiedAsset = join(dirname(paths.shadowBase), "copy/logo.svg");

    seed({
      [paths.jsPath.replace(`${projectPath()}/`, "")]: "js",
      [paths.dtsPath.replace(`${projectPath()}/`, "")]: "dts",
      [paths.assetsPath.replace(`${projectPath()}/`, "")]: "copy/logo.svg\n",
      [copiedAsset.replace(`${projectPath()}/`, "")]: "bytes",
    });

    await removeAssetShadow(shadowDir, resolvedPath);

    await expect(exists(copiedAsset)).resolves.toBe(false);
    await expect(exists(paths.jsPath)).resolves.toBe(false);
  });

  it("no-ops when shadow files are missing", async () => {
    await expect(
      removeAssetShadow(projectPath(".shadow"), "missing.txt"),
    ).resolves.toBeUndefined();
  });
});
