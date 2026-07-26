import type { BundlePlan, ConceptChange } from "./plan.js";

/**
 * OKF §7 requires ISO 8601 `YYYY-MM-DD` date headings. `type: Log` matches the
 * reference sample bundle and keeps the file out of the concept graph, where a
 * frontmatter-less log.md lands as `type: Unknown`.
 */
export const LOG_HEADER = ["---", "type: Log", "---", "", "# Update Log"].join("\n");

export function hasLoggableChanges(plan: BundlePlan): boolean {
  return plan.added.length + plan.changed.length + plan.removed.length > 0;
}

function group(heading: string, changes: readonly ConceptChange[]): string[] {
  if (changes.length === 0) {
    return [];
  }
  return [
    `**${heading}**`,
    "",
    ...changes.map((change) => `* [\`${change.name}\`](${change.path})`),
    "",
  ];
}

/** One run's changes, headed by its time of day. No trailing newline. */
export function renderRunBlock(plan: BundlePlan, timestamp: string): string {
  const lines = [
    `### ${timestamp.slice(11)}`,
    "",
    ...group("Added", plan.added),
    ...group("Changed", plan.changed),
    ...group("Removed", plan.removed),
  ];
  while (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

/**
 * The whole log.md, newest first, grouped by day. Insertion is deliberately
 * dumb — find the first `## ` heading and put the run at or above it — so the
 * change is a single insertion hunk in git (GOAL-8.6).
 */
export function updateLog(existing: string | null, plan: BundlePlan, timestamp: string): string {
  const day = timestamp.slice(0, 10);
  const run = renderRunBlock(plan, timestamp);
  const text = existing === null || existing.trim() === "" ? LOG_HEADER : existing.trimEnd();
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.startsWith("## "));

  if (at === -1) {
    return `${text}\n\n## ${day}\n\n${run}\n`;
  }

  if (lines[at] === `## ${day}`) {
    const head = lines.slice(0, at + 1);
    const tail = lines.slice(at + 1);
    while (tail[0] === "") {
      tail.shift();
    }
    return `${[...head, "", run, "", ...tail].join("\n")}\n`;
  }

  const head = lines.slice(0, at);
  while (head[head.length - 1] === "") {
    head.pop();
  }
  const tail = lines.slice(at);
  return `${[...head, "", `## ${day}`, "", run, "", ...tail].join("\n")}\n`;
}
