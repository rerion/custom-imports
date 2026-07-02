import tagline from "./tagline.txt";
import banner from "../assets/banner.txt";
import avatar from "./avatar.svg";

export function renderHero(): string {
  return `${tagline.content} | ${banner.content} | ${avatar}`;
}
