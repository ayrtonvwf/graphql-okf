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

export interface DirectoryIndexOptions {
  /**
   * Pre-rendered `key: value` lines. OKF §11 permits a frontmatter block on the
   * bundle-root index only; every other index must stay frontmatter-free per §6,
   * so callers omit it.
   */
  readonly frontmatter?: readonly string[];
  /**
   * A paragraph above the bullets. Inside the generated region, not the preamble,
   * so it is rewritten on every run like everything else the machine owns.
   */
  readonly note?: string;
}

function bullet(entry: IndexEntry): string {
  return entry.summary === ""
    ? `* [${entry.label}](${entry.link})`
    : `* [${entry.label}](${entry.link}) - ${entry.summary}`;
}

/**
 * A single headingless section renders exactly as an ungrouped index always has:
 * the four single-kind directories must not churn when grouping arrives.
 */
export function renderDirectoryIndex(
  title: string,
  sections: readonly IndexSection[],
  options: DirectoryIndexOptions = {},
): FileParts {
  const blocks = sections
    .filter((section) => section.entries.length > 0)
    .map((section) => {
      const bullets = section.entries.map(bullet).join("\n");
      return section.heading === undefined ? bullets : `## ${section.heading}\n\n${bullets}`;
    });

  const body = options.note === undefined ? blocks : [options.note, ...blocks];

  const { frontmatter } = options;
  const block =
    frontmatter === undefined || frontmatter.length === 0
      ? ""
      : `---\n${frontmatter.join("\n")}\n---\n\n`;

  return {
    preamble: `${block}# ${title}\n\n`,
    generated: `\n${body.join("\n\n")}\n`,
  };
}
