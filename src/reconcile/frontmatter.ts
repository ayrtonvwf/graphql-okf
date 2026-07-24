const FENCE = "---";
const KEY_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*): ?(.*)$/;

/** Keys graphql-okf writes itself. Anything else in a preamble is a human's. */
const MACHINE_KEYS: ReadonlySet<string> = new Set([
  "type",
  "title",
  "description",
  "resource",
  "tags",
  "timestamp",
  "status",
  "removedAt",
]);

export interface FrontmatterLine {
  readonly key: string;
  readonly raw: string;
}

interface Block {
  readonly lines: readonly FrontmatterLine[];
  readonly trailing: string;
}

function readBlock(preamble: string): Block | null {
  if (!preamble.startsWith(`${FENCE}\n`)) {
    return null;
  }
  const closing = preamble.indexOf(`\n${FENCE}\n`, FENCE.length);
  if (closing === -1) {
    return null;
  }
  const body = preamble.slice(FENCE.length + 1, closing + 1);
  const trailing = preamble.slice(closing + FENCE.length + 2);

  const lines: FrontmatterLine[] = [];
  for (const raw of body.split("\n").slice(0, -1)) {
    const match = KEY_PATTERN.exec(raw);
    const previous = lines[lines.length - 1];
    if (match === null && previous !== undefined) {
      // A continuation of the previous entry; keep it attached so it survives.
      lines[lines.length - 1] = { key: previous.key, raw: `${previous.raw}\n${raw}` };
      continue;
    }
    lines.push({ key: match?.[1] ?? "", raw });
  }
  return { lines, trailing };
}

export function parseFrontmatterLines(preamble: string): readonly FrontmatterLine[] | null {
  return readBlock(preamble)?.lines ?? null;
}

export function frontmatterValue(preamble: string, key: string): string | null {
  const line = readBlock(preamble)?.lines.find((entry) => entry.key === key);
  if (line === undefined) {
    return null;
  }
  return KEY_PATTERN.exec(line.raw)?.[2] ?? null;
}

export function withoutTimestamp(preamble: string): string {
  const block = readBlock(preamble);
  if (block === null) {
    return preamble;
  }
  const kept = block.lines.filter((line) => line.key !== "timestamp");
  return serialize(kept, block.trailing);
}

export function mergeFrontmatter(rendered: string, existing: string): string {
  const renderedBlock = readBlock(rendered);
  const existingBlock = readBlock(existing);
  if (renderedBlock === null || existingBlock === null) {
    return rendered;
  }
  const preserved = existingBlock.lines.filter(
    (line) => line.key !== "" && !MACHINE_KEYS.has(line.key),
  );
  if (preserved.length === 0) {
    return rendered;
  }
  return serialize([...renderedBlock.lines, ...preserved], renderedBlock.trailing);
}

function serialize(lines: readonly FrontmatterLine[], trailing: string): string {
  return `${FENCE}\n${lines.map((line) => line.raw).join("\n")}\n${FENCE}\n${trailing}`;
}
