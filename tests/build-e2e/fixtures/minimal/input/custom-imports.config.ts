import { defineConfig } from "custom-imports";
import { textWithLength } from "@test/text-with-length";

export default defineConfig({
  sourceDir: "src",
  shadowDir: ".shadow",
  plugins: [textWithLength()],
});
