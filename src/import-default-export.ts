import { pathToFileURL } from "node:url";

export async function importDefaultExport(
    modulePath: string,
): Promise<unknown> {
    const module = await import(
        /* @vite-ignore */ pathToFileURL(modulePath).href
    );
    return module.default;
}
