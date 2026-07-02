export interface Writer {
  write(chunk: Uint8Array | string): Promise<void>;
}

export interface Context {
  readonly path: string;
  readonly jsFile: Writer;
  readonly dtsFile: Writer;
  newAssetFile(relativePath: string): Writer;
  error(e: string): void;
  done(): Promise<void>;
}

export interface Plugin {
  matches(path: string): boolean | Promise<boolean>;
  generate(ctx: Context): Promise<any>;
}
