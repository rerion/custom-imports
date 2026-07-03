import deep from "../data/nested/deep.txt";
import readme from "../shared/readme.txt";
import footer from "../assets/footer.txt";

export function formatBundle(): string {
  return [deep.content, readme.content, footer.content].join(" / ");
}
