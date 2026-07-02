import { access, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function shadowPaths(shadowDir: string, resolvedPath: string) {
  const shadowBase = join(shadowDir, resolvedPath);
  return {
    shadowBase,
    jsPath: `${shadowBase}.js`,
    dtsPath: `${shadowBase}.d.ts`,
    assetsPath: `${shadowBase}.assets`,
  };
}

export async function removeAssetShadow(
  shadowDir: string,
  resolvedPath: string,
): Promise<void> {
  const { jsPath, dtsPath, assetsPath, shadowBase } = shadowPaths(
    shadowDir,
    resolvedPath,
  );
  const assetOutputDir = dirname(shadowBase);

  if (await fileExists(assetsPath)) {
    const contents = await readFile(assetsPath, "utf8");

    for (const line of contents.split("\n")) {
      const relativePath = line.trim();
      if (!relativePath) {
        continue;
      }

      await rm(join(assetOutputDir, relativePath), { force: true });
    }
  }

  await rm(jsPath, { force: true });
  await rm(dtsPath, { force: true });
  await rm(assetsPath, { force: true });
}
