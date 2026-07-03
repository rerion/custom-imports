import type { CustomImports } from "custom-imports";
import { resolveShadowImport as resolveShadowImportCore } from "custom-imports";

export interface ResolveShadowImportOptions {
  source: string;
  importer: string | undefined;
  api: CustomImports;
  esm: boolean;
}

export async function resolveShadowImport(
  options: ResolveShadowImportOptions,
): Promise<string | null> {
  const { source, importer, api, esm } = options;

  return resolveShadowImportCore({
    source,
    importer,
    sourceDir: api.sourceDir,
    shadowDir: api.shadowDir,
    esm,
    targetKind: (path) => api.targetKind(path),
  });
}
