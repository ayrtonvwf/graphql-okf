#!/usr/bin/env node
import { createOkfBundle } from "./index.js";

export function main(argv: readonly string[]): void {
  try {
    createOkfBundle({ source: { kind: "sdl", path: argv[0] ?? "." }, outDir: argv[1] ?? "." });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

/* v8 ignore next 3 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
