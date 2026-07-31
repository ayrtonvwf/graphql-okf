import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { syncOkfBundle } from "graphql-okf";
import { FIXED_NOW, FIXTURE_DIR, SCHEMA_PATH } from "./constants.ts";

const exec = promisify(execFile);

/** Where the bundle lands inside a workspace, and what the diff excludes. */
const BUNDLE_DIR = "okf";

const GIT_IDENTITY = [
  "-c",
  "user.name=graphql-okf bench",
  "-c",
  "user.email=bench@graphql-okf.invalid",
  // Independent of ambient git config, not just user.name/user.email: a machine
  // with global commit signing enabled (commit.gpgsign=true) would otherwise
  // block on a pinentry prompt the harness has no way to satisfy.
  "-c",
  "commit.gpgsign=false",
];

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...GIT_IDENTITY, ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

/**
 * A fresh, opaque OS temp directory per cell, created via `mkdtemp` — never
 * derived from `runId`. The run id encodes `<case>__<scenario>__t<trial>`, and
 * the agent under test can read its own cwd (directly, or indirectly through
 * error messages and the confinement hook's denial strings). A path built from
 * `runId` would hand the agent the scenario it's running under, defeating the
 * blinded comparison. `mkdtemp` also means there is never a *reused* path to
 * clean up before use — each call is already a brand-new directory.
 */
export async function prepareWorkspace(_runId: string, needsFixture: boolean): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "okf-bench-ws-"));
  if (needsFixture) {
    await cp(FIXTURE_DIR, dir, { recursive: true });
  }
  return dir;
}

/**
 * Removes a workspace created by `prepareWorkspace`. Call only after the
 * cell's artifact and transcript have been captured and written to
 * `results/<runId>/` — these are real OS temp directories outside the
 * git-ignored `results/` tree and would otherwise accumulate indefinitely
 * across repeated runs.
 */
export async function cleanupWorkspace(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Emitted fresh rather than copied from the committed `okf/shop-api/`. Emission
 * is deterministic given a fixed `now`, so the bytes match — but generating
 * means the benchmark measures the current emitter, not a stale snapshot.
 */
export async function generateBundle(dir: string): Promise<void> {
  await syncOkfBundle({
    source: { kind: "sdl", path: SCHEMA_PATH },
    outDir: join(dir, BUNDLE_DIR, "shop-api"),
    now: FIXED_NOW,
    resource: "shop-api",
  });
}

/**
 * Snapshots the starting state so the coding artifact is a plain `git diff`.
 * The bundle is gitignored, so a scenario marker cannot ride along into the
 * judge's input — and the agent editing it cannot masquerade as a code change.
 */
export async function commitPristine(dir: string): Promise<void> {
  await writeFile(join(dir, ".gitignore"), `${BUNDLE_DIR}/\n`, "utf8");
  await git(dir, ["init", "--quiet"]);
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "--quiet", "--allow-empty", "-m", "pristine"]);
}

/** Everything the agent changed, including files it created. */
export async function captureDiff(dir: string): Promise<string> {
  await git(dir, ["add", "-A"]);
  return git(dir, ["diff", "--cached"]);
}
