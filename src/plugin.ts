export interface Writer {
  readonly path: string;
  write(chunk: Uint8Array | string): Promise<void>;
}

export interface Context {
  readonly path: string;
  readonly sourceDir: string;
  readonly jsFile: Writer;
  readonly dtsFile: Writer;
  newAssetFile(relativePath: string): Promise<Writer>;
  error(message: string): never;
  done(): Promise<void>;
}

export interface Plugin {
  readonly name: string;
  matches(path: string, sourceDir?: string): boolean | Promise<boolean>;
  generate(ctx: Context): Promise<unknown>;
}

export interface PluginErrorDetails {
  pluginName: string;
  importer: string;
  source: string;
  resolvedPath: string;
  kind: "plugin" | "internal";
}

export class PluginError extends Error {
  readonly pluginName: string;
  readonly importer: string;
  readonly source: string;
  readonly resolvedPath: string;
  readonly kind: "plugin" | "internal";

  constructor(message: string, details: PluginErrorDetails) {
    super(message);
    this.name = "PluginError";
    this.pluginName = details.pluginName;
    this.importer = details.importer;
    this.source = details.source;
    this.resolvedPath = details.resolvedPath;
    this.kind = details.kind;
  }
}
