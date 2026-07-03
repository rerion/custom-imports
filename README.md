# custom-imports

Generate typed JavaScript modules for non-code assets imported from TypeScript.

TypeScript projects often import files like `.txt`, `.svg`, or custom formats. **custom-imports** scans your source for relative imports, matches each path to a plugin, and writes shadow `.js` / `.d.ts` modules (plus any extra asset files the plugin creates) into a separate output directory. Your source files stay unchanged; the generated modules make those imports valid at build and type-check time.

## Basic usage

**1. Initialize a config file**

```bash
custom-imports --init
```

This creates `custom-imports.config.ts` with `sourceDir`, `shadowDir`, and `plugins`.

**2. Add plugins and import assets in TypeScript**

```ts
// src/main.ts
import message from "./message.txt";

export function greet(): string {
  return message.content;
}
```

```ts
// custom-imports.config.ts
import { defineConfig } from "custom-imports";
import { textWithLength } from "./plugins/text-with-length.js";

export default defineConfig({
  sourceDir: "src",
  shadowDir: ".shadow",
  plugins: [textWithLength()],
});
```

**3. Build shadow output**

```bash
custom-imports
```

Scans `src`, finds relative asset imports, and writes generated files under `.shadow` mirroring the source layout (for example `.shadow/message.txt.js` and `.shadow/message.txt.d.ts`).

**4. Add `sourceDir` and `shadowDir` to TypeScript `rootDirs`**

This is required. TypeScript must see both directories as one logical source tree so imports like `./message.txt` resolve to the generated `.shadow/message.txt.js` module instead of the raw asset file.

Your `tsconfig.json` `rootDirs` must include the same paths as `sourceDir` and `shadowDir` in `custom-imports.config.ts`:

```json
{
  "compilerOptions": {
    "rootDirs": ["src", ".shadow"]
  },
  "include": ["src", ".shadow"]
}
```

If these do not match your config, imports will not type-check and module resolution will break.

**ESM (`moduleResolution: "NodeNext"`):** source imports must use a `.js` or `.mjs` suffix (for example `import message from "./message.txt.js"`). Set `esm: true` in your config so custom-imports strips that suffix when locating the asset on disk and generating shadow output. `rootDirs` is still required—the shadow layout is unchanged (`.shadow/message.txt.js`, not a double `.js` extension).

## Commands

| Command | Description |
|---------|-------------|
| `custom-imports` | Build shadow output from current imports |
| `custom-imports --watch` | Rebuild incrementally when sources or assets change |
| `custom-imports --merge` | Copy shadow output into `sourceDir` |
| `custom-imports --merge --into <dir>` | Copy source and shadow into `<dir>` without modifying `sourceDir` |

## Config options

| Option | Description |
|--------|-------------|
| `sourceDir` | Directory scanned for TypeScript sources and relative asset imports |
| `shadowDir` | Directory where generated `.js`, `.d.ts`, and plugin asset files are written |
| `plugins` | Plugins that match imported asset paths and generate shadow modules |
| `esm` | When `true`, strip trailing `.js` / `.mjs` from resolved relative import paths (for NodeNext ESM projects) |

## Plugins

A plugin implements `matches(path)` and `generate(ctx)`. The context provides writers for the shadow `.js` and `.d.ts` files, `newAssetFile()` for sidecar assets, and `done()` when generation is complete.

```ts
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
      await ctx.jsFile.write(
        `export default { content: ${JSON.stringify(content)}, length: ${content.length} };\n`,
      );
      await ctx.dtsFile.write(`declare const value: { readonly content: string; readonly length: number };\nexport default value;\n`);
      await ctx.done();
    },
  };
}
```
