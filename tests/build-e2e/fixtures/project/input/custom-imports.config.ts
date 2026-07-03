import type { UserConfig } from "custom-imports";
import { imageCopy } from "@test/image-copy";
import { replicator } from "@test/replicator";
import { textWithLength } from "@test/text-with-length";

export default {
  sourceDir: "src",
  shadowDir: ".shadow",
  plugins: [textWithLength(), imageCopy(), replicator()],
} satisfies UserConfig;
