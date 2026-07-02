import message from "./messages/welcome.txt";

export function run(): string {
  return `${message.content} (${message.length})`;
}
