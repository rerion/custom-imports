export interface Writer {
  readonly path: string;
  write(chunk: Uint8Array | string): Promise<void>;
}

export interface PluginOptions {
  emitsJs: boolean;
}

type DefaultPluginOptions = { emitsJs: true };

export interface ContextBase {
  readonly path: string;
  readonly sourceDir: string;
  readonly dtsFile: Writer;
  newAssetFile(path: string): Promise<Writer>;
  error(message: string): never;
  done(): Promise<void>;
}

export type Context<Opts extends PluginOptions = DefaultPluginOptions> =
  Opts["emitsJs"] extends false
    ? ContextBase
    : ContextBase & { readonly jsFile: Writer };

export interface Plugin<Opts extends PluginOptions = DefaultPluginOptions> {
  readonly name: string;
  /** When false, generate `.d.ts` and sidecar assets only — no shadow `.js` module. Default true. */
  readonly emitsJs?: Opts["emitsJs"];
  matches(path: string, sourceDir?: string): boolean | Promise<boolean>;
  generate(ctx: Context<Opts>): Promise<unknown>;
}

export type AnyPlugin = Plugin<{ emitsJs: true }> | Plugin<{ emitsJs: false }>;

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
