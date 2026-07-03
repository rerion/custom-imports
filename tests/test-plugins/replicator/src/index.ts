import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Plugin } from "custom-imports";

export function replicator(): Plugin {
  return {
    name: "replicator",

    matches(path) {
      return path.endsWith(".count");
    },

    async generate(ctx) {
      const raw = (await readFile(ctx.path, "utf8")).trim();
      const count = Number(raw);

      if (!Number.isInteger(count) || count <= 0) {
        ctx.error(
          `Expected a positive integer in ${basename(ctx.path)}, got ${raw}`,
        );
      }

      const baseName = basename(ctx.path, ".count");
      const paths: string[] = [];

      for (let index = 1; index <= count; index++) {
        const asset = await ctx.newAssetFile(`${baseName}.${index}.asset`);
        await asset.write(`replica ${index}\n`);
        paths.push(asset.path);
      }

      await ctx.jsFile.write(`export default ${JSON.stringify(paths)};\n`);
      await ctx.dtsFile.write(
        `declare const value: readonly string[];\nexport default value;\n`,
      );
      await ctx.done();
    },
  };
}
