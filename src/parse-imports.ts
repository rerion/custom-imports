import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Language, Parser, type Point, type Tree } from "web-tree-sitter";

export interface RawImportStatement {
  source: string;
  startIndex: number;
  endIndex: number;
  startPosition: Point;
  endPosition: Point;
}

export interface ImportStatement extends RawImportStatement {
  resolvedPath: string;
}

interface ParserSession {
  parser: Parser;
  typescript: Language;
  tsx: Language;
}

let parserSession: Promise<ParserSession> | undefined;

function grammarWasmPath(fileName: string): string {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(
    require.resolve("tree-sitter-typescript/package.json"),
  );
  return join(packageRoot, fileName);
}

async function getParserSession(): Promise<ParserSession> {
  if (!parserSession) {
    parserSession = (async () => {
      await Parser.init();
      const typescript = await Language.load(
        grammarWasmPath("tree-sitter-typescript.wasm"),
      );
      const tsx = await Language.load(
        grammarWasmPath("tree-sitter-tsx.wasm"),
      );
      const parser = new Parser();
      return { parser, typescript, tsx };
    })();
  }

  return parserSession;
}

function unquoteModuleSpecifier(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }

  return text;
}

function moduleSpecifierFromStringNode(stringNode: {
  childCount: number;
  child(index: number): { type: string; text: string } | null;
  text: string;
}): string {
  for (let i = 0; i < stringNode.childCount; i++) {
    const child = stringNode.child(i);
    if (child?.type === "string_fragment") {
      return child.text;
    }
  }

  return unquoteModuleSpecifier(stringNode.text);
}

export function extractImports(tree: Tree): RawImportStatement[] {
  const imports: RawImportStatement[] = [];
  const cursor = tree.walk();

  const visit = (): void => {
    const node = cursor.currentNode;

    if (node.type === "import_statement") {
      const sourceNode = node.childForFieldName("source");
      if (sourceNode) {
        imports.push({
          source: moduleSpecifierFromStringNode(sourceNode),
          startIndex: node.startIndex,
          endIndex: node.endIndex,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
        });
      }
    }

    if (cursor.gotoFirstChild()) {
      do {
        visit();
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };

  visit();
  return imports;
}

export async function parseImports(
  filePath: string,
  source: string,
): Promise<RawImportStatement[]> {
  const { parser, typescript, tsx } = await getParserSession();
  parser.setLanguage(filePath.endsWith(".tsx") ? tsx : typescript);
  const tree = parser.parse(source);
  if (!tree) {
    return [];
  }

  return extractImports(tree);
}
