#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isOkfVersion, type OkfVersion } from "./emit/context.js";
import { GraphqlOkfError } from "./errors.js";
import { syncOkfBundle } from "./index.js";
import type { SourceSpec } from "./source/types.js";

const USAGE =
  "Usage: graphql-okf <sdl-path-or-endpoint-url> --out <dir> [--now <iso-8601>] [--resource <url-or-id>] [--okf-version <0.1|0.2>]";

export function parseArgs(argv: readonly string[]): {
  source: SourceSpec;
  outDir: string;
  now?: string;
  resource?: string;
  okfVersion?: OkfVersion;
} {
  const positionals: string[] = [];
  const options = new Map<string, string | undefined>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--out" || arg === "--now" || arg === "--resource" || arg === "--okf-version") {
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
  const version = options.get("--okf-version");
  if (
    source === undefined ||
    outDir === undefined ||
    (options.has("--now") && now === undefined) ||
    (options.has("--resource") && resource === undefined) ||
    (options.has("--okf-version") && version === undefined)
  ) {
    throw new GraphqlOkfError("CLI_USAGE", USAGE);
  }
  const okfVersion = version === undefined ? undefined : parseOkfVersion(version);
  const spec: SourceSpec = /^https?:\/\//.test(source)
    ? { kind: "endpoint", url: source }
    : { kind: "sdl", path: source };
  return { source: spec, outDir, now, resource, okfVersion };
}

function parseOkfVersion(value: string): OkfVersion {
  if (!isOkfVersion(value)) {
    throw new GraphqlOkfError(
      "INVALID_OKF_VERSION",
      `"${value}" is not a supported OKF version. Pass 0.2 (the default) or 0.1.`,
    );
  }
  return value;
}

export async function main(argv: readonly string[]): Promise<void> {
  try {
    const { source, outDir, now, resource, okfVersion } = parseArgs(argv);
    await syncOkfBundle({ source, outDir, now, resource, okfVersion });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

/* v8 ignore next 6 */
const entryPath = process.argv[1];
const isMain =
  entryPath !== undefined && import.meta.url === pathToFileURL(realpathSync(entryPath)).href;
if (isMain) {
  void main(process.argv.slice(2));
}
