#!/usr/bin/env node
import { GraphqlOkfError } from "./errors.js";
import { createOkfBundle } from "./index.js";
import type { SourceSpec } from "./source/types.js";

export function parseArgs(argv: readonly string[]): { source: SourceSpec; outDir: string } {
  const positionals: string[] = [];
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg !== undefined && arg === "--out") {
      outDir = argv[i + 1];
      i += 1;
    } else if (arg !== undefined) {
      positionals.push(arg);
    }
  }
  const source = positionals[0];
  if (source === undefined || outDir === undefined) {
    throw new GraphqlOkfError(
      "CLI_USAGE",
      "Usage: graphql-okf <sdl-path-or-endpoint-url> --out <dir>",
    );
  }
  const spec: SourceSpec = /^https?:\/\//.test(source)
    ? { kind: "endpoint", url: source }
    : { kind: "sdl", path: source };
  return { source: spec, outDir };
}

export async function main(argv: readonly string[]): Promise<void> {
  try {
    const { source, outDir } = parseArgs(argv);
    await createOkfBundle({ source, outDir });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

/* v8 ignore next 3 */
if (import.meta.url === `file://${process.argv[1]}`) {
  void main(process.argv.slice(2));
}
