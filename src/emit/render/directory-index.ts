export interface IndexEntry {
  readonly label: string;
  readonly link: string;
  readonly summary: string;
}

export function renderDirectoryIndex(title: string, entries: readonly IndexEntry[]): string {
  const bullets = entries.map((entry) =>
    entry.summary === ""
      ? `- [${entry.label}](${entry.link})`
      : `- [${entry.label}](${entry.link}) — ${entry.summary}`,
  );
  return [`# ${title}`, "", ...bullets, ""].join("\n");
}
