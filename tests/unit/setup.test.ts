import { readFile } from "node:fs/promises";
import { vol } from "memfs";
import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("mocks node:fs with memfs", async () => {
    vol.fromJSON({ "/tmp/example.txt": "hello" });
    await expect(readFile("/tmp/example.txt", "utf8")).resolves.toBe("hello");
  });
});
