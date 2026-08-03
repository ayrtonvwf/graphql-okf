import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasLoggableChanges, updateLog } from "./log.js";
import type { BundlePlan } from "./plan.js";

const LOG_FILE = "log.md";

/** Write via a sibling temp file and a rename, so no file is ever half-written. */
async function writeAtomic(absolute: string, contents: string): Promise<void> {
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.graphql-okf-tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, absolute);
}

export async function applyPlan(
  plan: BundlePlan,
  outDir: string,
  timestamp: string,
): Promise<void> {
  if (plan.actions.length === 0) {
    return;
  }

  // The log goes first: a crash mid-apply then leaves an entry describing changes
  // the next run completes, rather than changes no log will ever record.
  if (hasLoggableChanges(plan)) {
    await mkdir(outDir, { recursive: true });
    const logPath = join(outDir, LOG_FILE);
    let existing: string | null = null;
    try {
      existing = await readFile(logPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await writeAtomic(logPath, updateLog(existing, plan, timestamp));
  }

  // Writes first, then deletes. A crash between the two leaves a duplicate, which
  // the next run's relayout pre-pass collapses; the other order would leave a hole
  // that nothing could recover.
  for (const action of plan.actions) {
    if (action.kind !== "delete") {
      await writeAtomic(join(outDir, action.path), action.contents);
    }
  }

  for (const action of plan.actions) {
    if (action.kind !== "delete") {
      continue;
    }
    const absolute = join(outDir, action.path);
    await rm(absolute, { force: true });
    await removeIfEmpty(dirname(absolute));
  }
}

/** Drops a directory the deletes just emptied. A directory still holding a
 * human's stray file fails with ENOTEMPTY and is correctly left alone. */
async function removeIfEmpty(absolute: string): Promise<void> {
  try {
    await rmdir(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOTEMPTY" && code !== "ENOENT" && code !== "EEXIST") {
      throw error;
    }
  }
}
