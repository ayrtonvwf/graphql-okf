# Flatten the type directory tree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every type concept from `types/<kind>/<Name>.md` to `types/<Name>.md`, fold the kind distinction into `types/index.md` as headings, and migrate existing bundles in place without losing human-authored content.

**Architecture:** Three separable changes. (1) `renderDirectoryIndex` grows sections so an index can carry `##` headings; `buildBundle` groups concepts by kind when a directory holds more than one. (2) `DIRECTORY_BY_KIND` collapses its six type rows to `types`, which is the entire path change — `resolvePaths` already disambiguates per directory, so its case-fold and reserved-name rules start applying across kinds for free. (3) A new `relayoutBundle` pre-pass rewrites an existing bundle's file map before reconciliation, moving owned concept files, redirecting legacy kind indexes that carry human text, and deleting the rest — which requires teaching `applyPlan` to delete, something graphql-okf has never done.

**Tech Stack:** TypeScript (strict, ESM), Node 24, pnpm, Vitest + v8 coverage, Biome, knip, tsdown.

**Spec:** `docs/superpowers/specs/2026-08-03-flatten-type-directories-design.md`. Read it before starting. Where this plan and the spec disagree, the spec wins — say so rather than improvising.

**Issue:** [#22](https://github.com/ayrtonvwf/graphql-okf/issues/22), step 2 of 2. Step 1 was [PR #30](https://github.com/ayrtonvwf/graphql-okf/pull/30).

## Global Constraints

- **Determinism is load-bearing** (`M1/GOAL-8.1`, `M1/NG-6`). No runtime LLM calls, no wall-clock dependence beyond the ISO-8601 timestamps the spec defines, no iteration order that depends on `Map` insertion. Every list this plan introduces (`moves`, `redirects`, `deletes`) is explicitly sorted before use.
- **TDD, strictly.** Write the failing test, run it, watch it fail for the stated reason, then write the minimal implementation. Do not write implementation before its test. Do not backfill tests.
- **The naming scheme is the single source of truth** (`M1/GOAL-4.5`). Only `src/model/naming.ts` derives paths. Nothing else re-derives them.
- **Human-authored content is never destroyed** (`M1/GOAL-8.3`). Everything below the `<!-- graphql-okf:generated:end -->` marker survives every operation in this plan, including moves and deletes.
- **Coverage thresholds are the merge gate:** lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.
- **Node 24 floor**, TypeScript `strict: true`, ESM-first, `.js` extensions on all relative imports.
- Commands: `pnpm test`, `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run knip`, `pnpm run build`.

## File Structure

**Created:**
- `src/reconcile/relayout.ts` — the layout migration pre-pass. Pure: existing-file map in, rewritten map plus a report of moves/redirects/deletes out. No filesystem access; `applyPlan` owns that.
- `src/reconcile/relayout.test.ts` — its unit tests.

**Modified:**
- `src/model/naming.ts` — `DIRECTORY_BY_KIND` collapses; new exported `KIND_ORDER`.
- `src/emit/render/directory-index.ts` — `IndexSection`; `renderDirectoryIndex` takes sections.
- `src/emit/bundle.ts` — kind labels re-keyed by kind; the grouping rule.
- `src/reconcile/plan.ts` — calls `relayoutBundle`; `FileAction` becomes a union; `BundlePlan.migrated` splits.
- `src/reconcile/apply.ts` — writes first, then deletes, then `rmdir`.
- `src/reconcile/log.ts` — two migration bullets.
- `src/index.ts` — `SyncResult.relocated`.
- `src/errors.ts` — `LAYOUT_MOVE_CONFLICT`.
- `src/conformance.test.ts` — one new assertion.
- Test files carrying hardcoded paths (Task 3).
- `okf/shop-api/**` (Task 3), `okf/countries-api/**` (Task 8).
- `README.md`, `docs/okf-vs-mcp-for-graphql.md`, `docs/northstar-specs/GOAL-M1.md` (Task 9).

**Task order rationale.** Tasks 1–2 change the renderer with no output change, so they land quietly. Task 3 is the flatten — one large, mostly mechanical commit where grouping activates and the golden bundle is regenerated once. Tasks 4–6 build the migration behind it. Task 7 proves the migration end to end. Task 8 is the only committed bundle that actually runs it.

---

### Task 1: `renderDirectoryIndex` takes sections

Pure renderer change. A single headingless section must reproduce today's output byte for byte — that property is what keeps `queries/`, `mutations/`, `subscriptions/` and `directives/` free of churn for the rest of this plan.

**Files:**
- Modify: `src/emit/render/directory-index.ts`
- Modify: `src/emit/render/directory-index.test.ts`
- Modify: `src/emit/bundle.ts:148` (the single call site)

**Interfaces:**
- Consumes: `FileParts` from `./seam.js`.
- Produces: `IndexSection { heading?: string; entries: readonly IndexEntry[] }` and `renderDirectoryIndex(title: string, sections: readonly IndexSection[], frontmatter?: readonly string[]): FileParts`. `IndexEntry` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/emit/render/directory-index.test.ts`, inside the existing `describe("renderDirectoryIndex", ...)`:

```ts
  it("emits a heading above each section that has one", () => {
    const parts = renderDirectoryIndex("Types", [
      { heading: "Object types", entries: [{ label: "Country", link: "/types/Country.md", summary: "An ISO country." }] },
      { heading: "Scalar types", entries: [{ label: "ID", link: "/types/ID.md", summary: "An opaque identifier." }] },
    ]);

    expect(parts.generated).toBe(
      [
        "",
        "## Object types",
        "",
        "* [Country](/types/Country.md) - An ISO country.",
        "",
        "## Scalar types",
        "",
        "* [ID](/types/ID.md) - An opaque identifier.",
        "",
      ].join("\n"),
    );
  });

  it("renders a headingless section as a bare list, ahead of headed ones", () => {
    const parts = renderDirectoryIndex("Types", [
      { entries: [{ label: "objects/", link: "/types/objects/index.md", summary: "Object types" }] },
      { heading: "Scalar types", entries: [{ label: "ID", link: "/types/ID.md", summary: "" }] },
    ]);

    expect(parts.generated).toBe(
      [
        "",
        "* [objects/](/types/objects/index.md) - Object types",
        "",
        "## Scalar types",
        "",
        "* [ID](/types/ID.md)",
        "",
      ].join("\n"),
    );
  });

  it("skips a section with no entries rather than emitting a bare heading", () => {
    const parts = renderDirectoryIndex("Types", [
      { heading: "Object types", entries: [] },
      { heading: "Scalar types", entries: [{ label: "ID", link: "/types/ID.md", summary: "" }] },
    ]);

    expect(parts.generated).not.toContain("Object types");
    expect(parts.generated).toBe("\n## Scalar types\n\n* [ID](/types/ID.md)\n");
  });
```

Then update the six existing tests in that file to wrap their entry arrays in a single headingless section. For example the first one becomes:

```ts
    const parts = renderDirectoryIndex("Object types", [
      {
        entries: [
          { label: "Country", link: "Country.md", summary: "An ISO country." },
          { label: "Language", link: "Language.md", summary: "A spoken language." },
        ],
      },
    ]);
```

Apply the same wrapping to the other five: `[{ entries: [...] }]`, and `renderDirectoryIndex("API interface", [], [...])` / `renderDirectoryIndex("Object types", [])` keep their empty arrays unchanged. **Do not change a single expected string** — that is the point of the test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/emit/render/directory-index.test.ts`

Expected: FAIL. The three new tests fail on the section shape; the six updated ones fail with a TypeScript/runtime error because `sections[0].entries` is undefined where the implementation still expects `IndexEntry[]`.

- [ ] **Step 3: Write the implementation**

Replace the body of `src/emit/render/directory-index.ts` below `IndexEntry`:

```ts
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
      const bullets = section.entries.map(bullet).join("\n");
      return section.heading === undefined ? bullets : `## ${section.heading}\n\n${bullets}`;
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
```

Note `generated` keeps its `\n…\n` wrapper even when `blocks` is empty, producing `"\n\n"` exactly as today — the empty-index tests depend on it.

- [ ] **Step 4: Update the one call site**

In `src/emit/bundle.ts`, line 148 currently reads:

```ts
    bundle.set(indexPath, renderDirectoryIndex(title, sortByLabel(entries), frontmatter));
```

Change it to:

```ts
    bundle.set(indexPath, renderDirectoryIndex(title, [{ entries: sortByLabel(entries) }], frontmatter));
```

Also add `IndexSection` to the type import from `./render/directory-index.js` — it is used in Task 2, so leave the import as `import { type IndexEntry, renderDirectoryIndex } from "./render/directory-index.js";` for now and extend it there.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: PASS, all files. `bundle.test.ts`, `conformance.test.ts` and `test/example-bundle.test.ts` must pass **unmodified** — output is byte-identical.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/emit/render/directory-index.ts src/emit/render/directory-index.test.ts src/emit/bundle.ts
git commit -m "refactor: render directory indexes from sections"
```

---

### Task 2: Group index entries by kind

The rule: an index groups concepts under one `##` heading per kind when the directory holds **more than one kind**, and renders a flat list when it does not. Until Task 3 no real directory holds more than one kind, so this task changes no output — it is tested against a hand-built IR.

**Files:**
- Modify: `src/model/naming.ts`
- Modify: `src/model/naming.test.ts`
- Modify: `src/emit/bundle.ts`
- Modify: `src/emit/bundle.test.ts`

**Interfaces:**
- Consumes: `IndexSection` from Task 1; `ConceptKind`, `DIRECTORY_BY_KIND` from `src/model/naming.js`.
- Produces: `KIND_ORDER: readonly ConceptKind[]` exported from `src/model/naming.ts`, the canonical group order.

- [ ] **Step 1: Write the failing test for `KIND_ORDER`**

Add to `src/model/naming.test.ts`:

```ts
describe("KIND_ORDER", () => {
  it("lists every kind exactly once, types first in definitional weight", () => {
    expect(KIND_ORDER).toEqual([
      "object",
      "interface",
      "union",
      "enum",
      "input",
      "scalar",
      "query",
      "mutation",
      "subscription",
      "directive",
    ]);
  });

  it("covers every key of DIRECTORY_BY_KIND", () => {
    expect([...KIND_ORDER].sort()).toEqual(Object.keys(DIRECTORY_BY_KIND).sort());
  });
});
```

Add `KIND_ORDER` and `DIRECTORY_BY_KIND` to the import at the top of the file if they are not already there.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/model/naming.test.ts`

Expected: FAIL — `KIND_ORDER` is not exported from `./naming.js`.

- [ ] **Step 3: Add `KIND_ORDER`**

In `src/model/naming.ts`, directly below `DIRECTORY_BY_KIND`:

```ts
/**
 * The canonical order kinds are presented in — currently the group order of a
 * multi-kind `index.md`. An explicit array rather than `Object.keys` of a record:
 * output order is load-bearing (GOAL-8.1) and must not rest on key-insertion
 * order surviving a future edit.
 */
export const KIND_ORDER: readonly ConceptKind[] = [
  "object",
  "interface",
  "union",
  "enum",
  "input",
  "scalar",
  "query",
  "mutation",
  "subscription",
  "directive",
];
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run src/model/naming.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing test for grouping**

Add to `src/emit/bundle.test.ts`. This builds a `SchemaIr` by hand rather than through `project()`, because no schema can yet put two kinds in one directory:

```ts
import type { ObjectTypeNode, ScalarTypeNode, SchemaIr } from "../model/ir.js";

const MULTI_KIND_IR: SchemaIr = {
  resource: "test.graphql",
  origin: "sdl",
  concepts: [
    {
      kind: "object",
      name: "Country",
      path: "types/Country.md",
      description: "An ISO country.",
      appliedDirectives: [],
      fields: [],
      interfaces: [],
    } satisfies ObjectTypeNode,
    {
      kind: "scalar",
      name: "ID",
      path: "types/ID.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: null,
      isBuiltIn: true,
    } satisfies ScalarTypeNode,
  ],
};

describe("an index for a directory holding more than one kind", () => {
  it("groups its concepts under a heading per kind, in KIND_ORDER", () => {
    const bundle = buildBundle(MULTI_KIND_IR, emitContext("0.2", TS));

    expect(assembled(bundle, "types/index.md")).toContain(
      [
        "## Object types",
        "",
        "* [Country](/types/Country.md) - An ISO country.",
        "",
        "## Scalar types",
        "",
        "* [ID](/types/ID.md) - Scalar type.",
      ].join("\n"),
    );
  });

  it("puts tombstones in a trailing Removed section", () => {
    const bundle = buildBundle(MULTI_KIND_IR, emitContext("0.2", TS), [
      { path: "types/GiftCard.md", title: "GiftCard" },
    ]);
    const index = assembled(bundle, "types/index.md");

    expect(index).toContain("## Removed\n\n* [GiftCard](/types/GiftCard.md) - (removed)");
    expect(index.indexOf("## Removed")).toBeGreaterThan(index.indexOf("## Scalar types"));
  });

  it("leaves a single-kind directory as a flat list", () => {
    const bundle = bundleFrom("type Query { hello: String }");

    expect(assembled(bundle, "queries/index.md")).not.toContain("## ");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run src/emit/bundle.test.ts`

Expected: FAIL — `types/index.md` contains a flat list with no `##` headings.

- [ ] **Step 7: Implement the grouping**

In `src/emit/bundle.ts`:

Extend the import:

```ts
import { type IndexEntry, type IndexSection, renderDirectoryIndex } from "./render/directory-index.js";
```

and:

```ts
import { type ConceptKind, KIND_ORDER } from "../model/naming.js";
```

Leave `DIRECTORY_LABELS` exactly as it is and add a kind-keyed table beside it:

```ts
/** Heading for a kind's group in an index that holds more than one kind. */
const KIND_SECTION_LABELS: Record<ConceptKind, string> = {
  object: "Object types",
  interface: "Interface types",
  union: "Union types",
  enum: "Enum types",
  input: "Input object types",
  scalar: "Scalar types",
  query: "Query operations",
  mutation: "Mutation operations",
  subscription: "Subscription operations",
  directive: "Directives",
};
```

Then replace the index-building loop body (currently `src/emit/bundle.ts:110-149`) so that it assembles entries per category before choosing a shape:

```ts
  // One index.md per directory.
  for (const dir of allDirs) {
    const childEntries: IndexEntry[] = [];
    for (const child of childDirs.get(dir) ?? []) {
      const base = posix.basename(child);
      childEntries.push({
        label: `${base}/`,
        link: bundleLink(`${child}/index.md`),
        summary: DIRECTORY_LABELS[child] ?? base,
      });
    }

    const concepts = filesByDir.get(dir) ?? [];
    const conceptEntry = (concept: ConceptNode): IndexEntry => ({
      label: concept.name,
      link: bundleLink(concept.path),
      summary: firstSentence(concept.description) ?? KIND_SUMMARY[concept.kind],
    });

    const tombstoneEntries: IndexEntry[] = (tombstonesByDir.get(dir) ?? []).map((tombstone) => ({
      label: tombstone.title,
      link: bundleLink(tombstone.path),
      summary: "(removed)",
    }));

    const kinds = new Set(concepts.map((concept) => concept.kind));
    const sections: IndexSection[] = [];

    if (kinds.size > 1) {
      sections.push({ entries: sortByLabel(childEntries) });
      for (const kind of KIND_ORDER) {
        const entries = concepts.filter((concept) => concept.kind === kind).map(conceptEntry);
        if (entries.length > 0) {
          sections.push({ heading: KIND_SECTION_LABELS[kind], entries: sortByLabel(entries) });
        }
      }
      if (tombstoneEntries.length > 0) {
        sections.push({ heading: "Removed", entries: sortByLabel(tombstoneEntries) });
      }
    } else {
      sections.push({
        entries: sortByLabel([...childEntries, ...concepts.map(conceptEntry), ...tombstoneEntries]),
      });
    }

    const title = DIRECTORY_LABELS[dir] ?? posix.basename(dir);
    const indexPath = dir === "." ? "index.md" : `${dir}/index.md`;
    const frontmatter =
      dir === "."
        ? [
            `okf_version: ${JSON.stringify(ctx.okfVersion)}`,
            `resource: ${JSON.stringify(ir.resource)}`,
          ]
        : undefined;
    bundle.set(indexPath, renderDirectoryIndex(title, sections, frontmatter));
  }
```

The single-kind branch sorts child directories, concepts and tombstones into one list exactly as before — that is what keeps `queries/index.md` byte-identical.

**Keep the six `types/<kind>` rows in `DIRECTORY_LABELS` for now** — they still title real directories until Task 3, and dropping them here would regress six index H1s to `posix.basename(dir)` and force a golden regeneration in a task that is meant to change no output. Task 3 deletes them along with the directories. So `DIRECTORY_LABELS` is unchanged in this task; only `KIND_SECTION_LABELS` is added.

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run src/emit/bundle.test.ts src/emit/render/directory-index.test.ts`

Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `pnpm test`

Expected: PASS, including `test/example-bundle.test.ts` untouched — no directory yet holds more than one kind, so every index still takes the flat branch and the golden bundle is byte-identical.

- [ ] **Step 10: Typecheck, lint, commit**

Run: `pnpm run typecheck && pnpm run lint`

```bash
git add src/model/naming.ts src/model/naming.test.ts src/emit/bundle.ts src/emit/bundle.test.ts
git commit -m "feat: group multi-kind index entries under kind headings"
```

---

### Task 3: Flatten `types/<kind>/` into `types/`

The path change itself. One line of production code, then roughly 220 hardcoded path expectations across the test suite. Grouping from Task 2 activates automatically because `types/` now holds six kinds.

**Files:**
- Modify: `src/model/naming.ts` (`DIRECTORY_BY_KIND`)
- Modify: `src/model/naming.test.ts`
- Modify: `src/model/project.test.ts`, `src/emit/render/body.test.ts`, `src/emit/bundle.test.ts`, `src/emit/render/links.test.ts`, `src/emit/render/concept.test.ts`, `src/emit/render/frontmatter.test.ts`, `src/emit/render/resource.test.ts`, `src/reconcile/*.test.ts`, `src/index.test.ts`, `src/conformance.test.ts`
- Modify: `test/example-bundle.test.ts`, `test/reconcile.test.ts`, `test/equivalence.test.ts`, `test/migrate.test.ts`, `test/support/bundle-links.test.ts`, `test/support/bundle-tree.test.ts`
- Regenerate: `okf/shop-api/**`

**Interfaces:**
- Consumes: `KIND_ORDER` and the grouping from Task 2.
- Produces: every type concept at `types/<Name>.md`. All later tasks assume this layout.

- [ ] **Step 1: Write the failing tests for the new paths and the collisions they enable**

Add to `src/model/naming.test.ts`:

```ts
describe("the flattened types directory", () => {
  it("puts every type kind directly under types/", () => {
    const paths = resolvePaths([
      { kind: "object", name: "Product" },
      { kind: "interface", name: "Node" },
      { kind: "union", name: "PaymentMethod" },
      { kind: "enum", name: "Currency" },
      { kind: "input", name: "ProductFilter" },
      { kind: "scalar", name: "DateTime" },
    ]);

    expect(paths.get("object:Product")).toBe("types/Product.md");
    expect(paths.get("interface:Node")).toBe("types/Node.md");
    expect(paths.get("union:PaymentMethod")).toBe("types/PaymentMethod.md");
    expect(paths.get("enum:Currency")).toBe("types/Currency.md");
    expect(paths.get("input:ProductFilter")).toBe("types/ProductFilter.md");
    expect(paths.get("scalar:DateTime")).toBe("types/DateTime.md");
  });

  it("leaves operations and directives where they are", () => {
    const paths = resolvePaths([
      { kind: "query", name: "product" },
      { kind: "mutation", name: "placeOrder" },
      { kind: "subscription", name: "reviewPosted" },
      { kind: "directive", name: "auth" },
    ]);

    expect(paths.get("query:product")).toBe("queries/product.md");
    expect(paths.get("mutation:placeOrder")).toBe("mutations/placeOrder.md");
    expect(paths.get("subscription:reviewPosted")).toBe("subscriptions/reviewPosted.md");
    expect(paths.get("directive:auth")).toBe("directives/auth.md");
  });

  it("hashes a type and an input that differ only by case", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "input", name: "user" },
    ]);

    const object = paths.get("object:User");
    const input = paths.get("input:user");

    expect(object).toMatch(/^types\/User-[0-9a-f]{8}\.md$/);
    expect(input).toMatch(/^types\/user-[0-9a-f]{8}\.md$/);
    expect(object?.toLowerCase()).not.toBe(input?.toLowerCase());
  });

  it("hashes a type whose name is a reserved basename", () => {
    const paths = resolvePaths([{ kind: "enum", name: "Index" }]);

    expect(paths.get("enum:Index")).toMatch(/^types\/Index-[0-9a-f]{8}\.md$/);
  });

  it("does not hash a type and an operation sharing a case-folded name", () => {
    const paths = resolvePaths([
      { kind: "object", name: "Product" },
      { kind: "query", name: "product" },
    ]);

    expect(paths.get("object:Product")).toBe("types/Product.md");
    expect(paths.get("query:product")).toBe("queries/product.md");
  });
});
```

The last one pins the reason `queries/` stays a separate directory — it is the collision the flatten deliberately does not create.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/model/naming.test.ts`

Expected: FAIL — paths come back as `types/objects/Product.md`, and the case-fold test gets two unhashed names in different directories.

- [ ] **Step 3: Collapse the directory table**

In `src/model/naming.ts`:

```ts
/**
 * Type kinds all share `types/`. GraphQL keeps every named type in one
 * namespace, so a name is unique within it by construction; the kind is carried
 * by `type:` frontmatter (GOAL-5.3) and by a heading in `types/index.md`.
 * Directive names and root operation field names occupy separate namespaces that
 * *can* collide with type names, so those directories stay distinct.
 */
export const DIRECTORY_BY_KIND: Record<ConceptKind, string> = {
  object: "types",
  interface: "types",
  union: "types",
  enum: "types",
  input: "types",
  scalar: "types",
  query: "queries",
  mutation: "mutations",
  subscription: "subscriptions",
  directive: "directives",
};
```

`resolvePaths` is not touched. Its per-directory case-fold and reserved-basename rules now apply across kinds, which is what makes the two collision tests pass.

Then delete the six now-dead rows from `DIRECTORY_LABELS` in `src/emit/bundle.ts`, leaving:

```ts
// Title shown as the index H1, and (for a child dir) the summary in its parent's index.
const DIRECTORY_LABELS: Record<string, string> = {
  ".": "API interface",
  types: "Types",
  queries: "Query operations",
  mutations: "Mutation operations",
  subscriptions: "Subscription operations",
  directives: "Directives",
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run src/model/naming.test.ts`

Expected: PASS.

- [ ] **Step 5: Update every hardcoded path in the test suite**

Run: `pnpm test`

Expected: FAIL, widely. Then fix mechanically. The rewrite is always the same shape — drop the kind segment:

```
types/objects/Product.md    → types/Product.md
types/scalars/DateTime.md   → types/DateTime.md
/types/interfaces/Node.md   → /types/Node.md
types/inputs/index.md       → (gone: assert on types/index.md instead)
```

A find-and-replace gets most of it:

```bash
grep -rl "types/\(objects\|interfaces\|unions\|enums\|inputs\|scalars\)/" src test | xargs sed -i '' -E 's#types/(objects|interfaces|unions|enums|inputs|scalars)/#types/#g'
```

Then read the diff — `sed` cannot make these judgements, and three cases need hand-editing:

1. **Assertions that a kind index exists** (`bundle.has("types/objects/index.md")`, and the child-directory listing tests in `bundle.test.ts`). These become assertions about `types/index.md` and its kind headings. `sed` will have turned them into `types/index.md`, producing duplicate or vacuous assertions — delete the duplicates.
2. **Counts.** `src/index.test.ts` and `test/example-bundle.test.ts` assert `result.added`/`indexes` lengths. Six fewer index files per bundle. Recompute from the actual run rather than guessing.
3. **`src/reconcile/plan.test.ts` and `test/reconcile.test.ts`** build legacy-layout bundles by hand as *input*. Those inputs must be updated to the flat layout too — the relayout pre-pass does not exist yet, so a legacy-layout input would now be read as a set of strays and tombstoned.

- [ ] **Step 6: Run the suite until green, except the golden**

Run: `pnpm test`

Expected: everything passes except `test/example-bundle.test.ts`'s `matches okf/shop-api byte-for-byte`, which fails because the committed bundle is still nested.

- [ ] **Step 7: Regenerate the golden bundle**

`okf/shop-api/` is rebuilt from scratch by the test, replaying v1 → v2 → v3 with pinned timestamps. It therefore takes the new layout from its first historical run onward, `log.md` included. This is the only option a from-scratch golden allows and it is expected — see spec §8.

```bash
UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts
```

- [ ] **Step 8: Inspect the regenerated bundle before trusting it**

```bash
git status --short okf/shop-api
```

Expected: 27 type files renamed out of `types/<kind>/` into `types/`; 6 deletions (`types/{objects,interfaces,unions,enums,inputs,scalars}/index.md`); `types/index.md`, `log.md` and every file linking to a type modified.

```bash
cat okf/shop-api/types/index.md
```

Expected: `## Object types`, `## Interface types`, `## Union types`, `## Enum types`, `## Input object types`, `## Scalar types` in that order, then `## Removed` holding `GiftCard`.

```bash
grep -c "Ping #catalog" okf/shop-api/types/Product.md
```

Expected: `1`. The injected human section survives the rebuild (`GOAL-8.3`).

```bash
grep -rn "types/objects\|types/scalars" okf/shop-api | head
```

Expected: no output.

- [ ] **Step 9: Run the gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add -A src test okf/shop-api
git commit -m "feat: flatten types/<kind>/ into types/ (#22)"
```

---

### Task 4: The relayout pre-pass

Pure function, not yet wired into anything. `LAYOUT_MOVE_CONFLICT` is added here because the module throws it.

**Files:**
- Create: `src/reconcile/relayout.ts`
- Create: `src/reconcile/relayout.test.ts`
- Modify: `src/errors.ts:16`

**Interfaces:**
- Consumes: `splitFile`, `isOwnedFile` from `./parse.js`; `assembleFile`, `HUMAN_HINT` from `../emit/render/seam.js`; `GraphqlOkfError` from `../errors.js`.
- Produces:
  ```ts
  export interface Move { readonly from: string; readonly to: string }
  export interface Redirect { readonly path: string; readonly contents: string }
  export interface RelayoutResult {
    readonly files: ReadonlyMap<string, string>;
    readonly moves: readonly Move[];
    readonly redirects: readonly Redirect[];
    readonly deletes: readonly string[];
  }
  export function relayoutBundle(existing: ReadonlyMap<string, string>): RelayoutResult;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/reconcile/relayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN, HUMAN_HINT } from "../emit/render/seam.js";
import { GraphqlOkfError } from "../errors.js";
import { relayoutBundle } from "./relayout.js";

function owned(body: string, human = EMPTY_HUMAN): string {
  return assembleFile({ preamble: "---\ntype: GraphQL Object Type\n---\n\n# X\n\n", generated: `\n${body}\n` }, human);
}

describe("relayoutBundle", () => {
  it("moves an owned concept file out of its kind directory", () => {
    const file = owned("body");
    const result = relayoutBundle(new Map([["types/objects/Product.md", file]]));

    expect(result.files.get("types/Product.md")).toBe(file);
    expect(result.files.has("types/objects/Product.md")).toBe(false);
    expect(result.moves).toEqual([{ from: "types/objects/Product.md", to: "types/Product.md" }]);
    expect(result.deletes).toEqual(["types/objects/Product.md"]);
  });

  it("carries the human region across the move byte for byte", () => {
    const human = `\n\n${HUMAN_HINT}\nOwned by the Catalog team.\n`;
    const result = relayoutBundle(new Map([["types/objects/Product.md", owned("body", human)]]));

    expect(result.files.get("types/Product.md")).toContain("Owned by the Catalog team.");
  });

  it("moves tombstoned concepts too", () => {
    const file = owned("> **Removed.**");
    const result = relayoutBundle(new Map([["types/objects/GiftCard.md", file]]));

    expect(result.files.get("types/GiftCard.md")).toBe(file);
  });

  it("leaves a stray file alone", () => {
    const result = relayoutBundle(new Map([["types/objects/notes.md", "# My notes\n"]]));

    expect(result.files.get("types/objects/notes.md")).toBe("# My notes\n");
    expect(result.moves).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  it("deletes a kind index whose human region is empty", () => {
    const index = assembleFile({ preamble: "# Object types\n\n", generated: "\n* [Product](/types/objects/Product.md)\n" }, EMPTY_HUMAN);
    const result = relayoutBundle(new Map([["types/objects/index.md", index]]));

    expect(result.files.has("types/objects/index.md")).toBe(false);
    expect(result.deletes).toEqual(["types/objects/index.md"]);
    expect(result.redirects).toEqual([]);
  });

  it("deletes a marker-less legacy kind index", () => {
    const result = relayoutBundle(new Map([["types/objects/index.md", "# Object types\n\n* [Product](Product.md)\n"]]));

    expect(result.deletes).toEqual(["types/objects/index.md"]);
  });

  it("redirects a kind index that carries human text", () => {
    const index = assembleFile(
      { preamble: "# Object types\n\n", generated: "\n* [Product](/types/objects/Product.md)\n" },
      `\n\n${HUMAN_HINT}\nSee ADR-14.\n`,
    );
    const result = relayoutBundle(new Map([["types/objects/index.md", index]]));

    expect(result.deletes).toEqual([]);
    expect(result.redirects).toHaveLength(1);

    const contents = result.files.get("types/objects/index.md") ?? "";
    expect(contents).toContain("* [Types](/types/index.md) - This directory was flattened into the parent index.");
    expect(contents).not.toContain("Product.md");
    expect(contents).toContain("See ADR-14.");
  });

  it("is a no-op on a second pass over an already-redirected index", () => {
    const index = assembleFile(
      { preamble: "# Object types\n\n", generated: "\n* [Product](/types/objects/Product.md)\n" },
      `\n\n${HUMAN_HINT}\nSee ADR-14.\n`,
    );
    const once = relayoutBundle(new Map([["types/objects/index.md", index]]));
    const twice = relayoutBundle(once.files);

    expect(twice.redirects).toEqual([]);
    expect(twice.deletes).toEqual([]);
    expect(twice.files).toEqual(once.files);
  });

  it("drops a legacy duplicate that is byte-identical to its target", () => {
    const file = owned("body");
    const result = relayoutBundle(
      new Map([
        ["types/Product.md", file],
        ["types/objects/Product.md", file],
      ]),
    );

    expect(result.files.get("types/Product.md")).toBe(file);
    expect(result.deletes).toEqual(["types/objects/Product.md"]);
    expect(result.moves).toEqual([]);
  });

  it("throws when a legacy duplicate differs from its target", () => {
    expect(() =>
      relayoutBundle(
        new Map([
          ["types/Product.md", owned("new")],
          ["types/objects/Product.md", owned("old")],
        ]),
      ),
    ).toThrow(GraphqlOkfError);
  });

  it("ignores files outside the six legacy kind directories", () => {
    const file = owned("body");
    const result = relayoutBundle(
      new Map([
        ["types/Product.md", file],
        ["queries/product.md", file],
        ["directives/auth.md", file],
        ["index.md", file],
      ]),
    );

    expect(result.moves).toEqual([]);
    expect(result.deletes).toEqual([]);
    expect(result.files).toEqual(
      new Map([
        ["types/Product.md", file],
        ["queries/product.md", file],
        ["directives/auth.md", file],
        ["index.md", file],
      ]),
    );
  });

  it("reports moves and deletes sorted, whatever the map order", () => {
    const file = owned("body");
    const result = relayoutBundle(
      new Map([
        ["types/scalars/DateTime.md", file],
        ["types/enums/Currency.md", file],
        ["types/objects/Address.md", file],
      ]),
    );

    expect(result.moves.map((move) => move.from)).toEqual([
      "types/enums/Currency.md",
      "types/objects/Address.md",
      "types/scalars/DateTime.md",
    ]);
    expect(result.deletes).toEqual([...result.deletes].sort());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/reconcile/relayout.test.ts`

Expected: FAIL — cannot resolve `./relayout.js`.

- [ ] **Step 3: Add the error code**

In `src/errors.ts`, add to the `GraphqlOkfErrorCode` union, after `"NAME_HASH_COLLISION"`:

```ts
  | "LAYOUT_MOVE_CONFLICT"
```

- [ ] **Step 4: Write the implementation**

Create `src/reconcile/relayout.ts`:

```ts
import { assembleFile, HUMAN_HINT } from "../emit/render/seam.js";
import { GraphqlOkfError } from "../errors.js";
import { isOwnedFile, splitFile } from "./parse.js";

/**
 * The six directories type concepts used to live in, before issue #22 flattened
 * them into `types/`. A fixed list rather than a derivation: it is a historical
 * fact about bundles already on disk, not a function of the current naming
 * scheme, and it must keep working after that scheme forgets these names ever
 * existed.
 */
const LEGACY_TYPE_DIRS = [
  "types/objects",
  "types/interfaces",
  "types/unions",
  "types/enums",
  "types/inputs",
  "types/scalars",
] as const;

const REDIRECT_ROW =
  "* [Types](/types/index.md) - This directory was flattened into the parent index.";
const REDIRECT_REGION = `\n${REDIRECT_ROW}\n`;

export interface Move {
  readonly from: string;
  readonly to: string;
}

export interface Redirect {
  readonly path: string;
  readonly contents: string;
}

export interface RelayoutResult {
  readonly files: ReadonlyMap<string, string>;
  /** Old path → new path, sorted by old path. */
  readonly moves: readonly Move[];
  /** Legacy kind indexes rewritten to point at the parent index, sorted by path. */
  readonly redirects: readonly Redirect[];
  /** Paths to remove from disk, sorted. */
  readonly deletes: readonly string[];
}

/** The legacy kind directory this path sits directly inside, if any. */
function legacyBasename(path: string): string | null {
  for (const dir of LEGACY_TYPE_DIRS) {
    if (!path.startsWith(`${dir}/`)) {
      continue;
    }
    const basename = path.slice(dir.length + 1);
    // Nothing graphql-okf writes nests deeper; a human's subdirectory is theirs.
    return basename.includes("/") ? null : basename;
  }
  return null;
}

function hasHumanText(human: string): boolean {
  return human.replace(HUMAN_HINT, "").trim() !== "";
}

/**
 * Rewrites an existing bundle from the nested `types/<kind>/` layout to the flat
 * one, in memory, before reconciliation sees it. A pre-pass rather than a render
 * path for the same reason the v0.1 → v0.2 conversion is: a tombstoned concept is
 * not in the IR, so the emitter never re-renders it, and a render-based move would
 * strand every tombstone in the old layout forever.
 *
 * Deletes only files graphql-okf owns. A human's stray file keeps its place, and
 * its directory with it.
 */
export function relayoutBundle(existing: ReadonlyMap<string, string>): RelayoutResult {
  const files = new Map(existing);
  const moves: Move[] = [];
  const redirects: Redirect[] = [];
  const deletes: string[] = [];

  for (const [path, text] of existing) {
    const basename = legacyBasename(path);
    if (basename === null) {
      continue;
    }

    if (basename === "index.md") {
      const split = splitFile(text, path);
      if (split === null || !hasHumanText(split.human)) {
        files.delete(path);
        deletes.push(path);
        continue;
      }
      if (split.parts.generated === REDIRECT_REGION) {
        continue;
      }
      const contents = assembleFile(
        { preamble: split.parts.preamble, generated: REDIRECT_REGION },
        split.human,
      );
      files.set(path, contents);
      redirects.push({ path, contents });
      continue;
    }

    if (!isOwnedFile(path, text)) {
      continue;
    }

    const to = `types/${basename}`;
    const target = existing.get(to);
    if (target !== undefined) {
      // An interrupted earlier run wrote the move but not the delete. Identical
      // bytes mean the move completed; anything else is a genuine conflict.
      if (target !== text) {
        throw new GraphqlOkfError(
          "LAYOUT_MOVE_CONFLICT",
          `"${path}" and "${to}" both exist and differ. Delete whichever is stale, then re-run.`,
        );
      }
      files.delete(path);
      deletes.push(path);
      continue;
    }

    files.delete(path);
    files.set(to, text);
    moves.push({ from: path, to });
    deletes.push(path);
  }

  moves.sort((left, right) => (left.from < right.from ? -1 : left.from > right.from ? 1 : 0));
  redirects.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  deletes.sort();

  return { files, moves, redirects, deletes };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run src/reconcile/relayout.test.ts`

Expected: PASS, all 13 tests.

- [ ] **Step 6: Confirm nothing else moved**

Run: `pnpm test && pnpm run typecheck && pnpm run lint`

Expected: PASS. `relayoutBundle` has no callers yet, so no behaviour changed. `pnpm run knip` will flag it as unused — that is expected until Task 6; do not run knip as a gate here.

- [ ] **Step 7: Commit**

```bash
git add src/reconcile/relayout.ts src/reconcile/relayout.test.ts src/errors.ts
git commit -m "feat: add the types/ layout relayout pre-pass"
```

---

### Task 5: Teach `applyPlan` to delete

**Files:**
- Modify: `src/reconcile/plan.ts:15-19` (`FileAction`)
- Modify: `src/reconcile/apply.ts`
- Modify: `src/reconcile/apply.test.ts`

**Interfaces:**
- Consumes: `BundlePlan` from `./plan.js`.
- Produces: `FileAction` as a discriminated union; `applyPlan` performing writes then deletes then `rmdir`.

- [ ] **Step 1: Write the failing tests**

Add to `src/reconcile/apply.test.ts`, inside `describe("applyPlan", ...)`. That file already has `const T`, `const empty: BundlePlan` and `async function workspace()` — use them; do not introduce a second style. Add `mkdir` to the existing `node:fs/promises` import.

```ts
  it("removes a file a delete action names, after writing the new one", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types/objects"), { recursive: true });
    await writeFile(join(dir, "types/objects/Product.md"), "old\n", "utf8");

    await applyPlan(
      {
        ...empty,
        actions: [
          { kind: "migrate", path: "types/Product.md", contents: "new\n" },
          { kind: "delete", path: "types/objects/Product.md" },
        ],
      },
      dir,
      T,
    );

    expect(await readFile(join(dir, "types/Product.md"), "utf8")).toBe("new\n");
    await expect(readFile(join(dir, "types/objects/Product.md"), "utf8")).rejects.toThrow();
  });

  it("removes the directory a delete emptied", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types/objects"), { recursive: true });
    await writeFile(join(dir, "types/objects/index.md"), "old\n", "utf8");

    await applyPlan(
      { ...empty, actions: [{ kind: "delete", path: "types/objects/index.md" }] },
      dir,
      T,
    );

    await expect(readdir(join(dir, "types/objects"))).rejects.toThrow();
  });

  it("leaves a directory that still holds a human's stray file", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types/objects"), { recursive: true });
    await writeFile(join(dir, "types/objects/index.md"), "old\n", "utf8");
    await writeFile(join(dir, "types/objects/notes.md"), "mine\n", "utf8");

    await applyPlan(
      { ...empty, actions: [{ kind: "delete", path: "types/objects/index.md" }] },
      dir,
      T,
    );

    expect(await readdir(join(dir, "types/objects"))).toEqual(["notes.md"]);
  });

  it("tolerates a delete for a file that is already gone", async () => {
    const dir = await workspace();

    await expect(
      applyPlan(
        { ...empty, actions: [{ kind: "delete", path: "types/objects/Product.md" }] },
        dir,
        T,
      ),
    ).resolves.toBeUndefined();
  });
```

`empty.migrated` is still `[]` at this point; Task 6 changes its shape and updates these constructions with it.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/reconcile/apply.test.ts`

Expected: FAIL — TypeScript rejects a `delete` action with no `contents`, and at runtime `writeAtomic` writes `undefined` to the path instead of removing it.

- [ ] **Step 3: Make `FileAction` a union**

In `src/reconcile/plan.ts`, replace lines 15-19:

```ts
/**
 * A delete carries no contents, and the union says so rather than passing an
 * unused empty string. Deleting is new as of issue #22's flatten: before it,
 * graphql-okf only ever wrote.
 */
export type FileAction =
  | { readonly kind: "delete"; readonly path: string }
  | {
      readonly kind: "create" | "update" | "tombstone" | "index" | "migrate";
      readonly path: string;
      readonly contents: string;
    };
```

It was previously a non-exported `interface`; export it so the tests can build one.

- [ ] **Step 4: Implement deletion in `applyPlan`**

In `src/reconcile/apply.ts`, change the import line and replace the action loop at the end of `applyPlan`:

```ts
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
```

```ts
  // Writes first, then deletes. A crash between the two leaves a duplicate, which
  // the next run's relayout pre-pass collapses; the other order would leave a hole
  // that nothing could recover.
  for (const action of plan.actions) {
    if (action.kind !== "delete") {
      await writeAtomic(join(outDir, action.path), action.contents);
    }
  }

  for (const action of plan.actions) {
    if (action.kind !== "delete") {
      continue;
    }
    const absolute = join(outDir, action.path);
    await rm(absolute, { force: true });
    await removeIfEmpty(dirname(absolute));
  }
}

/** Drops a directory the deletes just emptied. A directory still holding a
 * human's stray file fails with ENOTEMPTY and is correctly left alone. */
async function removeIfEmpty(absolute: string): Promise<void> {
  try {
    await rmdir(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOTEMPTY" && code !== "ENOENT" && code !== "EEXIST") {
      throw error;
    }
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run src/reconcile/apply.test.ts`

Expected: PASS.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `pnpm test && pnpm run typecheck && pnpm run lint`

Expected: PASS. No plan produces a `delete` action yet, so nothing else changes.

- [ ] **Step 7: Commit**

```bash
git add src/reconcile/plan.ts src/reconcile/apply.ts src/reconcile/apply.test.ts
git commit -m "feat: let applyPlan delete files and prune emptied directories"
```

---

### Task 6: Wire the pre-pass into reconciliation

Where the two halves meet. The subtle part is the write-back: a moved concept whose content is otherwise unchanged is `sameContent` at its new path, so the main loop emits no action and the file never reaches disk. Moves have to be pushed into actions explicitly.

**Files:**
- Modify: `src/reconcile/plan.ts`
- Modify: `src/reconcile/plan.test.ts`
- Modify: `src/reconcile/log.ts`
- Modify: `src/reconcile/log.test.ts`
- Modify: `src/index.ts:20-29,52-60`
- Modify: `src/index.test.ts`

**Interfaces:**
- Consumes: `relayoutBundle`, `RelayoutResult` from `./relayout.js` (Task 4); the `FileAction` union from Task 5.
- Produces: `BundlePlan.migrated: { readonly frontmatter: readonly string[]; readonly relocated: readonly string[] }`; `SyncResult.relocated: readonly string[]`.

- [ ] **Step 1: Write the failing tests for the plan**

Add to `src/reconcile/plan.test.ts`. That file already has the module-level `ir: SchemaIr` (one object type, `Country`), `T1`, `T2` and `bundleOnDisk(source, timestamp)` — use them. After Task 3, `ir`'s concept path is `types/Country.md`, so `bundleOnDisk(ir, T1)` returns a **flat** bundle; these tests re-key it to the legacy layout, which is exactly the input the pre-pass exists for. Add `HUMAN_HINT` to the existing `../emit/render/seam.js` import.

```ts
  it("moves a legacy-layout concept and deletes its old path", () => {
    const fresh = bundleOnDisk(ir, T1);
    const legacy = new Map([
      ["index.md", fresh.get("index.md") ?? ""],
      ["types/index.md", fresh.get("types/index.md") ?? ""],
      ["types/objects/Country.md", fresh.get("types/Country.md") ?? ""],
    ]);

    const plan = reconcile(ir, legacy, emitContext("0.1", T1));

    expect(plan.migrated.relocated).toEqual(["types/Country.md"]);
    expect(plan.actions).toContainEqual({ kind: "delete", path: "types/objects/Country.md" });
    expect(plan.removed).toEqual([]);
  });

  it("writes a moved concept whose content is otherwise unchanged", () => {
    const fresh = bundleOnDisk(ir, T1);
    const legacy = new Map([
      ["index.md", fresh.get("index.md") ?? ""],
      ["types/index.md", fresh.get("types/index.md") ?? ""],
      ["types/objects/Country.md", fresh.get("types/Country.md") ?? ""],
    ]);

    const plan = reconcile(ir, legacy, emitContext("0.1", T1));
    const written = plan.actions.filter((action) => action.path === "types/Country.md");

    expect(written).toHaveLength(1);
    expect(written[0]?.kind).toBe("migrate");
  });

  it("deletes an empty kind index and redirects one carrying human text", () => {
    const fresh = bundleOnDisk(ir, T1);
    const legacy = new Map([
      ["index.md", fresh.get("index.md") ?? ""],
      ["types/index.md", fresh.get("types/index.md") ?? ""],
      ["types/objects/Country.md", fresh.get("types/Country.md") ?? ""],
      [
        "types/scalars/index.md",
        assembleFile(
          { preamble: "# Scalar types\n\n", generated: "\n* [ID](/types/scalars/ID.md)\n" },
          EMPTY_HUMAN,
        ),
      ],
      [
        "types/objects/index.md",
        assembleFile(
          { preamble: "# Object types\n\n", generated: "\n* [Country](/types/objects/Country.md)\n" },
          `\n\n${HUMAN_HINT}\nSee ADR-14.\n`,
        ),
      ],
    ]);

    const plan = reconcile(ir, legacy, emitContext("0.1", T1));

    expect(plan.actions).toContainEqual({ kind: "delete", path: "types/scalars/index.md" });

    const redirect = plan.actions.find((action) => action.path === "types/objects/index.md");
    expect(redirect?.kind).toBe("index");
    expect(redirect !== undefined && "contents" in redirect ? redirect.contents : "").toContain(
      "See ADR-14.",
    );
  });
```

The second test is the one that pins the `sameContent` trap: `Country` is re-keyed with byte-identical content, so the main reconcile loop sees it as unchanged and only the explicit write-back puts it on disk.

- [ ] **Step 2: Write the failing test for the log**

Add to `src/reconcile/log.test.ts`. That file has a module-level `plan: BundlePlan` and `const T`; spread `plan` the way its existing tests do.

```ts
  it("records a layout migration as one line", () => {
    const block = renderRunBlock(
      { ...plan, added: [], changed: [], removed: [], migrated: { frontmatter: [], relocated: ["types/A.md", "types/B.md"] } },
      T,
    );

    expect(block).toContain("**Migrated**");
    expect(block).toContain(
      "* Bundle layout: `types/<kind>/` flattened into `types/` across 2 concepts.",
    );
  });

  it("records both migrations when both fire, frontmatter first", () => {
    const block = renderRunBlock(
      { ...plan, migrated: { frontmatter: ["types/A.md"], relocated: ["types/A.md"] } },
      T,
    );

    expect(block.indexOf("OKF bundle format")).toBeLessThan(block.indexOf("Bundle layout"));
  });

  it("emits no Migrated group when neither fired", () => {
    const block = renderRunBlock({ ...plan, migrated: { frontmatter: [], relocated: [] } }, T);

    expect(block).not.toContain("**Migrated**");
  });
```

Then update the existing `migrated:` constructions in that file — `migrated: []` becomes `migrated: { frontmatter: [], relocated: [] }`, and the 4975-path one at `log.test.ts:124` becomes `migrated: { frontmatter: Array.from(...), relocated: [] }`. Same substitution in `src/reconcile/apply.test.ts:17` and `:88`. TypeScript points at each one.

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm exec vitest run src/reconcile/plan.test.ts src/reconcile/log.test.ts`

Expected: FAIL — `plan.migrated.relocated` is undefined, and the legacy concept is tombstoned rather than moved.

- [ ] **Step 4: Split `BundlePlan.migrated`**

In `src/reconcile/plan.ts`, replace the `migrated` field of `BundlePlan`:

```ts
  /**
   * Whole-bundle format conversions this run performed. Reported as counts in
   * log.md, not lists: naming five thousand paths is noise.
   *
   * `frontmatter` — concepts converted from OKF v0.1 to v0.2.
   * `relocated`   — new paths of concepts moved into the flattened `types/`.
   */
  readonly migrated: {
    readonly frontmatter: readonly string[];
    readonly relocated: readonly string[];
  };
```

- [ ] **Step 5: Call the pre-pass and thread its output into actions**

In `src/reconcile/plan.ts`, add the import:

```ts
import { relayoutBundle } from "./relayout.js";
```

Replace the first line of `reconcile`:

```ts
  const relayout = relayoutBundle(existing);
  const { files, migrated } = migrateBundle(relayout.files, ctx);
```

Then replace the write-back block at the end of the function (currently lines 156-168):

```ts
  // Migration rewrites exactly the region sameContent ignores, and a relocated
  // concept is sameContent at its new path — so the loop above sees both as
  // unchanged. Their writes have to be added explicitly, and only where reconcile
  // did not already write a newer version of the file.
  const acted = new Set(actions.map((action) => action.path));

  for (const path of migrated) {
    const contents = files.get(path);
    if (acted.has(path) || contents === undefined) {
      continue;
    }
    actions.push({ kind: "migrate", path, contents });
    acted.add(path);
  }

  for (const move of relayout.moves) {
    const contents = files.get(move.to);
    if (acted.has(move.to) || contents === undefined) {
      continue;
    }
    actions.push({ kind: "migrate", path: move.to, contents });
    acted.add(move.to);
  }

  for (const redirect of relayout.redirects) {
    actions.push({ kind: "index", path: redirect.path, contents: redirect.contents });
  }

  for (const path of relayout.deletes) {
    actions.push({ kind: "delete", path });
  }

  return {
    actions,
    added,
    changed,
    removed,
    unchanged,
    indexes,
    migrated: { frontmatter: migrated, relocated: relayout.moves.map((move) => move.to) },
  };
}
```

- [ ] **Step 6: Update the log**

In `src/reconcile/log.ts`, replace `hasLoggableChanges` and `migrationGroup`:

```ts
export function hasLoggableChanges(plan: BundlePlan): boolean {
  return (
    plan.added.length +
      plan.changed.length +
      plan.removed.length +
      plan.migrated.frontmatter.length +
      plan.migrated.relocated.length >
    0
  );
}

/**
 * Whole-bundle format conversions, as one line each. Listing every affected
 * concept would bury the run's real changes under thousands of identical
 * entries; the count carries the fact and git carries the detail. Plain digits —
 * a locale separator would make the log non-deterministic.
 */
function migrationGroup(plan: BundlePlan): string[] {
  const lines: string[] = [];
  if (plan.migrated.frontmatter.length > 0) {
    lines.push(
      `* OKF bundle format 0.1 → 0.2 (\`timestamp\` → \`generated\`) across ${plan.migrated.frontmatter.length} concepts.`,
    );
  }
  if (plan.migrated.relocated.length > 0) {
    lines.push(
      `* Bundle layout: \`types/<kind>/\` flattened into \`types/\` across ${plan.migrated.relocated.length} concepts.`,
    );
  }
  return lines.length === 0 ? [] : ["**Migrated**", "", ...lines, ""];
}
```

- [ ] **Step 7: Update the public result**

In `src/index.ts`, in `SyncResult`:

```ts
  /** Concepts whose frontmatter this run converted from OKF v0.1 to v0.2. */
  readonly migrated: readonly string[];
  /** New paths of concepts this run moved into the flattened `types/` layout. */
  readonly relocated: readonly string[];
```

and in the returned object:

```ts
    migrated: [...plan.migrated.frontmatter],
    relocated: [...plan.migrated.relocated],
```

- [ ] **Step 8: Run everything**

Run: `pnpm test`

Expected: PASS. Fix any remaining `migrated: []` constructions in test helpers — the type error points at each one.

- [ ] **Step 9: Gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS. `knip` is now meaningful again — `relayoutBundle` has a caller.

- [ ] **Step 10: Commit**

```bash
git add src/reconcile/plan.ts src/reconcile/plan.test.ts src/reconcile/log.ts src/reconcile/log.test.ts src/index.ts src/index.test.ts
git commit -m "feat: migrate existing bundles to the flat types/ layout"
```

---

### Task 7: End-to-end migration test

The load-bearing test. Neither committed bundle proves this: `okf/shop-api` is rebuilt from scratch and cannot reach the migration path at all, and `okf/countries-api` passes through it exactly once, in this PR, never again.

**Files:**
- Modify: `test/reconcile.test.ts`

**Interfaces:**
- Consumes: `syncOkfBundle` from `../src/index.js`; `readTree`, `writeTree` from `./support/bundle-tree.js`.
- Produces: no code.

- [ ] **Step 1: Write the failing test**

Add to `test/reconcile.test.ts`. Build the legacy bundle by generating a flat one first and re-keying it — hand-writing 30 concept files would rot, and re-keying is exactly the inverse of what the pre-pass does.

```ts
describe("migrating a bundle from the nested types layout", () => {
  const LEGACY_DIR: Record<string, string> = {
    object: "objects",
    interface: "interfaces",
    union: "unions",
    enum: "enums",
    input: "inputs",
    scalar: "scalars",
  };

  /**
   * Re-nests a flat bundle into the pre-#22 layout, using each concept's `type:`
   * frontmatter to pick its kind directory, and rebuilds the kind indexes.
   */
  function toLegacyLayout(flat: ReadonlyMap<string, string>): Map<string, string> {
    const nested = new Map<string, string>();
    const byDir = new Map<string, string[]>();

    for (const [path, text] of flat) {
      if (!path.startsWith("types/") || path === "types/index.md") {
        nested.set(path, text);
        continue;
      }
      const label = /^type: "GraphQL (\w+) Type"$/m.exec(text)?.[1]?.toLowerCase() ?? "object";
      const dir = `types/${LEGACY_DIR[label] ?? "objects"}`;
      const name = path.slice("types/".length);
      nested.set(`${dir}/${name}`, text);

      const bucket = byDir.get(dir);
      if (bucket === undefined) {
        byDir.set(dir, [name]);
      } else {
        bucket.push(name);
      }
    }

    for (const [dir, names] of byDir) {
      const bullets = [...names].sort().map((name) => `* [${name.replace(/\.md$/, "")}](/${dir}/${name})`);
      nested.set(
        `${dir}/index.md`,
        `# Types\n\n<!-- graphql-okf:generated:start -->\n${bullets.join("\n")}\n<!-- graphql-okf:generated:end -->\n\n<!-- Human-authored content below this line is preserved across regenerations. -->\n`,
      );
    }

    return nested;
  }

  it("moves every concept, keeps human text, and is a no-op on re-run", async () => {
    const build = join(await mkdtemp(join(tmpdir(), "okf-flat-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir: build, now: T1, resource: RESOURCE });
    const legacy = toLegacyLayout(await readTree(build));

    // Human text in a concept and in a kind index — the two things a move can destroy.
    const product = legacy.get("types/objects/Product.md") ?? "";
    legacy.set("types/objects/Product.md", `${product}\n## Ownership\n\nPing #catalog.\n`);
    const objectsIndex = legacy.get("types/objects/index.md") ?? "";
    legacy.set("types/objects/index.md", `${objectsIndex}\nSee ADR-14.\n`);

    const outDir = join(await mkdtemp(join(tmpdir(), "okf-legacy-")), "bundle");
    await writeTree(outDir, legacy);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T2, resource: RESOURCE });
    const after = await readTree(outDir);

    // Every concept moved.
    expect([...after.keys()].filter((path) => /^types\/\w+\//.test(path))).toEqual([
      "types/objects/index.md",
    ]);
    expect(after.has("types/Product.md")).toBe(true);
    expect(result.relocated.length).toBeGreaterThan(0);

    // A type that links to nothing still reached its new path — the sameContent trap.
    expect(after.has("types/Boolean.md")).toBe(true);

    // Human text survived both moves.
    expect(after.get("types/Product.md")).toContain("Ping #catalog.");
    expect(after.get("types/objects/index.md")).toContain("See ADR-14.");
    expect(after.get("types/objects/index.md")).toContain("* [Types](/types/index.md)");

    // Emptied kind directories are gone; nothing was tombstoned.
    expect(after.has("types/scalars/index.md")).toBe(false);
    expect(result.removed).toEqual([]);

    // The log records the layout change once.
    const log = after.get("log.md") ?? "";
    expect(log).toContain("* Bundle layout: `types/<kind>/` flattened into `types/` across");

    // Second run is a complete no-op (GOAL-8.1).
    const again = await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T3, resource: RESOURCE });
    expect(again.added).toEqual([]);
    expect(again.changed).toEqual([]);
    expect(again.relocated).toEqual([]);
    expect(await readTree(outDir)).toEqual(after);
  });

  it("leaves a human's stray file and its directory alone", async () => {
    const build = join(await mkdtemp(join(tmpdir(), "okf-flat-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir: build, now: T1, resource: RESOURCE });
    const legacy = toLegacyLayout(await readTree(build));
    legacy.set("types/objects/notes.md", "# My notes\n");

    const outDir = join(await mkdtemp(join(tmpdir(), "okf-stray-")), "bundle");
    await writeTree(outDir, legacy);
    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T2, resource: RESOURCE });

    const after = await readTree(outDir);
    expect(after.get("types/objects/notes.md")).toBe("# My notes\n");
  });
});
```

Match the file's existing imports and constants (`V1`, `RESOURCE`, `T1`…) rather than redeclaring them; add `readTree`/`writeTree` to the `./support/bundle-tree.js` import if absent.

- [ ] **Step 2: Run to verify it fails, then passes**

Run: `pnpm exec vitest run test/reconcile.test.ts`

If the implementation from Tasks 4-6 is correct, these pass on the first run. That is acceptable here — these are regression tests over behaviour already driven out by unit tests, not new behaviour. **If one fails, it has found a real defect.** Fix the implementation, not the test.

Two failures worth predicting: `types/Boolean.md` missing means the move write-back in Task 6 Step 5 is wrong; a non-empty second-run diff means the redirect rewrite is unconditional.

- [ ] **Step 3: Gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint`

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add test/reconcile.test.ts
git commit -m "test: pin the nested-to-flat bundle migration end to end"
```

---

### Task 8: Conformance assertion, then regenerate countries-api

The guard rail that keeps the collapsed directory from regrowing, and the one committed bundle that actually runs the migration.

**Files:**
- Modify: `src/conformance.test.ts`
- Regenerate: `okf/countries-api/**`

**Interfaces:**
- Consumes: the built CLI at `dist/cli.mjs`.
- Produces: no code.

- [ ] **Step 1: Write the failing assertion**

Add to `src/conformance.test.ts`, inside the describe block that already holds the link invariants:

```ts
  it("puts no concept file under a kind subdirectory of types/", async () => {
    const files = await bundleFor("examples/shop-api/v3.graphql");

    const nested = [...files.keys()].filter((path) => /^types\/[^/]+\//.test(path));

    expect(nested).toEqual([]);
  });
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run src/conformance.test.ts`

Expected: PASS — Task 3 already flattened emission. This assertion is a *guard*, so prove it can fail: temporarily set `object: "types/objects"` in `DIRECTORY_BY_KIND`, re-run, confirm FAIL listing the object types, then revert. Do not commit the temporary edit.

- [ ] **Step 3: Commit the assertion**

```bash
git add src/conformance.test.ts
git commit -m "test: assert no concept file lives under types/<kind>/"
```

- [ ] **Step 4: Build the CLI**

Run: `pnpm run build`

Expected: PASS, `dist/cli.mjs` exists.

- [ ] **Step 5: Reconcile the committed countries-api bundle in place**

Do **not** delete the directory first. Reconciling in place is the entire point — it is what exercises the relayout pre-pass on a real bundle, and a fresh generation would discard the bundle's `log.md` history.

```bash
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
```

If the endpoint is unreachable, stop and say so in the PR rather than hand-editing the bundle. Hand-edited generated output is exactly what `M1/GOAL-4.5` exists to prevent.

- [ ] **Step 6: Inspect the diff before trusting it**

```bash
git status --short okf/countries-api
```

Expected: 14 type files renamed out of `types/<kind>/` into `types/`; 3 deletions (`types/{objects,inputs,scalars}/index.md` — this bundle has no interfaces, unions or enums, which is why it is worth having as the migration fixture); `types/index.md`, `log.md` and every file referencing a type modified. No file added or removed beyond those. An unexpected addition or removal means the upstream schema drifted — keep it (reverting would leave the bundle stale) and call it out explicitly in the PR description.

```bash
ls okf/countries-api/types
```

Expected: flat `.md` files and `index.md`, no subdirectories.

```bash
head -20 okf/countries-api/types/index.md
```

Expected: `## Object types`, then `## Input object types`, then `## Scalar types`, in that order.

- [ ] **Step 7: Confirm the log entry**

```bash
head -20 okf/countries-api/log.md
```

Expected: a new dated entry whose **Migrated** group contains
`* Bundle layout: types/<kind>/ flattened into types/ across 14 concepts.`
Older entries keep their original text — the log is append-only and must not be rewritten.

- [ ] **Step 8: Verify the re-run is a no-op**

```bash
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
git status --short okf/countries-api
```

Expected: identical to Step 6's output — the second run writes nothing new and appends no log entry (`GOAL-8.1`, `GOAL-8.4`).

- [ ] **Step 9: Gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add okf/countries-api
git commit -m "chore: migrate the countries-api bundle to the flat types layout"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md:245`
- Modify: `docs/okf-vs-mcp-for-graphql.md:247`
- Modify: `docs/northstar-specs/GOAL-M1.md` (under `GOAL-4.3`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Update the README's link example**

`README.md:245` reads:

```markdown
Links inside these samples are **bundle-root-absolute** (`/types/objects/Product.md`),
```

Change `/types/objects/Product.md` to `/types/Product.md`. Read the surrounding paragraph and fix any other stale path in it.

- [ ] **Step 2: Update the comparison doc**

`docs/okf-vs-mcp-for-graphql.md:247` cites `../graphql-api/types/objects/Order.md`. Change it to `../graphql-api/types/Order.md`. The sentence's point about dangling links being a good failure mode is unaffected — do not rewrite it.

- [ ] **Step 3: Record the layout under `GOAL-4.3`**

In `docs/northstar-specs/GOAL-M1.md`, add a sub-bullet under `GOAL-4.3`:

```markdown
  - Type concepts live directly under `types/`, not in a per-kind subdirectory.
    GraphQL keeps all named types in one namespace, so the name is unique there
    by construction; the kind is carried by the `type:` frontmatter field
    (`GOAL-5.3`) and by a heading in `types/index.md`. Root operations and
    directives keep their own directories, whose namespaces *can* collide with
    type names. Recorded per issue #22: this is the emitted layout, not an
    additional requirement.
```

No requirement text changes. `GOAL-4.3` already permits this layout, and `GOAL-7.4`'s attribution was corrected in 22c85a3.

- [ ] **Step 4: Check nothing else is stale**

```bash
grep -rn "types/\(objects\|interfaces\|unions\|enums\|inputs\|scalars\)/" README.md docs/*.md docs/northstar-specs/*.md
```

Expected: no output. Historical plan and spec files under `docs/superpowers/` are records of past decisions and are **not** updated — leave them alone.

- [ ] **Step 5: Gates and commit**

Run: `pnpm run lint`

```bash
git add README.md docs/okf-vs-mcp-for-graphql.md docs/northstar-specs/GOAL-M1.md
git commit -m "docs: record the flattened types/ layout"
```

- [ ] **Step 6: Open the PR**

```bash
gh pr create --title "Flatten the type directory tree (#22, step 2 of 2)" --body "$(cat <<'EOF'
Completes #22. Moves every type concept from `types/<kind>/<Name>.md` to
`types/<Name>.md`, folds the kind distinction into `types/index.md` as
headings, and migrates existing bundles in place.

- Spec: `docs/superpowers/specs/2026-08-03-flatten-type-directories-design.md`
- Plan: `docs/superpowers/plans/2026-08-03-flatten-type-directories.md`

Path to any type drops from four reads to two. Six index files disappear.

## Notable

- `DIRECTORY_BY_KIND` collapsing to `types` is the whole path change.
  `resolvePaths` is untouched, so its per-directory case-fold and
  reserved-basename rules now apply across kinds for free — `type User` and
  `input user` both acquire hash suffixes, which was previously unreachable
  and is now tested.
- New `relayoutBundle` pre-pass migrates existing bundles: owned concept
  files move with their human regions intact, a legacy kind index with human
  text is kept and redirected rather than deleted, and a human's stray file
  is never touched.
- `applyPlan` can delete, which it never could before. Writes go first, then
  deletes, then `rmdir` of the emptied directory — so an interrupted run
  leaves a duplicate the next run collapses, not a hole.
- `okf/shop-api` is a from-scratch golden and cannot exercise the migration;
  `okf/countries-api` was reconciled in place and is the one committed bundle
  that ran it for real. The migration is proven by the end-to-end test in
  `test/reconcile.test.ts`.

Closes #22.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Verification checklist

Before claiming this plan complete, all of the following must hold — run them, do not assume:

- [ ] `pnpm run coverage` — PASS, thresholds met (lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%)
- [ ] `pnpm run typecheck` — PASS
- [ ] `pnpm run lint` — PASS
- [ ] `pnpm run knip` — PASS
- [ ] `pnpm run build` — PASS
- [ ] `grep -rn "types/objects" src test okf README.md docs/northstar-specs` returns nothing outside `docs/superpowers/`
- [ ] `okf/countries-api/log.md` carries the `Bundle layout:` migration line
- [ ] A second CLI run against `okf/countries-api` writes nothing
