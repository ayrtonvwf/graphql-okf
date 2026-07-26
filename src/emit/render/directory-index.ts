import type { FileParts } from "./seam.js";

export interface IndexEntry {
  readonly label: string;
  readonly link: string;
  readonly summary: string;
}

/**
 * `frontmatter` is a list of pre-rendered `key: value` lines. OKF §11 permits a
 * frontmatter block on the bundle-root index only; every other index must stay
 * frontmatter-free per §6, so callers omit it.
 */
export function renderDirectoryIndex(
  title: string,
  entries: readonly IndexEntry[],
  frontmatter?: readonly string[],
): FileParts {
  const bullets = entries.map((entry) =>
    entry.summary === ""
      ? `* [${entry.label}](${entry.link})`
      : `* [${entry.label}](${entry.link}) - ${entry.summary}`,
  );
  const block =
    frontmatter === undefined || frontmatter.length === 0
      ? ""
      : `---\n${frontmatter.join("\n")}\n---\n\n`;
  return {
    preamble: `${block}# ${title}\n\n`,
    generated: `\n${bullets.join("\n")}\n`,
  };
}
