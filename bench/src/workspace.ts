import { execFile } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { syncOkfBundle } from "graphql-okf";
import { FIXED_NOW, FIXTURE_DIR, SCHEMA_PATH } from "./constants.js";
import { runDir } from "./result.js";

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

export function workspaceDir(runId: string): string {
  return join(runDir(runId), "workspace");
}

/**
 * A fresh directory per cell, always rebuilt from scratch: a botched run must
 * not be able to poison the next one.
 */
export async function prepareWorkspace(runId: string, needsFixture: boolean): Promise<string> {
  const dir = workspaceDir(runId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  if (needsFixture) {
    await cp(FIXTURE_DIR, dir, { recursive: true });
  }
  return dir;
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
