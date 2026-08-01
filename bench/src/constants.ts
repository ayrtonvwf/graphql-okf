import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The agent under test. Pinned: a floating alias would silently change results. */
export const AGENT_MODEL = "claude-sonnet-5";

/** The grader. Stronger than the agent under test, per the spec. */
export const JUDGE_MODEL = "claude-opus-5";

/**
 * Emission is deterministic, but only if `now` is. A wall-clock timestamp would
 * make every generated bundle differ, defeating the point of generating it fresh.
 */
export const FIXED_NOW = "2026-01-01T00:00:00Z";

const here = dirname(fileURLToPath(import.meta.url));

/** `bench/` itself. */
export const BENCH_ROOT = resolve(here, "..");

/** The graphql-okf repository root. */
export const REPO_ROOT = resolve(BENCH_ROOT, "..");

export const SCHEMA_PATH = join(REPO_ROOT, "examples", "shop-api", "v3.graphql");
export const RESULTS_DIR = join(BENCH_ROOT, "results");
export const CASES_DIR = join(BENCH_ROOT, "cases");
export const FIXTURE_DIR = join(BENCH_ROOT, "fixtures", "shop-client");
