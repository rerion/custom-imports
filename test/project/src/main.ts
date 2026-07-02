import greeting from "./greeting.txt";
import banner from "./assets/banner.txt";
import sidebar from "./assets/copy/sidebar.txt";
import logo from "./assets/logo.svg";
import icon from "./assets/icon.png";

export function main(): void {
  console.log(greeting.content, banner.length, sidebar.content, logo, icon);
}
