import { vi } from "vitest";

export const importDefaultExportMock = vi.fn();

vi.mock("../../src/import-default-export.js", () => ({
    importDefaultExport: importDefaultExportMock,
}));
