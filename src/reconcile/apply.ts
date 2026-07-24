import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasLoggableChanges, renderLogEntry } from "./log.js";
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
    await appendFile(join(outDir, LOG_FILE), renderLogEntry(plan, timestamp), "utf8");
  }

  for (const action of plan.actions) {
    await writeAtomic(join(outDir, action.path), action.contents);
  }
}
