import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Plugin } from "custom-imports";

const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
] as const;

export function imageCopy(): Plugin {
  return {
    matches(path) {
      return IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension));
    },

    async generate(ctx) {
      const data = await readFile(ctx.path);
      const asset = ctx.newAssetFile(basename(ctx.path));
      await asset.write(data);
      await ctx.jsFile.write(
        `export default ${JSON.stringify(asset.path)};\n`,
      );
      await ctx.dtsFile.write(
        `declare const value: string;\nexport default value;\n`,
      );
      await ctx.done();
    },
  };
}
