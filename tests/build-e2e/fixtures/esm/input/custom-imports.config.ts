import type { UserConfig } from "custom-imports";
import { textWithLength } from "@test/text-with-length";

export default {
  sourceDir: "src",
  shadowDir: ".shadow",
  esm: true,
  plugins: [textWithLength()],
} satisfies UserConfig;
