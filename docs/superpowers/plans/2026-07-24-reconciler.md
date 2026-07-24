# Reconciler (M1 sub-project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn graphql-okf from a create-only generator into a maintainer — `syncOkfBundle` re-runs against an existing bundle, producing an empty diff when the schema is unchanged, updating only what changed, tombstoning removals, preserving human prose, and appending to `log.md`.

**Architecture:** A pure core computes a `BundlePlan` from `(SchemaIr, existing files, timestamp)`; two thin fs modules read the bundle and apply the plan. Every concept file is split at the generated-region markers into `{ preamble, generated }` + `human`; comparison is on the first two, the third is spliced back verbatim. Creation is reconciliation against an empty bundle, so there is exactly one write path.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), graphql-js v16, Vitest, Biome, knip, tsdown, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-24-reconciler-design.md`

## Global Constraints

- Node.js `>=24`. CI also runs Node 26.
- ESM-first, `"module": "NodeNext"` — **all relative imports must carry a `.js` extension**, even when importing a `.ts` file.
- `"verbatimModuleSyntax": true` — type-only imports **must** use `import type { … }`.
- `"strict": true` and `"noUncheckedIndexedAccess": true` — indexing an array or record yields `T | undefined` and must be narrowed.
- Biome formatting: double quotes, semicolons always, 2-space indent, line width 100, trailing commas everywhere. Run `pnpm run format` before committing if unsure.
- Tests are colocated as `src/**/*.test.ts`, or live under `test/**/*.test.ts`. Both are picked up by Vitest.
- Coverage thresholds are enforced gates: lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.
- **Determinism is load-bearing (`M1/GOAL-8.1`, `M1/NG-6`).** No runtime LLM calls, no wall-clock reads below `syncOkfBundle`, no reliance on `Map`/`Set` iteration order for anything observable. `reconcile` is a total function of `(ir, existing, timestamp)`.
- **Never re-derive a concept path.** Paths come from the IR (`concept.path`, `TypeRef.path`), per `M1/GOAL-4.5`.
- Every task ends green on `pnpm test`. Before the final commit of the last task, `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run knip` and `pnpm run build` must all pass.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/emit/render/seam.ts` | **New.** The file format: marker constants, `FileParts`, `assembleFile`, `EMPTY_HUMAN`. Shared by emitter and reconciler. |
| `src/emit/render/concept.ts` | **Modify.** `renderConceptParts` returns `FileParts`; `renderConcept` assembles it with an empty human region. |
| `src/emit/render/directory-index.ts` | **Modify.** Returns `FileParts` so index files gain the seam. |
| `src/emit/bundle.ts` | **Modify.** `buildBundle(ir, timestamp, tombstones)` returns `ReadonlyMap<string, FileParts>` and lists tombstones in indexes. |
| `src/emit/write.ts` | **Delete.** Replaced by `src/reconcile/apply.ts`. |
| `src/reconcile/parse.ts` | **New.** `splitFile` — marker-based split, exact round-trip, `MALFORMED_CONCEPT`. |
| `src/reconcile/frontmatter.ts` | **New.** Ordered `key: value` line parsing, unknown-key preservation, timestamp stripping. |
| `src/reconcile/tombstone.ts` | **New.** `isTombstoned`, `titleOf`, `renderTombstone`. |
| `src/reconcile/plan.ts` | **New.** `reconcile(ir, existing, timestamp) -> BundlePlan`. The decision table. Pure. |
| `src/reconcile/log.ts` | **New.** `renderLogEntry(plan, timestamp) -> string`. Pure. |
| `src/reconcile/read.ts` | **New.** `readExistingBundle(outDir)`. fs. |
| `src/reconcile/apply.ts` | **New.** `applyPlan(plan, outDir, timestamp)`. fs. The only writer. |
| `src/index.ts` | **Modify.** `createOkfBundle` → `syncOkfBundle`, returning `SyncResult`. |
| `src/cli.ts` | **Modify.** Calls `syncOkfBundle`. |
| `src/errors.ts` | **Modify.** Add `NOT_A_BUNDLE`, `MALFORMED_CONCEPT`; remove `OUTPUT_NOT_EMPTY`. |
| `test/fixtures/kitchen-sink-evolved.graphql` | **New.** The evolved schema for `DOD-G-4`. |
| `test/reconcile.test.ts` | **New.** End-to-end idempotence, evolution, human preservation, strays. |

### The file format, fixed precisely

Every owned file is exactly:

```
<preamble><GENERATED_START><generated><GENERATED_END><human>
```

Splitting is by `indexOf` on the marker strings and assembly is plain
concatenation, so `assembleFile(split.parts, split.human) === original` holds
byte-for-byte by construction. `preamble` is the frontmatter block (concepts) or
the `# Title` heading (indexes), including its trailing blank line. This exact
round-trip is what makes "unchanged ⇒ zero writes" reliable.

---

## Task 1: The seam module

**Files:**
- Create: `src/emit/render/seam.ts`
- Modify: `src/emit/render/concept.ts`
- Test: `src/emit/render/seam.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FileParts` (`{ readonly preamble: string; readonly generated: string }`), `assembleFile(parts, human): string`, and the constants `GENERATED_START`, `GENERATED_END`, `HUMAN_HINT`, `GENERATED_HINT`, `EMPTY_HUMAN`. `src/emit/render/concept.ts` gains `renderConceptParts(concept, resource, timestamp): FileParts` while `renderConcept` keeps its current signature and **byte-identical** output.

- [ ] **Step 1: Write the failing test**

Create `src/emit/render/seam.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assembleFile,
  EMPTY_HUMAN,
  GENERATED_END,
  GENERATED_START,
  HUMAN_HINT,
} from "./seam.js";

describe("assembleFile", () => {
  it("concatenates preamble, markers, generated content, and the human region", () => {
    const out = assembleFile({ preamble: "# Title\n\n", generated: "\nbody\n" }, "\n\ntrailing\n");

    expect(out).toBe(
      `# Title\n\n${GENERATED_START}\nbody\n${GENERATED_END}\n\ntrailing\n`,
    );
  });

  it("uses the human hint as the starting human region for a fresh file", () => {
    expect(EMPTY_HUMAN).toBe(`\n\n${HUMAN_HINT}\n`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/emit/render/seam.test.ts`
Expected: FAIL — cannot resolve `./seam.js`.

- [ ] **Step 3a: Write the seam module**

Create `src/emit/render/seam.ts`:

```ts
export const GENERATED_START = "<!-- graphql-okf:generated:start -->";
export const GENERATED_END = "<!-- graphql-okf:generated:end -->";

export const GENERATED_HINT =
  "<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->";
export const HUMAN_HINT =
  "<!-- Human-authored content below this line is preserved across regenerations. -->";

/** The human region of a file graphql-okf has just created for the first time. */
export const EMPTY_HUMAN = `\n\n${HUMAN_HINT}\n`;

/**
 * A file graphql-okf owns, minus its human region: everything before the start
 * marker, and everything between the markers.
 */
export interface FileParts {
  readonly preamble: string;
  readonly generated: string;
}

export function assembleFile(parts: FileParts, human: string): string {
  return `${parts.preamble}${GENERATED_START}${parts.generated}${GENERATED_END}${human}`;
}
```

- [ ] **Step 3b: Rewrite `concept.ts` in terms of the seam**

Replace `src/emit/render/concept.ts` entirely:

```ts
import type { ConceptNode } from "../../model/ir.js";
import { renderBody } from "./body.js";
import { renderFrontmatter } from "./frontmatter.js";
import { assembleFile, EMPTY_HUMAN, type FileParts, GENERATED_HINT } from "./seam.js";

export function renderConceptParts(
  concept: ConceptNode,
  resource: string,
  timestamp: string,
): FileParts {
  return {
    preamble: `${renderFrontmatter(concept, resource, timestamp)}\n`,
    generated: `\n${GENERATED_HINT}\n\n${renderBody(concept).trimEnd()}\n\n`,
  };
}

export function renderConcept(concept: ConceptNode, resource: string, timestamp: string): string {
  return assembleFile(renderConceptParts(concept, resource, timestamp), EMPTY_HUMAN);
}
```

Note `src/emit/render/concept.ts` no longer exports `GENERATED_START` / `GENERATED_END`. Update any import of those to come from `./seam.js`.

- [ ] **Step 4: Run the full suite to verify output is unchanged**

Run: `pnpm test`
Expected: PASS — every existing `concept.test.ts` and `bundle.test.ts` assertion still holds, proving the refactor is byte-identical. If `concept.test.ts` imported the marker constants from `./concept.js`, repoint that import to `./seam.js`.

- [ ] **Step 5: Commit**

```bash
git add src/emit/render/seam.ts src/emit/render/seam.test.ts src/emit/render/concept.ts src/emit/render/concept.test.ts
git commit -m "refactor: extract the machine/human seam into its own module"
```

---

## Task 2: Splitting an existing file

**Files:**
- Create: `src/reconcile/parse.ts`
- Modify: `src/errors.ts`
- Test: `src/reconcile/parse.test.ts`

**Interfaces:**
- Consumes: `FileParts`, `GENERATED_START`, `GENERATED_END`, `assembleFile` from Task 1.
- Produces: `SplitFile` (`{ readonly parts: FileParts; readonly human: string }`) and `splitFile(text: string, path: string): SplitFile | null`. Returns `null` when neither marker is present (a stray). Throws `GraphqlOkfError` code `MALFORMED_CONCEPT` when the markers are unbalanced, duplicated, or out of order.

- [ ] **Step 1: Write the failing test**

Create `src/reconcile/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleFile, GENERATED_END, GENERATED_START } from "../emit/render/seam.js";
import type { GraphqlOkfError } from "../errors.js";
import { splitFile } from "./parse.js";

const file = `---\ntype: object\n---\n\n${GENERATED_START}\nbody\n${GENERATED_END}\n\nhuman words\n`;

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as GraphqlOkfError).code;
  }
  return "no-error";
}

