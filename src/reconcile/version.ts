import type { OkfVersion } from "../emit/context.js";
import { GraphqlOkfError } from "../errors.js";
import { frontmatterValue } from "./frontmatter.js";
import { isOwnedFile } from "./parse.js";

const ROOT_INDEX = "index.md";
const LOG_FILE = "log.md";

function unquote(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : raw;
  } catch {
    return raw;
  }
}

/**
 * Why this bundle looks like v0.2, or null. Deliberately "any signal anywhere"
 * rather than "what the root index declares": a run interrupted mid-migration
 * can have converted concepts under an index that still says 0.1, or the
 * reverse, and a downgrade would destroy content in either state.
 */
export function v2Evidence(existing: ReadonlyMap<string, string>): string | null {
  const root = existing.get(ROOT_INDEX);
  if (root !== undefined && unquote(frontmatterValue(root, "okf_version")) === "0.2") {
    return `${ROOT_INDEX} declares okf_version "0.2"`;
  }
  for (const [path, text] of existing) {
    if (path === LOG_FILE || !isOwnedFile(path, text)) {
      continue;
    }
    if (frontmatterValue(text, "generated") !== null) {
      return `${path} carries a v0.2 "generated" mapping`;
    }
  }
  return null;
}

export function assertNoDowngrade(
  existing: ReadonlyMap<string, string>,
  requested: OkfVersion,
  outDir: string,
): void {
  if (requested !== "0.1") {
    return;
  }
  const evidence = v2Evidence(existing);
  if (evidence === null) {
    return;
  }
  throw new GraphqlOkfError(
    "OKF_VERSION_DOWNGRADE",
    `"${outDir}" is an OKF 0.2 bundle (${evidence}), and --okf-version 0.1 would discard any v0.2-only field it holds (verified, stale_after, sources). Re-run without --okf-version, or write the 0.1 bundle to a different directory.`,
  );
}
