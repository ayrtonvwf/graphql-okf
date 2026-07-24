import type { FileParts } from "./seam.js";

export interface IndexEntry {
  readonly label: string;
  readonly link: string;
  readonly summary: string;
}

export function renderDirectoryIndex(title: string, entries: readonly IndexEntry[]): FileParts {
  const bullets = entries.map((entry) =>
    entry.summary === ""
      ? `- [${entry.label}](${entry.link})`
      : `- [${entry.label}](${entry.link}) — ${entry.summary}`,
  );
  return {
    preamble: `# ${title}\n\n`,
    generated: `\n${bullets.join("\n")}\n`,
  };
}