describe("splitFile", () => {
  it("splits an owned file into preamble, generated region, and human region", () => {
    const split = splitFile(file, "types/objects/Country.md");

    expect(split?.parts.preamble).toBe("---\ntype: object\n---\n\n");
    expect(split?.parts.generated).toBe("\nbody\n");
    expect(split?.human).toBe("\n\nhuman words\n");
  });

  it("round-trips exactly, so an unchanged file can be left untouched", () => {
    const split = splitFile(file, "a.md");
    if (split === null) throw new Error("expected an owned file");

    expect(assembleFile(split.parts, split.human)).toBe(file);
  });

  it("returns null for a stray file with no markers", () => {
    expect(splitFile("# Just some notes\n", "guides/notes.md")).toBeNull();
  });

  it("rejects a file with a start marker but no end marker", () => {
    expect(codeOf(() => splitFile(`x\n${GENERATED_START}\ny\n`, "a.md"))).toBe("MALFORMED_CONCEPT");
  });

  it("rejects a file whose markers are out of order", () => {
    expect(codeOf(() => splitFile(`${GENERATED_END}\n${GENERATED_START}\n`, "a.md"))).toBe(
      "MALFORMED_CONCEPT",
    );
  });

  it("rejects a file with duplicated markers", () => {
    const text = `${GENERATED_START}\na\n${GENERATED_END}\n${GENERATED_START}\nb\n${GENERATED_END}\n`;
    expect(codeOf(() => splitFile(text, "a.md"))).toBe("MALFORMED_CONCEPT");
  });

  it("names the offending file in the error message", () => {
    try {
      splitFile(`${GENERATED_START}\n`, "types/objects/Country.md");
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as Error).message).toContain("types/objects/Country.md");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/parse.test.ts`
Expected: FAIL — cannot resolve `./parse.js`.

- [ ] **Step 3a: Add the error code**

In `src/errors.ts`, add `| "MALFORMED_CONCEPT"` to the `GraphqlOkfErrorCode` union.

- [ ] **Step 3b: Write the implementation**

Create `src/reconcile/parse.ts`:

```ts
import { type FileParts, GENERATED_END, GENERATED_START } from "../emit/render/seam.js";
import { GraphqlOkfError } from "../errors.js";

export interface SplitFile {
  readonly parts: FileParts;
  readonly human: string;
}

function malformed(path: string, detail: string): GraphqlOkfError {
  return new GraphqlOkfError(
    "MALFORMED_CONCEPT",
    `"${path}" has malformed graphql-okf markers (${detail}). Restore the generated-region markers or delete the file, then re-run.`,
  );
}

/**
 * Splits a file graphql-okf owns into its three regions. Returns null for a
 * stray — any file without the markers, which graphql-okf never touches.
 */
export function splitFile(text: string, path: string): SplitFile | null {
  const start = text.indexOf(GENERATED_START);
  const end = text.indexOf(GENERATED_END);

  if (start === -1 && end === -1) {
    return null;
  }
  if (start === -1) {
    throw malformed(path, "an end marker with no start marker");
  }
  if (end === -1) {
    throw malformed(path, "a start marker with no end marker");
  }
  if (end < start) {
    throw malformed(path, "the end marker precedes the start marker");
  }
  if (text.indexOf(GENERATED_START, start + GENERATED_START.length) !== -1) {
    throw malformed(path, "more than one start marker");
  }
  if (text.indexOf(GENERATED_END, end + GENERATED_END.length) !== -1) {
    throw malformed(path, "more than one end marker");
  }

  return {
    parts: {
      preamble: text.slice(0, start),
      generated: text.slice(start + GENERATED_START.length, end),
    },
    human: text.slice(end + GENERATED_END.length),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/parse.test.ts`
Expected: PASS, all seven cases.

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts src/reconcile/parse.ts src/reconcile/parse.test.ts
git commit -m "feat: split an existing bundle file at the generated-region markers"
```

---

## Task 3: Frontmatter lines and unknown-key preservation

**Files:**
- Create: `src/reconcile/frontmatter.ts`
- Test: `src/reconcile/frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseFrontmatterLines(preamble: string): readonly FrontmatterLine[] | null` — `null` when the preamble is not a frontmatter block (an index heading). `FrontmatterLine` is `{ readonly key: string; readonly raw: string }`; `raw` is the full source line(s), `key` is `""` for a continuation or unparseable line.
  - `mergeFrontmatter(rendered: string, existing: string): string` — returns `rendered` with any non-machine keys found in `existing` appended before the closing `---`.
  - `withoutTimestamp(preamble: string): string` — `preamble` with its `timestamp:` line removed, for change comparison.
  - `frontmatterValue(preamble: string, key: string): string | null` — the raw value text after `key: `, or `null`.

- [ ] **Step 1: Write the failing test**

Create `src/reconcile/frontmatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  frontmatterValue,
  mergeFrontmatter,
  parseFrontmatterLines,
  withoutTimestamp,
} from "./frontmatter.js";

const rendered = `---\ntype: object\ntitle: "Country"\nresource: "x"\ntags: [graphql, object]\ntimestamp: 2026-07-24T00:00:00.000Z\n---\n\n`;

describe("parseFrontmatterLines", () => {
  it("returns one entry per key, in order", () => {
    const lines = parseFrontmatterLines(rendered);

    expect(lines?.map((line) => line.key)).toEqual([
      "type",
      "title",
      "resource",
      "tags",
      "timestamp",
    ]);
  });

  it("returns null for a preamble that is not a frontmatter block", () => {
    expect(parseFrontmatterLines("# Object types\n\n")).toBeNull();
  });
});

describe("mergeFrontmatter", () => {
  it("carries an unknown key from the existing file into the rendered frontmatter", () => {
    const existing = `---\ntype: object\ntitle: "Country"\nowner: platform-team\n---\n\n`;

    const merged = mergeFrontmatter(rendered, existing);

    expect(merged).toContain("owner: platform-team");
    expect(merged.indexOf("owner:")).toBeGreaterThan(merged.indexOf("timestamp:"));
    expect(merged.trimEnd().endsWith("---")).toBe(true);
  });

  it("does not carry over machine-owned keys such as status and removedAt", () => {
    const existing = `---\ntype: object\nstatus: removed\nremovedAt: 2026-01-01T00:00:00.000Z\n---\n\n`;

    const merged = mergeFrontmatter(rendered, existing);

    expect(merged).not.toContain("status:");
    expect(merged).not.toContain("removedAt:");
  });

  it("leaves the rendered text alone when the existing preamble has no frontmatter", () => {
    expect(mergeFrontmatter(rendered, "# Object types\n\n")).toBe(rendered);
  });
});

describe("withoutTimestamp", () => {
  it("removes only the timestamp line", () => {
    const stripped = withoutTimestamp(rendered);

    expect(stripped).not.toContain("timestamp:");
    expect(stripped).toContain('title: "Country"');
  });
});

describe("frontmatterValue", () => {
  it("reads a raw value by key", () => {
    expect(frontmatterValue(rendered, "title")).toBe('"Country"');
  });

  it("returns null for an absent key", () => {
    expect(frontmatterValue(rendered, "status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/frontmatter.test.ts`
Expected: FAIL — cannot resolve `./frontmatter.js`.

- [ ] **Step 3: Write the implementation**

Create `src/reconcile/frontmatter.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/frontmatter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reconcile/frontmatter.ts src/reconcile/frontmatter.test.ts
git commit -m "feat: parse frontmatter lines and preserve human-added keys"
```

---

## Task 4: The seam in `index.md`

**Files:**
- Modify: `src/emit/render/directory-index.ts`
- Modify: `src/emit/render/directory-index.test.ts`
- Modify: `src/emit/bundle.ts`
- Test: `src/emit/bundle.test.ts` (update expectations)

**Interfaces:**
- Consumes: `FileParts`, `EMPTY_HUMAN` from Task 1.
- Produces: `renderDirectoryIndex(title, entries): FileParts` — `preamble` is `` `# ${title}\n\n` ``, `generated` is the bullet list wrapped in newlines. `buildBundle` still returns a map keyed by path but its values are now `FileParts` (Task 6 adds the tombstone parameter).

- [ ] **Step 1: Write the failing test**

Replace the first case in `src/emit/render/directory-index.test.ts` and keep the others, adjusting them to read `.generated`:

```ts
import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN } from "./seam.js";
import { renderDirectoryIndex } from "./directory-index.js";

describe("renderDirectoryIndex", () => {
  it("puts the title in the preamble and the bullets in the generated region", () => {
    const parts = renderDirectoryIndex("Object types", [
      { label: "Country", link: "Country.md", summary: "An ISO country." },
      { label: "Language", link: "Language.md", summary: "A spoken language." },
    ]);

    expect(parts.preamble).toBe("# Object types\n\n");
    expect(parts.generated).toBe(
      "\n- [Country](Country.md) — An ISO country.\n- [Language](Language.md) — A spoken language.\n",
    );
  });

  it("assembles into a file whose human region is preserved on re-runs", () => {
    const parts = renderDirectoryIndex("Types", [
      { label: "objects/", link: "objects/index.md", summary: "Object types" },
    ]);

    const file = assembleFile(parts, EMPTY_HUMAN);

    expect(file).toContain("# Types");
    expect(file).toContain("- [objects/](objects/index.md) — Object types");
    expect(file).toContain("<!-- graphql-okf:generated:end -->");
    expect(file.trimEnd().endsWith("-->")).toBe(true);
  });

  it("omits the summary dash when a summary is empty", () => {
    const parts = renderDirectoryIndex("Types", [
      { label: "widgets/", link: "widgets/index.md", summary: "" },
    ]);

    expect(parts.generated).toContain("- [widgets/](widgets/index.md)");
    expect(parts.generated).not.toContain("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/emit/render/directory-index.test.ts`
Expected: FAIL — `renderDirectoryIndex` returns a string, so `parts.preamble` is `undefined`.

- [ ] **Step 3a: Rewrite the renderer**

Replace `src/emit/render/directory-index.ts`:

```ts
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
```

- [ ] **Step 3b: Make `buildBundle` a map of parts**

In `src/emit/bundle.ts`, change the map type and the two `bundle.set` calls. Import `renderConceptParts` instead of `renderConcept`, and `FileParts` from `./render/seam.js`:

```ts
import { renderConceptParts } from "./render/concept.js";
import type { FileParts } from "./render/seam.js";

export function buildBundle(ir: SchemaIr, timestamp: string): ReadonlyMap<string, FileParts> {
  const bundle = new Map<string, FileParts>();

  for (const concept of ir.concepts) {
    bundle.set(concept.path, renderConceptParts(concept, ir.resource, timestamp));
  }
  // …directory walk unchanged…
  bundle.set(indexPath, renderDirectoryIndex(title, sortByLabel(entries)));
  return bundle;
}
```

- [ ] **Step 3c: Adapt the two current consumers**

In `src/index.ts`, assemble before writing (this is temporary — Task 12 replaces it):

```ts
import { assembleFile, EMPTY_HUMAN } from "./emit/render/seam.js";

const parts = buildBundle(ir, timestamp);
const files = new Map<string, string>();
for (const [path, part] of parts) {
  files.set(path, assembleFile(part, EMPTY_HUMAN));
}
await writeBundle(files, options.outDir);
```

In `src/emit/bundle.test.ts`, any assertion reading a map value as a string becomes
`assembleFile(value, EMPTY_HUMAN)` or asserts against `value.generated`.

- [ ] **Step 4: Run the suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/emit/render/directory-index.ts src/emit/render/directory-index.test.ts src/emit/bundle.ts src/emit/bundle.test.ts src/index.ts
git commit -m "feat: give index.md the machine/human seam"
```

---

## Task 5: Tombstone rendering

**Files:**
- Create: `src/reconcile/tombstone.ts`
- Test: `src/reconcile/tombstone.test.ts`

**Interfaces:**
- Consumes: `SplitFile` (Task 2), `frontmatterValue` (Task 3), `FileParts` (Task 1).
- Produces:
  - `isTombstoned(split: SplitFile): boolean` — true when frontmatter carries `status: removed`.
  - `titleOf(split: SplitFile, path: string): string` — the `title` value, JSON-decoded, falling back to the file's basename without `.md`.
  - `renderTombstone(split: SplitFile, removedAt: string): FileParts` — the removed form. `timestamp` is untouched; `status` and `removedAt` are appended; the previous body is retained under a `## Last known definition` heading.

- [ ] **Step 1: Write the failing test**

Create `src/reconcile/tombstone.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GENERATED_HINT } from "../emit/render/seam.js";
import { splitFile } from "./parse.js";
import { isTombstoned, renderTombstone, titleOf } from "./tombstone.js";

function split(text: string) {
  const result = splitFile(text, "types/objects/LegacyOrder.md");
  if (result === null) throw new Error("expected an owned file");
  return result;
}

const live = split(
  `---\ntype: object\ntitle: "LegacyOrder"\nresource: "x"\ntags: [graphql, object]\ntimestamp: 2026-07-01T10:00:00.000Z\n---\n\n<!-- graphql-okf:generated:start -->\n${GENERATED_HINT}\n\n# LegacyOrder\n\n## Fields\n\n- **\`id\`**: \`ID!\`\n\n<!-- graphql-okf:generated:end -->\n\nour notes\n`,
);

describe("titleOf", () => {
  it("reads the JSON-encoded title", () => {
    expect(titleOf(live, "types/objects/LegacyOrder.md")).toBe("LegacyOrder");
  });

  it("falls back to the file basename when there is no title", () => {
    const untitled = split("---\ntype: object\n---\n\n<!-- graphql-okf:generated:start -->\nx\n<!-- graphql-okf:generated:end -->\n");
    expect(titleOf(untitled, "types/objects/Ghost.md")).toBe("Ghost");
  });
});

describe("isTombstoned", () => {
  it("is false for a live concept", () => {
    expect(isTombstoned(live)).toBe(false);
  });

  it("is true once the file has been tombstoned", () => {
    const tombstoned = { parts: renderTombstone(live, "2026-07-24T09:00:00.000Z"), human: live.human };
    expect(isTombstoned(tombstoned)).toBe(true);
  });
});

describe("renderTombstone", () => {
  const parts = renderTombstone(live, "2026-07-24T09:00:00.000Z");

  it("adds status and removedAt without disturbing the original timestamp", () => {
    expect(parts.preamble).toContain("status: removed");
    expect(parts.preamble).toContain("removedAt: 2026-07-24T09:00:00.000Z");
    expect(parts.preamble).toContain("timestamp: 2026-07-01T10:00:00.000Z");
  });

  it("states the removal and retains the last known definition", () => {
    expect(parts.generated).toContain("> **Removed.** This element is no longer present");
    expect(parts.generated).toContain("as of 2026-07-24");
    expect(parts.generated).toContain("## Last known definition");
    expect(parts.generated).toContain("- **`id`**: `ID!`");
  });

  it("drops the regenerate-me hint, which no longer applies", () => {
    expect(parts.generated).not.toContain(GENERATED_HINT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/tombstone.test.ts`
Expected: FAIL — cannot resolve `./tombstone.js`.

- [ ] **Step 3: Write the implementation**

Create `src/reconcile/tombstone.ts`:

```ts
import type { FileParts } from "../emit/render/seam.js";
import { GENERATED_HINT } from "../emit/render/seam.js";
import { frontmatterValue } from "./frontmatter.js";
import type { SplitFile } from "./parse.js";

export function isTombstoned(split: SplitFile): boolean {
  return frontmatterValue(split.parts.preamble, "status") === "removed";
}

export function titleOf(split: SplitFile, path: string): string {
  const raw = frontmatterValue(split.parts.preamble, "title");
  const fallback = (path.split("/").pop() ?? path).replace(/\.md$/, "");
  if (raw === null) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** The previous generated region, minus the "regenerated on each run" hint. */
function lastKnownBody(generated: string): string {
  return generated.replace(GENERATED_HINT, "").trim();
}

export function renderTombstone(split: SplitFile, removedAt: string): FileParts {
  const preamble = split.parts.preamble.replace(
    /\n---\n(\s*)$/,
    `\nstatus: removed\nremovedAt: ${removedAt}\n---\n$1`,
  );
  const day = removedAt.slice(0, 10);
  const generated = [
    "",
    `> **Removed.** This element is no longer present in the schema as of ${day}.`,
    "",
    "## Last known definition",
    "",
    lastKnownBody(split.parts.generated),
    "",
    "",
  ].join("\n");

  return { preamble, generated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/tombstone.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reconcile/tombstone.ts src/reconcile/tombstone.test.ts
git commit -m "feat: render a removed concept as a tombstone in place"
```

---

## Task 6: Tombstones appear in directory indexes

**Files:**
- Modify: `src/emit/bundle.ts`
- Test: `src/emit/bundle.test.ts`

**Interfaces:**
- Consumes: `buildBundle` from Task 4.
- Produces: `TombstoneEntry` (`{ readonly path: string; readonly title: string }`) and the new signature `buildBundle(ir: SchemaIr, timestamp: string, tombstones?: readonly TombstoneEntry[]): ReadonlyMap<string, FileParts>`. A tombstone contributes an index bullet with the summary `(removed)` in its own directory, and forces that directory's `index.md` to exist even when every live concept has left it.

- [ ] **Step 1: Write the failing test**

Append to `src/emit/bundle.test.ts`:

```ts
describe("buildBundle with tombstones", () => {
  it("lists a tombstoned concept in its directory index, marked removed", () => {
    const bundle = buildBundle(irWithOneObject, "2026-07-24T00:00:00.000Z", [
      { path: "types/objects/LegacyOrder.md", title: "LegacyOrder" },
    ]);

    const index = bundle.get("types/objects/index.md");
    expect(index?.generated).toContain("- [LegacyOrder](LegacyOrder.md) — (removed)");
  });

  it("keeps a directory index alive when only tombstones remain in it", () => {
    const bundle = buildBundle(irWithNoInputs, "2026-07-24T00:00:00.000Z", [
      { path: "types/inputs/OldInput.md", title: "OldInput" },
    ]);

    expect(bundle.get("types/inputs/index.md")?.generated).toContain(
      "- [OldInput](OldInput.md) — (removed)",
    );
    expect(bundle.get("types/index.md")?.generated).toContain("- [inputs/](inputs/index.md)");
  });

  it("does not write a concept file for a tombstone", () => {
    const bundle = buildBundle(irWithOneObject, "2026-07-24T00:00:00.000Z", [
      { path: "types/objects/LegacyOrder.md", title: "LegacyOrder" },
    ]);

    expect(bundle.has("types/objects/LegacyOrder.md")).toBe(false);
  });
});
```

Define `irWithOneObject` and `irWithNoInputs` as `SchemaIr` literals alongside the
file's existing fixtures — reuse whatever literal the file already builds for a
single-object schema, and for `irWithNoInputs` use an IR whose only concept is a
query, so `types/inputs/` exists solely because of the tombstone.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/emit/bundle.test.ts`
Expected: FAIL — `buildBundle` takes two parameters; the index has no `(removed)` bullet.

- [ ] **Step 3: Extend `buildBundle`**

In `src/emit/bundle.ts`:

```ts
export interface TombstoneEntry {
  readonly path: string;
  readonly title: string;
}

export function buildBundle(
  ir: SchemaIr,
  timestamp: string,
  tombstones: readonly TombstoneEntry[] = [],
): ReadonlyMap<string, FileParts> {
```

After the loop that fills `filesByDir` from `ir.concepts`, add a parallel loop for
tombstones. Because `filesByDir` holds `ConceptNode[]`, introduce a second map
rather than faking a node:

```ts
  const tombstonesByDir = new Map<string, TombstoneEntry[]>();
  for (const tombstone of tombstones) {
    const dir = posix.dirname(tombstone.path);
    ensureDir(dir);
    const bucket = tombstonesByDir.get(dir);
    if (bucket === undefined) {
      tombstonesByDir.set(dir, [tombstone]);
    } else {
      bucket.push(tombstone);
    }
  }
```

and inside the per-directory index loop, after the concept entries:

```ts
    for (const tombstone of tombstonesByDir.get(dir) ?? []) {
      entries.push({
        label: tombstone.title,
        link: posix.basename(tombstone.path),
        summary: "(removed)",
      });
    }
```

`ensureDir` already walks parents, so a directory containing only tombstones still
gets an index and still appears in its parent's index.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS — including the existing bundle tests, since `tombstones` defaults to empty.

- [ ] **Step 5: Commit**

```bash
git add src/emit/bundle.ts src/emit/bundle.test.ts
git commit -m "feat: list tombstoned concepts in their directory index"
```

---

## Task 7: The reconcile plan — creates, updates, and no-ops

**Files:**
- Create: `src/reconcile/plan.ts`
- Test: `src/reconcile/plan.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces:

```ts
export interface ConceptChange {
  readonly name: string;
  readonly path: string;
}

export interface FileAction {
  readonly kind: "create" | "update" | "tombstone" | "index";
  readonly path: string;
  readonly contents: string;
}

export interface BundlePlan {
  readonly actions: readonly FileAction[];
  readonly added: readonly ConceptChange[];
  readonly changed: readonly ConceptChange[];
  readonly removed: readonly ConceptChange[];
  readonly unchanged: number;
}

export function reconcile(
  ir: SchemaIr,
  existing: ReadonlyMap<string, string>,
  timestamp: string,
): BundlePlan;
```

This task implements creates, updates, no-ops and index files. Task 8 adds
tombstones and restores to the same function.

- [ ] **Step 1: Write the failing test**

Create `src/reconcile/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBundle } from "../emit/bundle.js";
import { assembleFile, EMPTY_HUMAN } from "../emit/render/seam.js";
import type { SchemaIr } from "../model/ir.js";
import { reconcile } from "./plan.js";

const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-24T09:00:00.000Z";

const ir: SchemaIr = {
  resource: "schema.graphql",
  origin: "sdl",
  concepts: [
    {
      kind: "object",
      name: "Country",
      path: "types/objects/Country.md",
      description: "An ISO country.",
      appliedDirectives: [],
      fields: [],
      interfaces: [],
    },
  ],
};

/** The bundle exactly as a previous run would have left it on disk. */
function bundleOnDisk(source: SchemaIr, timestamp: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, parts] of buildBundle(source, timestamp)) {
    files.set(path, assembleFile(parts, EMPTY_HUMAN));
  }
  return files;
}

describe("reconcile", () => {
  it("creates every file when the bundle does not exist yet", () => {
    const plan = reconcile(ir, new Map(), T1);

    expect(plan.added.map((change) => change.path)).toEqual(["types/objects/Country.md"]);
    expect(plan.actions.some((action) => action.path === "index.md")).toBe(true);
    expect(plan.unchanged).toBe(0);
  });

  it("is a complete no-op against a bundle it just produced", () => {
    const plan = reconcile(ir, bundleOnDisk(ir, T1), T2);

    expect(plan.actions).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.changed).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("does not restamp an unchanged concept, even when the run's timestamp differs", () => {
    const disk = bundleOnDisk(ir, T1);

    const plan = reconcile(ir, disk, T2);

    expect(plan.actions).toEqual([]);
    expect(disk.get("types/objects/Country.md")).toContain(`timestamp: ${T1}`);
  });

  it("updates a concept whose rendered content changed, stamping the new time", () => {
    const disk = bundleOnDisk(ir, T1);
    const evolved: SchemaIr = {
      ...ir,
      concepts: [{ ...ir.concepts[0], description: "A sovereign state." } as never],
    };

    const plan = reconcile(evolved, disk, T2);
    const action = plan.actions.find((entry) => entry.path === "types/objects/Country.md");

    expect(plan.changed.map((change) => change.name)).toEqual(["Country"]);
    expect(action?.kind).toBe("update");
    expect(action?.contents).toContain(`timestamp: ${T2}`);
    expect(action?.contents).toContain("A sovereign state.");
  });

  it("preserves the human region verbatim when updating", () => {
    const disk = bundleOnDisk(ir, T1);
    const path = "types/objects/Country.md";
    disk.set(`${path}`, `${disk.get(path) ?? ""}\nOur team owns this type.\n`);
    const evolved: SchemaIr = {
      ...ir,
      concepts: [{ ...ir.concepts[0], description: "A sovereign state." } as never],
    };

    const plan = reconcile(evolved, disk, T2);
    const action = plan.actions.find((entry) => entry.path === path);

    expect(action?.contents).toContain("Our team owns this type.");
  });

  it("recreates a concept file a human deleted", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.delete("types/objects/Country.md");

    const plan = reconcile(ir, disk, T2);

    expect(plan.added.map((change) => change.path)).toEqual(["types/objects/Country.md"]);
  });

  it("leaves stray files alone and never lists them", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.set("guides/onboarding.md", "# Onboarding\n\nRead this first.\n");

    const plan = reconcile(ir, disk, T2);

    expect(plan.actions).toEqual([]);
  });

  it("upgrades a legacy marker-less index.md to the seam form without logging it", () => {
    const disk = bundleOnDisk(ir, T1);
    disk.set("index.md", "# API interface\n\n- [types/](types/index.md) — Types\n");

    const plan = reconcile(ir, disk, T2);

    expect(plan.actions.map((action) => action.path)).toEqual(["index.md"]);
    expect(plan.actions[0]?.kind).toBe("index");
    expect(plan.actions[0]?.contents).toContain("<!-- graphql-okf:generated:start -->");
    expect(plan.added).toEqual([]);
    expect(plan.changed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/plan.test.ts`
Expected: FAIL — cannot resolve `./plan.js`.

- [ ] **Step 3: Write the implementation**

Create `src/reconcile/plan.ts`:

```ts
import { buildBundle } from "../emit/bundle.js";
import { assembleFile, EMPTY_HUMAN, type FileParts } from "../emit/render/seam.js";
import type { SchemaIr } from "../model/ir.js";
import { mergeFrontmatter, withoutTimestamp } from "./frontmatter.js";
import { splitFile, type SplitFile } from "./parse.js";

export interface ConceptChange {
  readonly name: string;
  readonly path: string;
}

export interface FileAction {
  readonly kind: "create" | "update" | "tombstone" | "index";
  readonly path: string;
  readonly contents: string;
}

export interface BundlePlan {
  readonly actions: readonly FileAction[];
  readonly added: readonly ConceptChange[];
  readonly changed: readonly ConceptChange[];
  readonly removed: readonly ConceptChange[];
  readonly unchanged: number;
}

export function isIndexPath(path: string): boolean {
  return path === "index.md" || path.endsWith("/index.md");
}

/**
 * Files graphql-okf owns, keyed by path. A file is owned when it carries the
 * generated markers; `index.md` is owned by its reserved name, so a legacy
 * marker-less index is picked up and upgraded rather than mistaken for a stray.
 */
function ownedFiles(existing: ReadonlyMap<string, string>): Map<string, SplitFile> {
  const owned = new Map<string, SplitFile>();
  for (const [path, text] of existing) {
    if (path === "log.md") {
      continue;
    }
    const split = splitFile(text, path);
    if (split !== null) {
      owned.set(path, split);
    } else if (isIndexPath(path)) {
      owned.set(path, { parts: { preamble: text, generated: "" }, human: "" });
    }
  }
  return owned;
}

function sameContent(rendered: FileParts, existing: FileParts): boolean {
  return (
    rendered.generated === existing.generated &&
    withoutTimestamp(rendered.preamble) === withoutTimestamp(existing.preamble)
  );
}

export function reconcile(
  ir: SchemaIr,
  existing: ReadonlyMap<string, string>,
  timestamp: string,
): BundlePlan {
  const owned = ownedFiles(existing);

  const actions: FileAction[] = [];
  const added: ConceptChange[] = [];
  const changed: ConceptChange[] = [];
  const removed: ConceptChange[] = [];
  let unchanged = 0;

  const names = new Map(ir.concepts.map((concept) => [concept.path, concept.name]));

  for (const [path, rendered] of buildBundle(ir, timestamp)) {
    const current = owned.get(path);
    const index = isIndexPath(path);

    if (current === undefined) {
      actions.push({
        kind: index ? "index" : "create",
        path,
        contents: assembleFile(rendered, EMPTY_HUMAN),
      });
      if (!index) {
        added.push({ name: names.get(path) ?? path, path });
      }
      continue;
    }

    const merged: FileParts = {
      preamble: mergeFrontmatter(rendered.preamble, current.parts.preamble),
      generated: rendered.generated,
    };

    if (sameContent(merged, current.parts)) {
      if (!index) {
        unchanged += 1;
      }
      continue;
    }

    actions.push({
      kind: index ? "index" : "update",
      path,
      contents: assembleFile(merged, current.human),
    });
    if (!index) {
      changed.push({ name: names.get(path) ?? path, path });
    }
  }

  return { actions, added, changed, removed, unchanged };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/plan.test.ts`
Expected: PASS, all eight cases.

- [ ] **Step 5: Commit**

```bash
git add src/reconcile/plan.ts src/reconcile/plan.test.ts
git commit -m "feat: reconcile creates, updates and no-op re-runs"
```

---

## Task 8: The reconcile plan — tombstones and restores

**Files:**
- Modify: `src/reconcile/plan.ts`
- Test: `src/reconcile/plan.test.ts`

**Interfaces:**
- Consumes: `isTombstoned`, `titleOf`, `renderTombstone` (Task 5); `TombstoneEntry` (Task 6).
- Produces: no signature change. `reconcile` now also emits `tombstone` actions, populates `removed`, passes tombstones through to `buildBundle`, skips already-tombstoned files, and classifies a restored concept as **added**.

- [ ] **Step 1: Write the failing test**

Append to `src/reconcile/plan.test.ts`:

```ts
const emptyIr: SchemaIr = { resource: "schema.graphql", origin: "sdl", concepts: [] };

describe("reconcile removals", () => {
  it("tombstones a concept the schema no longer contains", () => {
    const disk = bundleOnDisk(ir, T1);

    const plan = reconcile(emptyIr, disk, T2);
    const action = plan.actions.find((entry) => entry.path === "types/objects/Country.md");

    expect(plan.removed.map((change) => change.name)).toEqual(["Country"]);
    expect(action?.kind).toBe("tombstone");
    expect(action?.contents).toContain("status: removed");
    expect(action?.contents).toContain(`removedAt: ${T2}`);
    expect(action?.contents).toContain("## Last known definition");
  });

  it("keeps the tombstoned file at its original path so inbound links resolve", () => {
    const plan = reconcile(emptyIr, bundleOnDisk(ir, T1), T2);

    expect(plan.actions.map((action) => action.path)).toContain("types/objects/Country.md");
  });

  it("preserves the human region of a concept it tombstones", () => {
    const disk = bundleOnDisk(ir, T1);
    const path = "types/objects/Country.md";
    disk.set(path, `${disk.get(path) ?? ""}\nStill referenced by the billing service.\n`);

    const plan = reconcile(emptyIr, disk, T2);
    const action = plan.actions.find((entry) => entry.path === path);

    expect(action?.contents).toContain("Still referenced by the billing service.");
  });

  it("never re-tombstones: a second run against the same schema is a no-op", () => {
    const disk = bundleOnDisk(ir, T1);
    const first = reconcile(emptyIr, disk, T2);
    for (const action of first.actions) {
      disk.set(action.path, action.contents);
    }

    const second = reconcile(emptyIr, disk, "2026-08-01T00:00:00.000Z");

    expect(second.actions).toEqual([]);
    expect(second.removed).toEqual([]);
  });

  it("restores a concept that comes back, logging it as added", () => {
    const disk = bundleOnDisk(ir, T1);
    for (const action of reconcile(emptyIr, disk, T2).actions) {
      disk.set(action.path, action.contents);
    }

    const plan = reconcile(ir, disk, "2026-08-01T00:00:00.000Z");
    const action = plan.actions.find((entry) => entry.path === "types/objects/Country.md");

    expect(plan.added.map((change) => change.name)).toEqual(["Country"]);
    expect(plan.changed).toEqual([]);
    expect(action?.contents).not.toContain("status: removed");
    expect(action?.contents).not.toContain("removedAt:");
    expect(action?.contents).not.toContain("Last known definition");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/plan.test.ts`
Expected: FAIL — no tombstone action is produced; `plan.removed` is empty.

- [ ] **Step 3: Extend `reconcile`**

In `src/reconcile/plan.ts`, add the imports:

```ts
import type { TombstoneEntry } from "../emit/bundle.js";
import { isTombstoned, renderTombstone, titleOf } from "./tombstone.js";
```

Insert the tombstone pass immediately after `const owned = ownedFiles(existing);`
and before the counters, then thread it into `buildBundle`:

```ts
  const irPaths = new Set(ir.concepts.map((concept) => concept.path));
  const tombstones: TombstoneEntry[] = [];
  const newlyRemoved: { change: ConceptChange; split: SplitFile }[] = [];

  for (const [path, split] of owned) {
    if (isIndexPath(path) || irPaths.has(path)) {
      continue;
    }
    const title = titleOf(split, path);
    tombstones.push({ path, title });
    if (!isTombstoned(split)) {
      newlyRemoved.push({ change: { name: title, path }, split });
    }
  }
```

Change the main loop's header to pass them through:

```ts
  for (const [path, rendered] of buildBundle(ir, timestamp, tombstones)) {
```

In the update branch, classify a restore as added rather than changed. Replace the
whole `actions.push({ kind: index ? "index" : "update", … })` block and the
`if (!index) { changed.push(…) }` that follows it with:

```ts
    actions.push({
      kind: index ? "index" : "update",
      path,
      contents: assembleFile(merged, current.human),
    });
    if (!index) {
      const change: ConceptChange = { name: names.get(path) ?? path, path };
      if (isTombstoned(current)) {
        added.push(change);
      } else {
        changed.push(change);
      }
    }
```

Finally, after the main loop and before the `return`, emit the tombstone actions:

```ts
  for (const { change, split } of newlyRemoved) {
    actions.push({
      kind: "tombstone",
      path: change.path,
      contents: assembleFile(renderTombstone(split, timestamp), split.human),
    });
    removed.push(change);
  }
```

Note the already-tombstoned case needs no code: such a file is in `tombstones`
(so it stays in its index) but not in `newlyRemoved`, and `buildBundle` emits no
concept file for it, so nothing touches it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/plan.test.ts`
Expected: PASS — all thirteen cases across both describes.

- [ ] **Step 5: Commit**

```bash
git add src/reconcile/plan.ts src/reconcile/plan.test.ts
git commit -m "feat: tombstone removed concepts and restore returning ones"
```

---

## Task 9: Rendering the log entry

**Files:**
- Create: `src/reconcile/log.ts`
- Test: `src/reconcile/log.test.ts`

**Interfaces:**
- Consumes: `BundlePlan` (Task 7).
- Produces: `hasLoggableChanges(plan: BundlePlan): boolean` and `renderLogEntry(plan: BundlePlan, timestamp: string): string` — one `## <ISO>` section with non-empty **Added** / **Changed** / **Removed** groups, ending in a blank line so successive appends stay separated.

- [ ] **Step 1: Write the failing test**

Create `src/reconcile/log.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BundlePlan } from "./plan.js";
import { hasLoggableChanges, renderLogEntry } from "./log.js";

const T = "2026-07-24T09:00:00.000Z";

const plan: BundlePlan = {
  actions: [],
  added: [
    { name: "Invoice", path: "types/objects/Invoice.md" },
    { name: "invoices", path: "queries/invoices.md" },
  ],
  changed: [{ name: "User", path: "types/objects/User.md" }],
  removed: [{ name: "LegacyOrder", path: "types/objects/LegacyOrder.md" }],
  unchanged: 12,
};

describe("renderLogEntry", () => {
  it("renders one dated section with a group per kind of change", () => {
    expect(renderLogEntry(plan, T)).toBe(
      [
        `## ${T}`,
        "",
        "**Added**",
        "",
        "- [`Invoice`](types/objects/Invoice.md)",
        "- [`invoices`](queries/invoices.md)",
        "",
        "**Changed**",
        "",
        "- [`User`](types/objects/User.md)",
        "",
        "**Removed**",
        "",
        "- [`LegacyOrder`](types/objects/LegacyOrder.md)",
        "",
      ].join("\n"),
    );
  });

  it("omits groups that are empty", () => {
    const entry = renderLogEntry({ ...plan, changed: [], removed: [] }, T);

    expect(entry).toContain("**Added**");
    expect(entry).not.toContain("**Changed**");
    expect(entry).not.toContain("**Removed**");
  });
});

describe("hasLoggableChanges", () => {
  it("is false for an index-only plan, which the log does not record", () => {
    const indexOnly: BundlePlan = {
      actions: [{ kind: "index", path: "index.md", contents: "x" }],
      added: [],
      changed: [],
      removed: [],
      unchanged: 3,
    };

    expect(hasLoggableChanges(indexOnly)).toBe(false);
  });

  it("is true when any concept changed", () => {
    expect(hasLoggableChanges(plan)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/log.test.ts`
Expected: FAIL — cannot resolve `./log.js`.

- [ ] **Step 3: Write the implementation**

Create `src/reconcile/log.ts`:

```ts
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
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/log.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reconcile/log.ts src/reconcile/log.test.ts
git commit -m "feat: render an append-only log.md entry"
```

---

## Task 10: Reading an existing bundle

**Files:**
- Create: `src/reconcile/read.ts`
- Test: `src/reconcile/read.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `readExistingBundle(outDir: string): Promise<ReadonlyMap<string, string>>` — every `.md` file under `outDir`, keyed by POSIX-style relative path, **sorted by path** so downstream iteration is deterministic. A missing directory yields an empty map. Also `isEmptyOrMissing(outDir: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

Create `src/reconcile/read.test.ts`:

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmptyOrMissing, readExistingBundle } from "./read.js";

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "okf-read-"));
}

describe("readExistingBundle", () => {
  it("returns an empty map for a directory that does not exist", async () => {
    const dir = join(await workspace(), "absent");

    expect((await readExistingBundle(dir)).size).toBe(0);
  });

  it("reads nested markdown files keyed by POSIX relative path, sorted", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types", "objects"), { recursive: true });
    await writeFile(join(dir, "index.md"), "root\n");
    await writeFile(join(dir, "types", "objects", "Country.md"), "country\n");

    const files = await readExistingBundle(dir);

    expect([...files.keys()]).toEqual(["index.md", "types/objects/Country.md"]);
    expect(files.get("types/objects/Country.md")).toBe("country\n");
  });

  it("ignores files that are not markdown", async () => {
    const dir = await workspace();
    await writeFile(join(dir, "index.md"), "root\n");
    await writeFile(join(dir, "schema.graphql"), "type Query { a: Int }\n");

    expect([...(await readExistingBundle(dir)).keys()]).toEqual(["index.md"]);
  });
});

describe("isEmptyOrMissing", () => {
  it("is true for a missing directory", async () => {
    expect(await isEmptyOrMissing(join(await workspace(), "absent"))).toBe(true);
  });

  it("is true for an empty directory", async () => {
    expect(await isEmptyOrMissing(await workspace())).toBe(true);
  });

  it("is false once the directory holds anything", async () => {
    const dir = await workspace();
    await writeFile(join(dir, "index.md"), "root\n");

    expect(await isEmptyOrMissing(dir)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/read.test.ts`
Expected: FAIL — cannot resolve `./read.js`.

- [ ] **Step 3: Write the implementation**

Create `src/reconcile/read.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function collect(root: string, relative: string, out: string[]): Promise<void> {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      await collect(root, child, out);
    } else if (entry.name.endsWith(".md")) {
      out.push(child);
    }
  }
}

export async function readExistingBundle(outDir: string): Promise<ReadonlyMap<string, string>> {
  const paths: string[] = [];
  try {
    await collect(outDir, "", paths);
  } catch {
    return new Map();
  }
  paths.sort();

  const files = new Map<string, string>();
  for (const path of paths) {
    files.set(path, await readFile(join(outDir, path), "utf8"));
  }
  return files;
}

export async function isEmptyOrMissing(outDir: string): Promise<boolean> {
  try {
    return (await readdir(outDir)).length === 0;
  } catch {
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/read.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reconcile/read.ts src/reconcile/read.test.ts
git commit -m "feat: read an existing bundle off disk"
```

---

## Task 11: Applying the plan

**Files:**
- Create: `src/reconcile/apply.ts`
- Test: `src/reconcile/apply.test.ts`

**Interfaces:**
- Consumes: `BundlePlan` (Task 7), `renderLogEntry` / `hasLoggableChanges` (Task 9).
- Produces: `applyPlan(plan: BundlePlan, outDir: string, timestamp: string): Promise<void>` — returns immediately for an empty plan; otherwise appends the log entry **first** (only when `hasLoggableChanges`), then writes each action through a temp file and a rename.

- [ ] **Step 1: Write the failing test**

Create `src/reconcile/apply.test.ts`:

```ts
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan } from "./apply.js";
import type { BundlePlan } from "./plan.js";

const T = "2026-07-24T09:00:00.000Z";

const empty: BundlePlan = {
  actions: [],
  added: [],
  changed: [],
  removed: [],
  unchanged: 4,
};

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "okf-apply-"));
}

describe("applyPlan", () => {
  it("writes nothing at all for an empty plan", async () => {
    const dir = await workspace();

    await applyPlan(empty, dir, T);

    expect(await readdir(dir)).toEqual([]);
  });

  it("creates nested files and their directories", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "create", path: "types/objects/Country.md", contents: "country\n" }],
      added: [{ name: "Country", path: "types/objects/Country.md" }],
      unchanged: 0,
    };

    await applyPlan(plan, dir, T);

    expect(await readFile(join(dir, "types/objects/Country.md"), "utf8")).toBe("country\n");
  });

  it("leaves no temp files behind", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "index", path: "index.md", contents: "root\n" }],
    };

    await applyPlan(plan, dir, T);

    expect(await readdir(dir)).toEqual(["index.md"]);
  });

  it("appends the log entry to an existing log.md rather than replacing it", async () => {
    const dir = await workspace();
    await writeFile(join(dir, "log.md"), "# Change log\n\n## 2026-07-01T00:00:00.000Z\n\n");
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "create", path: "queries/a.md", contents: "a\n" }],
      added: [{ name: "a", path: "queries/a.md" }],
    };

    await applyPlan(plan, dir, T);
    const log = await readFile(join(dir, "log.md"), "utf8");

    expect(log).toContain("## 2026-07-01T00:00:00.000Z");
    expect(log.indexOf("## 2026-07-01")).toBeLessThan(log.indexOf(`## ${T}`));
    expect(log).toContain("- [`a`](queries/a.md)");
  });

  it("writes no log entry for a plan that only touches index files", async () => {
    const dir = await workspace();
    const plan: BundlePlan = {
      ...empty,
      actions: [{ kind: "index", path: "index.md", contents: "root\n" }],
    };

    await applyPlan(plan, dir, T);

    expect(await readdir(dir)).toEqual(["index.md"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/reconcile/apply.test.ts`
Expected: FAIL — cannot resolve `./apply.js`.

- [ ] **Step 3: Write the implementation**

Create `src/reconcile/apply.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/reconcile/apply.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reconcile/apply.ts src/reconcile/apply.test.ts
git commit -m "feat: apply a reconcile plan with log-first, atomic writes"
```

---

## Task 12: `syncOkfBundle` replaces `createOkfBundle`

**Files:**
- Modify: `src/index.ts`
- Modify: `src/cli.ts`
- Modify: `src/errors.ts`
- Delete: `src/emit/write.ts`, `src/emit/write.test.ts`
- Test: `src/index.test.ts` (rewrite), `src/cli.test.ts` (update the import)

**Interfaces:**
- Consumes: `reconcile` (Tasks 7–8), `applyPlan` (Task 11), `readExistingBundle` / `isEmptyOrMissing` (Task 10).
- Produces:

```ts
export interface SyncOkfBundleOptions {
  readonly source: SourceSpec;
  readonly outDir: string;
  readonly now?: string;
}

export interface SyncResult {
  readonly created: boolean;
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: number;
}

export function syncOkfBundle(options: SyncOkfBundleOptions): Promise<SyncResult>;
```

`createOkfBundle`, `writeBundle` and the `OUTPUT_NOT_EMPTY` error code are removed —
creation is reconciliation against an empty bundle.

- [ ] **Step 1: Write the failing test**

Replace `src/index.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphqlOkfError } from "./errors.js";
import { syncOkfBundle } from "./index.js";

const SDL = '"An ISO country." type Country { code: ID! } type Query { countries: [Country!]! }';

async function workspaceWithSdl(sdl: string = SDL): Promise<{ sdlPath: string; outDir: string }> {
  const workspace = await mkdtemp(join(tmpdir(), "okf-e2e-"));
  const sdlPath = join(workspace, "schema.graphql");
  await writeFile(sdlPath, sdl);
  return { sdlPath, outDir: join(workspace, "bundle") };
}

describe("syncOkfBundle", () => {
  it("creates a bundle in a fresh directory and reports what it added", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-07-24T09:00:00.000Z",
    });

    expect(result.created).toBe(true);
    expect(result.added).toContain("types/objects/Country.md");
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(await readFile(join(outDir, "types/objects/Country.md"), "utf8")).toContain(
      "type: object",
    );
  });

  it("writes an initial log.md listing every concept as added", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();

    await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-07-24T09:00:00.000Z",
    });

    const log = await readFile(join(outDir, "log.md"), "utf8");
    expect(log).toContain("## 2026-07-24T09:00:00.000Z");
    expect(log).toContain("**Added**");
    expect(log).toContain("- [`Country`](types/objects/Country.md)");
  });

  it("refuses a non-empty directory that is not a bundle", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "notes.txt"), "not a bundle\n");

    let code = "no-error";
    try {
      await syncOkfBundle({ source: { kind: "sdl", path: sdlPath }, outDir });
    } catch (error) {
      code = (error as GraphqlOkfError).code;
    }

    expect(code).toBe("NOT_A_BUNDLE");
  });

  it("reports created: false when reconciling an existing bundle", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();
    await syncOkfBundle({ source: { kind: "sdl", path: sdlPath }, outDir, now: "2026-07-24T09:00:00.000Z" });

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-08-01T00:00:00.000Z",
    });

    expect(result.created).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.unchanged).toBeGreaterThan(0);
  });

  it("defaults the timestamp to the current wall-clock time when `now` is omitted", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl("type Query { hello: String }");

    await syncOkfBundle({ source: { kind: "sdl", path: sdlPath }, outDir });

    const hello = await readFile(join(outDir, "queries/hello.md"), "utf8");
    expect(hello.match(/^timestamp: (.+)$/m)?.[1]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/index.test.ts`
Expected: FAIL — `syncOkfBundle` is not exported.

- [ ] **Step 3a: Update the error codes**

In `src/errors.ts`, remove `| "OUTPUT_NOT_EMPTY"` and add `| "NOT_A_BUNDLE"`.

- [ ] **Step 3b: Rewrite the entry point**

In `src/index.ts`, replace the `CreateOkfBundleOptions` interface and
`createOkfBundle` function (and the now-unused `buildBundle` / `writeBundle` /
`assembleFile` imports) with:

```ts
import { GraphqlOkfError } from "./errors.js";
import { applyPlan } from "./reconcile/apply.js";
import { reconcile } from "./reconcile/plan.js";
import { isEmptyOrMissing, readExistingBundle } from "./reconcile/read.js";

export interface SyncOkfBundleOptions {
  readonly source: SourceSpec;
  readonly outDir: string;
  readonly now?: string;
}

export interface SyncResult {
  readonly created: boolean;
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: number;
}

export async function syncOkfBundle(options: SyncOkfBundleOptions): Promise<SyncResult> {
  const created = await isEmptyOrMissing(options.outDir);
  const existing = created ? new Map<string, string>() : await readExistingBundle(options.outDir);

  if (!created && !existing.has("index.md")) {
    throw new GraphqlOkfError(
      "NOT_A_BUNDLE",
      `"${options.outDir}" is not empty and does not look like a graphql-okf bundle (no root index.md). Choose an empty directory or an existing bundle.`,
    );
  }

  const ir = await readSchema(options.source);
  const timestamp = options.now ?? new Date().toISOString();
  const plan = reconcile(ir, existing, timestamp);
  await applyPlan(plan, options.outDir, timestamp);

  return {
    created,
    added: plan.added.map((change) => change.path),
    changed: plan.changed.map((change) => change.path),
    removed: plan.removed.map((change) => change.path),
    unchanged: plan.unchanged,
  };
}
```

Keep every existing `export type` re-export. Add `SyncOkfBundleOptions` and
`SyncResult` to the public surface (they are exported inline above).

- [ ] **Step 3c: Delete the create-only writer**

```bash
git rm src/emit/write.ts src/emit/write.test.ts
```

- [ ] **Step 3d: Point the CLI at the new verb**

In `src/cli.ts`, change the import and the call:

```ts
import { syncOkfBundle } from "./index.js";
// …
    await syncOkfBundle({ source, outDir });
```

- [ ] **Step 4: Run the suite**

Run: `pnpm test`
Expected: PASS. If `src/cli.test.ts` imported `createOkfBundle`, update it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: syncOkfBundle creates or updates a bundle in one verb"
```

---

## Task 13: End-to-end reconcile behavior

**Files:**
- Create: `test/fixtures/kitchen-sink-evolved.graphql`
- Create: `test/reconcile.test.ts`

**Interfaces:**
- Consumes: `syncOkfBundle` (Task 12).
- Produces: nothing importable. This task proves `DOD-G-3` and `DOD-G-4` against real files on disk.

- [ ] **Step 1: Create the evolved fixture**

Copy `test/fixtures/kitchen-sink.graphql` to
`test/fixtures/kitchen-sink-evolved.graphql` and make exactly three kinds of edit,
so the test can assert one of each:

1. **Add** a new object type `Invoice` with two fields and a doc-string, and a
   root query `invoices: [Invoice!]!` returning it.
2. **Change** an existing type: add a doc-string to one field of a type that
   already exists in the base fixture.
3. **Remove** one existing object type entirely, along with every field and
   argument that referenced it, so the evolved schema still validates.

Record which type you removed — the test below refers to it as `RemovedType`;
substitute the real name.

- [ ] **Step 2: Write the failing test**

Create `test/reconcile.test.ts`:

```ts
import { cp, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncOkfBundle } from "../src/index.js";

const BASE = new URL("./fixtures/kitchen-sink.graphql", import.meta.url).pathname;
const EVOLVED = new URL("./fixtures/kitchen-sink-evolved.graphql", import.meta.url).pathname;

const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-24T09:00:00.000Z";

async function snapshot(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (relative: string): Promise<void> => {
    for (const entry of await readdir(join(dir, relative), { withFileTypes: true })) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(child);
      } else {
        files.set(child, await readFile(join(dir, child), "utf8"));
      }
    }
  };
  await walk("");
  return files;
}

async function freshBundle(sdl: string): Promise<string> {
  const outDir = join(await mkdtemp(join(tmpdir(), "okf-recon-")), "bundle");
  await syncOkfBundle({ source: { kind: "sdl", path: sdl }, outDir, now: T1 });
  return outDir;
}

describe("re-running against an unchanged schema", () => {
  it("is a byte-for-byte no-op with no new log entry (DOD-G-3)", async () => {
    const outDir = await freshBundle(BASE);
    const before = await snapshot(outDir);
    const logBefore = before.get("log.md");

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(await snapshot(outDir)).toEqual(before);
    expect((await snapshot(outDir)).get("log.md")).toBe(logBefore);
  });

  it("does not even touch file mtimes", async () => {
    const outDir = await freshBundle(BASE);
    const target = join(outDir, "index.md");
    const before = (await stat(target)).mtimeMs;

    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect((await stat(target)).mtimeMs).toBe(before);
  });

  it("stays a no-op on a bundle that already contains a tombstone", async () => {
    const outDir = await freshBundle(EVOLVED);
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });
    const before = await snapshot(outDir);

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: BASE },
      outDir,
      now: "2026-09-01T00:00:00.000Z",
    });

    expect(result.removed).toEqual([]);
    expect(await snapshot(outDir)).toEqual(before);
  });
});

describe("re-running against an evolved schema (DOD-G-4)", () => {
  it("adds, updates and tombstones exactly the affected concepts", async () => {
    const outDir = await freshBundle(BASE);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    expect(result.added).toContain("types/objects/Invoice.md");
    expect(result.added).toContain("queries/invoices.md");
    expect(result.removed).toContain("types/objects/RemovedType.md");
    expect(result.changed.length).toBeGreaterThan(0);
  });

  it("appends one dated log entry describing the change", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const log = await readFile(join(outDir, "log.md"), "utf8");

    expect(log).toContain(`## ${T2}`);
    expect(log).toContain("- [`Invoice`](types/objects/Invoice.md)");
    expect(log).toContain("**Removed**");
    expect(log.indexOf(`## ${T1}`)).toBeLessThan(log.indexOf(`## ${T2}`));
  });

  it("preserves human prose in a concept it updates", async () => {
    const outDir = await freshBundle(BASE);
    const target = join(outDir, "types/objects/RemovedType.md");
    await writeFile(target, `${await readFile(target, "utf8")}\n## Ownership\n\nBilling team.\n`);

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const after = await readFile(target, "utf8");
    expect(after).toContain("status: removed");
    expect(after).toContain("Billing team.");
  });

  it("keeps a tombstone listed in its directory index", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const index = await readFile(join(outDir, "types/objects/index.md"), "utf8");

    expect(index).toContain("— (removed)");
  });

  it("leaves a stray human file untouched and unlisted", async () => {
    const outDir = await freshBundle(BASE);
    await writeFile(join(outDir, "ONBOARDING.md"), "# Onboarding\n\nStart here.\n");

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    expect(await readFile(join(outDir, "ONBOARDING.md"), "utf8")).toBe(
      "# Onboarding\n\nStart here.\n",
    );
    expect(await readFile(join(outDir, "index.md"), "utf8")).not.toContain("ONBOARDING");
  });

  it("keeps every Markdown link resolving after a removal", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const files = await snapshot(outDir);
    const missing: string[] = [];
    for (const [path, contents] of files) {
      if (path === "log.md") continue;
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      for (const match of contents.matchAll(/\]\((?!https?:)([^)]+\.md)\)/g)) {
        const target = match[1];
        if (target === undefined) continue;
        const resolved = new URL(target, `file:///${dir === "" ? "" : `${dir}/`}`).pathname.slice(1);
        if (!files.has(resolved)) missing.push(`${path} -> ${target}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("restores a concept when the schema brings it back", async () => {
    const outDir = await freshBundle(BASE);
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: BASE },
      outDir,
      now: "2026-09-01T00:00:00.000Z",
    });

    expect(result.added).toContain("types/objects/RemovedType.md");
    const restored = await readFile(join(outDir, "types/objects/RemovedType.md"), "utf8");
    expect(restored).not.toContain("status: removed");
    expect(restored).not.toContain("Last known definition");
  });
});
```

The unused `cp` import in the snippet above should be dropped if your final test
does not need it — Biome will flag it.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run test/reconcile.test.ts`
Expected: FAIL — the evolved fixture's names do not match until you substitute the
real `RemovedType` name and confirm `Invoice` / `invoices` exist.

- [ ] **Step 4: Fix names until green**

Substitute the actual removed type name throughout, then run again.

Run: `pnpm vitest run test/reconcile.test.ts`
Expected: PASS, all eleven cases.

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/kitchen-sink-evolved.graphql test/reconcile.test.ts
git commit -m "test: end-to-end idempotence, evolution and human-edit preservation"
```

---

## Task 14: Interrupted runs converge

**Files:**
- Test: `test/reconcile.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `reconcile` and `applyPlan` directly, so a partial apply can be simulated without patching the filesystem.

- [ ] **Step 1: Write the failing test**

Append to `test/reconcile.test.ts`:

```ts
import { readExistingBundle } from "../src/reconcile/read.js";
import { reconcile } from "../src/reconcile/plan.js";
import { applyPlan } from "../src/reconcile/apply.js";
import { readSchema } from "../src/index.js";

describe("an interrupted run (GOAL-8.5)", () => {
  it("converges on the next run to the same bytes an uninterrupted run produces", async () => {
    const interrupted = await freshBundle(BASE);
    const clean = await freshBundle(BASE);

    // Uninterrupted: the reference result.
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir: clean, now: T2 });

    // Interrupted: apply only the first half of the very same plan.
    const ir = await readSchema({ kind: "sdl", path: EVOLVED });
    const existing = await readExistingBundle(interrupted);
    const plan = reconcile(ir, existing, T2);
    const half = Math.floor(plan.actions.length / 2);
    expect(half).toBeGreaterThan(0);
    await applyPlan({ ...plan, actions: plan.actions.slice(0, half) }, interrupted, T2);

    // The next run finishes the job.
    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir: interrupted, now: T2 });

    const recovered = await snapshot(interrupted);
    const reference = await snapshot(clean);
    recovered.delete("log.md");
    reference.delete("log.md");
    expect(recovered).toEqual(reference);
  });

  it("leaves no temp files behind after recovery", async () => {
    const outDir = await freshBundle(BASE);
    const ir = await readSchema({ kind: "sdl", path: EVOLVED });
    const plan = reconcile(ir, await readExistingBundle(outDir), T2);
    await applyPlan({ ...plan, actions: plan.actions.slice(0, 2) }, outDir, T2);

    await syncOkfBundle({ source: { kind: "sdl", path: EVOLVED }, outDir, now: T2 });

    const files = await snapshot(outDir);
    expect([...files.keys()].filter((path) => path.includes("graphql-okf-tmp"))).toEqual([]);
  });
});
```

Note the `log.md` deletion before comparing: the interrupted bundle legitimately
has two entries (one from the interrupted run, one from the run that finished the
job) where the clean bundle has one. Every other byte must match.

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `pnpm vitest run test/reconcile.test.ts`
Expected: PASS if the design holds. **If it fails, the convergence property is
broken — fix `reconcile`/`applyPlan`, not the test.** The most likely culprit is a
comparison that is not an exact inverse of assembly.

- [ ] **Step 3: Commit**

```bash
git add test/reconcile.test.ts
git commit -m "test: an interrupted reconcile converges on re-run"
```

---

## Task 15: Full validation, docs, and regenerated examples

**Files:**
- Modify: `README.md`
- Regenerate: `okf/countries-api/`, `okf/gitlab-api/`

- [ ] **Step 1: Run the full gate**

```bash
pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Expected: all pass. If a branch is under threshold, add the missing case as its own
test — likely candidates are `titleOf`'s JSON-parse fallback, `splitFile`'s
duplicate-marker branches, `mergeFrontmatter`'s no-frontmatter branch, and
`readExistingBundle`'s missing-directory branch.

If knip reports an unused export, it is almost certainly a leftover from the
deleted `write.ts` — remove it rather than adding an ignore rule.

- [ ] **Step 2: Update the README**

Replace every mention of `createOkfBundle` with `syncOkfBundle`, and add a section
documenting the update behavior. It must state: the bundle is safe to re-run
against; edits **below** the `graphql-okf:generated:end` marker are preserved and
edits **inside** the generated region are not; removed elements are tombstoned in
place with `status: removed` rather than deleted; `log.md` records every change;
and unknown frontmatter keys are preserved.

- [ ] **Step 3: Regenerate the example bundles**

```bash
rm -rf okf/countries-api okf/gitlab-api
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
```

Regenerate the GitLab bundle from whatever source the previous run used (see the
README section describing it). Then prove idempotence on real output:

```bash
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
git status --short okf/countries-api
```

Expected: the second run prints nothing new and `git status` shows **no
modifications** — the real-world proof of `DOD-G-3`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: document the update behavior and regenerate example bundles"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 architecture → Tasks 1–11 map one-to-one onto the module
  table. §2.2 ownership rule incl. the reserved-name carve-out → Task 7
  (`ownedFiles`, legacy index upgrade test). §3.1 `parseConceptFile` → Task 2
  (named `splitFile`; the spec's prose name is not a code identifier). §3.1
  unknown-key preservation → Task 3. §3.2 comparison → Task 7 (`sameContent`).
  §4 decision table → Tasks 7 (rows 1–3) and 8 (rows 4–6). §4.1 tombstone format →
  Task 5. §5 index seam + tombstones listed → Tasks 4 and 6. §5 strays → Task 7
  test and Task 13 test. §6 log → Tasks 9 and 11. §7 apply/log-first/atomic →
  Task 11; convergence → Task 14. §8 one verb + `NOT_A_BUNDLE` + create-as-empty
  reconcile + deleting `writeBundle` → Task 12. §8.1 both error codes → Tasks 2
  and 12. §9 testing → Tasks 13–15. §10 DoD → Task 15 gate.
- **Placeholder scan:** one deliberate exception — Task 13 Step 1 asks the
  implementer to author the evolved fixture and substitute the real removed-type
  name, because the concrete edit depends on the contents of the existing
  kitchen-sink fixture. Every step states exactly what to write and the test that
  proves it.
- **Type consistency:** `FileParts` (Task 1) is consumed unchanged by Tasks 2, 4,
  5, 6, 7. `SplitFile` (Task 2) by Tasks 5, 7, 8. `TombstoneEntry` (Task 6) by
  Task 8. `BundlePlan` / `ConceptChange` / `FileAction` (Task 7) by Tasks 8, 9,
  11, 12, 14. `buildBundle`'s third parameter is optional, so Task 4's two-arg
  calls stay valid after Task 6. `renderDirectoryIndex` returns `FileParts` from
  Task 4 onward and every caller is updated in that same task.
- **Deletions are accounted for:** `write.ts`, `write.test.ts`, `createOkfBundle`
  and `OUTPUT_NOT_EMPTY` all disappear in Task 12; Task 15's knip run is the
  backstop for anything left dangling.
