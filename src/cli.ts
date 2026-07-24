#!/usr/bin/env node
import { GraphqlOkfError } from "./errors.js";
import { syncOkfBundle } from "./index.js";
import type { SourceSpec } from "./source/types.js";

export function parseArgs(argv: readonly string[]): {
  source: SourceSpec;
  outDir: string;
  now?: string;
  resource?: string;
} {
  const positionals: string[] = [];
  const options = new Map<string, string | undefined>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--out" || arg === "--now" || arg === "--resource") {
      options.set(arg, argv[i + 1]);
      i += 1;
    } else {
      positionals.push(arg);
    }
  }
  const source = positionals[0];
  const outDir = options.get("--out");
  const now = options.get("--now");
  const resource = options.get("--resource");
  if (
    source === undefined ||
    outDir === undefined ||
    (options.has("--now") && now === undefined) ||
    (options.has("--resource") && resource === undefined)
  ) {
    throw new GraphqlOkfError(
      "CLI_USAGE",
      "Usage: graphql-okf <sdl-path-or-endpoint-url> --out <dir> [--now <iso-8601>] [--resource <url-or-id>]",
    );
  }
  const spec: SourceSpec = /^https?:\/\//.test(source)
    ? { kind: "endpoint", url: source }
    : { kind: "sdl", path: source };
  return { source: spec, outDir, now, resource };
}

export async function main(argv: readonly string[]): Promise<void> {
  try {
    const { source, outDir, now, resource } = parseArgs(argv);
    await syncOkfBundle({ source, outDir, now, resource });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

/* v8 ignore next 3 */
if (import.meta.url === `file://${process.argv[1]}`) {
  void main(process.argv.slice(2));
}
