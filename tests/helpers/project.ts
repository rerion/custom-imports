import { dirname } from "node:path";
import { vol } from "memfs";

export const PROJECT_ROOT = "/project";

export function ensureProjectRoot(): void {
  vol.mkdirSync(PROJECT_ROOT, { recursive: true });
}

export function seed(files: Record<string, string>): void {
  ensureProjectRoot();

  for (const [path, content] of Object.entries(files)) {
    const absolute = path.startsWith("/") ? path : `${PROJECT_ROOT}/${path}`;
    vol.mkdirSync(dirname(absolute), { recursive: true });
    vol.writeFileSync(absolute, content);
  }
}

export function projectPath(relativePath = ""): string {
  return relativePath
    ? `${PROJECT_ROOT}/${relativePath}`
    : PROJECT_ROOT;
}
