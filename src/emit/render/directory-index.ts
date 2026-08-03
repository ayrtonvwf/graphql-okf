import type { FileParts } from "./seam.js";

export interface IndexEntry {
  readonly label: string;
  readonly link: string;
  readonly summary: string;
}

/**
 * One `##`-headed group of entries. `heading` is omitted for the leading group —
 * child-directory rows, which carry no kind and precede every headed section.
 */
export interface IndexSection {
  readonly heading?: string;
  readonly entries: readonly IndexEntry[];
}

function bullet(entry: IndexEntry): string {
  return entry.summary === ""
    ? `* [${entry.label}](${entry.link})`
    : `* [${entry.label}](${entry.link}) - ${entry.summary}`;
}

/**
 * `frontmatter` is a list of pre-rendered `key: value` lines. OKF §11 permits a
 * frontmatter block on the bundle-root index only; every other index must stay
 * frontmatter-free per §6, so callers omit it.
 *
 * A single headingless section renders exactly as an ungrouped index always has:
 * the four single-kind directories must not churn when grouping arrives.
 */
export function renderDirectoryIndex(
  title: string,
  sections: readonly IndexSection[],
  frontmatter?: readonly string[],
): FileParts {
  const blocks = sections
    .filter((section) => section.entries.length > 0)
    .map((section) => {
      const bullets_list = section.entries.map(bullet).join("\n");
      return section.heading === undefined
        ? bullets_list
        : `## ${section.heading}\n\n${bullets_list}`;
    });

  const block =
    frontmatter === undefined || frontmatter.length === 0
      ? ""
      : `---\n${frontmatter.join("\n")}\n---\n\n`;

  return {
    preamble: `${block}# ${title}\n\n`,
    generated: `\n${blocks.join("\n\n")}\n`,
  };
}
