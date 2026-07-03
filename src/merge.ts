import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { getProjectPaths } from "./build.js";
import { loadConfig } from "./config.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(directory: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const files: string[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function isTextFile(path: string): boolean {
  return !/\.(png|jpg|jpeg|gif|webp|ico)$/i.test(path);
}

function rewriteShadowPaths(
  content: string,
  shadowDir: string,
  targetDir: string,
): string {
  return content.replaceAll(resolve(shadowDir), resolve(targetDir));
}

export async function mergeProject(
  configPath: string,
  into?: string,
): Promise<number> {
  const config = await loadConfig(configPath);
  const { sourceDir, shadowDir, projectRoot } = getProjectPaths(
    configPath,
    config,
  );

  if (!(await fileExists(shadowDir))) {
    throw new Error(`Shadow directory does not exist: ${shadowDir}`);
  }

  const targetDir = into ? resolve(projectRoot, into) : sourceDir;

  if (into) {
    await cp(sourceDir, targetDir, { recursive: true });
  }

  const shadowFiles = await walkFiles(shadowDir);

  for (const filePath of shadowFiles) {
    const relativePath = relative(shadowDir, filePath);
    const destination = join(targetDir, relativePath);

    await mkdir(dirname(destination), { recursive: true });

    if (isTextFile(filePath)) {
      const content = await readFile(filePath, "utf8");
      await writeFile(
        destination,
        rewriteShadowPaths(content, shadowDir, targetDir),
        "utf8",
      );
      continue;
    }

    await cp(filePath, destination);
  }

  return shadowFiles.length;
}

export async function mergeProjectWithLog(
  configPath: string,
  into?: string,
): Promise<void> {
  const fileCount = await mergeProject(configPath, into);

  console.log(
    into
      ? `merge (${configPath}, ${fileCount} files, into ${into})`
      : `merge (${configPath}, ${fileCount} files)`,
  );
}
