import { readFile } from "node:fs/promises";
import type { Plugin } from "custom-imports";

export function textWithLength(): Plugin {
  return {
    name: "text-with-length",

    matches(path) {
      return path.endsWith(".txt");
    },

    async generate(ctx) {
      const content = await readFile(ctx.path, "utf8");
      const length = content.length;

      await ctx.jsFile.write(
        `export default { content: ${JSON.stringify(content)}, length: ${length} };\n`,
      );
      await ctx.dtsFile.write(
        `declare const value: {\n  readonly content: string;\n  readonly length: ${length};\n};\nexport default value;\n`,
      );
      await ctx.done();
    },
  };
}
