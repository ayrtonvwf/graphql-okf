import { isMap, isScalar, type Node, parseDocument } from "yaml";

const FENCE = "---";

/**
 * Byte offsets for any node kind. A pair's value may be a scalar, a map, or a
 * flow sequence (`tags: [...]`), so this must not be narrowed to one of them.
 */
function rangeOf(node: unknown): readonly [number, number, number] | null {
  const range = (node as Node | null | undefined)?.range;
  return range === undefined || range === null ? null : range;
}

/** Keys graphql-okf writes itself. Anything else in a preamble is a human's. */
const MACHINE_KEYS: ReadonlySet<string> = new Set([
  "type",
  "okf_version",
  "title",
  "description",
  "resource",
  "tags",
  "timestamp",
  "generated",
  "status",
  "graphql_okf_status",
  "removedAt",
]);

export interface FrontmatterEntry {
  /**
   * The pair's key, or "" when it is not a plain string scalar, or when this
   * entry is a leading comment/blank-line span above a pair, or the trailing
   * comment tail after the last pair.
   */
  readonly key: string;
  /** The exact source slice for this entry, including its trailing newline. */
  readonly text: string;
}

interface Block {
  readonly entries: readonly FrontmatterEntry[];
  readonly trailing: string;
  /** False when the block is not parseable YAML; callers must not rewrite it. */
  readonly valid: boolean;
  /** The raw block body, used to slice out individual values. */
  readonly body: string;
  /** Value source ranges by key, for frontmatterValue. */
  readonly values: ReadonlyMap<string, string>;
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

  const doc = parseDocument(body);
  if (doc.errors.length > 0) {
    return { entries: [], trailing, valid: false, body, values: new Map() };
  }
  if (!isMap(doc.contents)) {
    // An empty block: nothing to preserve, nothing to lose.
    return { entries: [], trailing, valid: true, body, values: new Map() };
  }

  const entries: FrontmatterEntry[] = [];
  const values = new Map<string, string>();
  let cursor = 0;

  for (const pair of doc.contents.items) {
    const keyNode = pair.key;
    const valueNode = pair.value;
    const keyRange = rangeOf(keyNode);
    // range[2] is the node end, which already swallows a trailing same-line
    // comment and the newline.
    const valueRange = rangeOf(valueNode);
    const end = valueRange?.[2] ?? keyRange?.[2] ?? cursor;
    const key = isScalar(keyNode) && typeof keyNode.value === "string" ? keyNode.value : "";

    if (key !== "" && valueRange !== null) {
      values.set(key, body.slice(valueRange[0], valueRange[1]));
    }

    // Any comment or blank line sitting above this pair is not owned by it —
    // split it into its own entry so it survives even when this pair's key
    // is machine-owned and gets dropped by mergeFrontmatter.
    const keyStart = keyRange?.[0] ?? cursor;
    if (keyStart > cursor) {
      entries.push({ key: "", text: body.slice(cursor, keyStart) });
    }

    entries.push({ key, text: body.slice(keyStart, end) });
    cursor = end;
  }

  // Trailing comments after the last pair belong to the human.
  const tail = body.slice(cursor);
  if (tail !== "") {
    entries.push({ key: "", text: tail });
  }

  return { entries, trailing, valid: true, body, values };
}

function serialize(entries: readonly FrontmatterEntry[], trailing: string): string {
  return `${FENCE}\n${entries.map((entry) => entry.text).join("")}${FENCE}\n${trailing}`;
}

export function parseFrontmatterEntries(preamble: string): readonly FrontmatterEntry[] | null {
  const block = readBlock(preamble);
  if (block === null || !block.valid) {
    return null;
  }
  return block.entries;
}

export function frontmatterValue(preamble: string, key: string): string | null {
  return readBlock(preamble)?.values.get(key) ?? null;
}

/**
 * Provenance is excluded from the change comparison: a concept whose content
 * did not change keeps the `by` and `at` of the run that actually produced it,
 * which is exactly what §5.1 asks `generated` to record. Without this, every
 * producer-version bump would rewrite every file in every bundle.
 */
const PROVENANCE_KEYS: ReadonlySet<string> = new Set(["timestamp", "generated"]);

export function withoutProvenance(preamble: string): string {
  const block = readBlock(preamble);
  if (block === null || !block.valid) {
    return preamble;
  }
  const kept = block.entries.filter((entry) => !PROVENANCE_KEYS.has(entry.key));
  return serialize(kept, block.trailing);
}

export function mergeFrontmatter(rendered: string, existing: string): string {
  const renderedBlock = readBlock(rendered);
  const existingBlock = readBlock(existing);
  if (renderedBlock === null || existingBlock === null) {
    return rendered;
  }
  // Never rewrite something we could not parse: a stale machine field is
  // recoverable, a deleted human key is not.
  if (!existingBlock.valid) {
    return existing;
  }
  if (!renderedBlock.valid) {
    return rendered;
  }
  const preserved = existingBlock.entries.filter((entry) => !MACHINE_KEYS.has(entry.key));
  if (preserved.length === 0) {
    return rendered;
  }
  return serialize([...renderedBlock.entries, ...preserved], renderedBlock.trailing);
}
