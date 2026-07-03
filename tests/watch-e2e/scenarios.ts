import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WatchScenario } from "./runner.js";

const MAIN_PATH = join("src", "main.ts");
const GREETING_PATH = join("src", "greeting.txt");
const WIDGETS_COUNT_PATH = join("src", "assets", "widgets.count");

export function createScenarios(scenariosRoot: string): WatchScenario[] {
    return [
        {
            name: "import deleted in source file",
            outputDir: join(scenariosRoot, "import-deleted", "output"),
            action: async (inputDir) => {
                const mainPath = join(inputDir, MAIN_PATH);
                const source = await readFile(mainPath, "utf8");
                const next = source
                    .replace(
                        'import greeting from "./greeting.txt";\n',
                        "",
                    )
                    .replace("greeting.content, ", "");

                await writeFile(mainPath, next, "utf8");
            },
            updatePattern: /update main\.ts/,
        },
        {
            name: "new import in source file",
            outputDir: join(scenariosRoot, "import-added", "output"),
            action: async (inputDir) => {
                const extraPath = join(inputDir, "src", "assets", "extra.txt");
                await writeFile(extraPath, "Extra imported copy\n", "utf8");

                const mainPath = join(inputDir, MAIN_PATH);
                const source = await readFile(mainPath, "utf8");
                const next = source.replace(
                    'import icon from "./assets/icon.png";\n',
                    'import icon from "./assets/icon.png";\nimport extra from "./assets/extra.txt";\n',
                ).replace(
                    "logo, icon);",
                    "logo, icon, extra.content);",
                );

                await writeFile(mainPath, next, "utf8");
            },
            updatePattern: /generated assets\/extra\.txt/,
        },
        {
            name: "import url changed in source file",
            outputDir: join(scenariosRoot, "import-changed", "output"),
            action: async (inputDir) => {
                const mainPath = join(inputDir, MAIN_PATH);
                const source = await readFile(mainPath, "utf8");
                const next = source
                    .replace(
                        'import greeting from "./greeting.txt";',
                        'import readme from "./shared/readme.txt";',
                    )
                    .replace("greeting.content", "readme.content");

                await writeFile(mainPath, next, "utf8");
            },
            updatePattern: /removed greeting\.txt/,
        },
        {
            name: "target changed",
            outputDir: join(scenariosRoot, "target-changed", "output"),
            action: async (inputDir) => {
                await writeFile(
                    join(inputDir, GREETING_PATH),
                    "Updated greeting content\n",
                    "utf8",
                );
            },
            updatePattern: /regenerated greeting\.txt/,
        },
        {
            name: "many assets change",
            outputDir: join(scenariosRoot, "many-assets-change", "output"),
            action: async (inputDir) => {
                await writeFile(
                    join(inputDir, WIDGETS_COUNT_PATH),
                    "5\n",
                    "utf8",
                );
            },
            updatePattern: /regenerated assets\/widgets\.count/,
        },
        {
            name: "unrelated edit",
            outputDir: join(scenariosRoot, "unrelated-edit", "output"),
            action: async (inputDir) => {
                const mainPath = join(inputDir, MAIN_PATH);
                const source = await readFile(mainPath, "utf8");
                await writeFile(
                    mainPath,
                    `// formatting only\n${source}`,
                    "utf8",
                );
            },
            expectNoUpdate: true,
        },
    ];
}
