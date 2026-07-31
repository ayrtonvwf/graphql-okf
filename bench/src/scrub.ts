const REDACTED = "[redacted]";

/**
 * Structural blinding is the real defence — the judge module never imports the
 * scenario vocabulary. These patterns remove the markers that would otherwise
 * ride along inside the artifact itself.
 *
 * Deliberately narrow. Aggressive redaction would mangle legitimate schema talk
 * and change what the judge is grading. Note the residual limit documented in
 * the spec: prose like "according to the bundle" still leaks.
 */
const PATTERNS: readonly RegExp[] = [
  /\/?okf\/[\w.\-/]+/g,
  /mcp__[\w-]+__[\w-]+/g,
  // Backstop: the run-id-shaped `results/<runId>/` path or an
  // `okf-bench-ws-<random>` temp-directory name should never reach the
  // judge, but an agent quoting an error message verbatim is a channel this
  // guards against defensively (structural blinding is the real defence).
  /\bresults\/[\w.-]+\/[\w.\-/]*/g,
  /okf-bench-ws-[\w-]+/g,
];

export function scrubArtifact(text: string): string {
  let out = text;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}
