import { beforeEach, vi } from "vitest";
import { fs, vol } from "memfs";
import { importDefaultExportMock } from "./mocks/import-default-export.js";

vi.mock("node:fs", () => fs);
vi.mock("node:fs/promises", () => fs.promises);

beforeEach(() => {
    vol.reset();
    importDefaultExportMock.mockReset();
});
