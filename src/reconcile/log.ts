import type { BundlePlan, ConceptChange } from "./plan.js";

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
    ...changes.map((change) => `- [\`${change.name}\`](${change.path})`),
    "",
  ];
}

export function renderLogEntry(plan: BundlePlan, timestamp: string): string {
  return [
    `## ${timestamp}`,
    "",
    ...group("Added", plan.added),
    ...group("Changed", plan.changed),
    ...group("Removed", plan.removed),
    "",
  ].join("\n");
}
