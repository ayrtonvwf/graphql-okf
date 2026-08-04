# Dense Concept Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the per-file hint comments and replace every concept file's `# Schema` markdown table with a fenced GraphQL SDL block plus a `References:` line that preserves the concept graph.

**Architecture:** Two sequenced phases. Phase A (Tasks 1–3) stops emitting the two hint comments, restates the convention once on the bundle root index and in the README, and adds a narrow migration for existing bundles. Phase B (Tasks 4–8) introduces `sdl.ts` — the single place SDL syntax is generated — and `references.ts` — the single place the outbound link graph is computed — then reduces `body.ts` from a table generator to an assembler.

**Tech Stack:** TypeScript (strict, ESM), Node 24, Vitest, Biome, knip, tsdown, pnpm. The `graphql` package is already a runtime dependency; its `parse` is used in Task 8 to prove the emitted blocks are real SDL.

**Spec:** [`docs/superpowers/specs/2026-08-04-dense-concept-files-design.md`](../specs/2026-08-04-dense-concept-files-design.md). Issue #24, sub-issue of #20.

## Global Constraints

- **Determinism is load-bearing (`M1/GOAL-8.1`, `M1/NG-6`).** No runtime LLM calls, no nondeterministic iteration order, no wall-clock output beyond the ISO-8601 timestamps the spec defines. Re-running against an unchanged schema must be byte-identical with no `log.md` entry.
- **Coverage gates, enforced not aspirational:** lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.
- **The naming scheme is the single source of truth (`M1/GOAL-4.5`).** Never re-derive a concept path; use `TypeRef.path` / `AppliedDirective.path` from the IR and `bundleLink` to spell it.
- **`TypeRef.path` / `AppliedDirective.path` is `null` for spec-defined elements** (issue #23). Null means no concept file: render as plain code, never as a link, and never in `References:`.
- **Links are absolute bundle-relative** (issue #22): `bundleLink(path)` returns `/` + path. Never emit a relative link.
- **ESM import specifiers carry the `.js` extension**, even from `.ts` sources.
- **Single public entry point:** `src/index.ts`. Nothing added here is exported from it.
- **OKF v0.2 §11 floor:** every non-reserved `.md` file needs parseable YAML frontmatter with a non-empty `type`. Nothing in this plan touches frontmatter.
- **Human-authored content below the end marker survives regeneration (`M1/GOAL-8.3`)** — with exactly one deliberate, narrow exception, specified in Task 3.
- Run `pnpm run format` before committing if Biome complains about formatting.

## File Structure

**Created:**

- `src/emit/render/sdl.ts` — pure `ConceptNode → SDL text`. Owns every piece of SDL notation. Knows nothing about markdown, links, or file paths.
- `src/emit/render/sdl.test.ts`
- `src/emit/render/references.ts` — pure `ConceptNode → the outbound link line`. Owns edge collection, dedup, ordering.
- `src/emit/render/references.test.ts`

**Modified:**

- `src/emit/render/seam.ts` — hints become legacy reader-only constants; `EMPTY_HUMAN` shrinks.
- `src/emit/render/concept.ts` — stops writing the generated hint.
- `src/reconcile/parse.ts`, `src/reconcile/tombstone.ts` — renamed imports only; behaviour unchanged, because both still meet the hints in bundles written by older releases.
- `src/reconcile/migrate.ts` — new narrow human-hint migration; version gate narrowed.
- `src/emit/render/directory-index.ts` — `note?: string` becomes `notes?: readonly string[]`.
- `src/emit/bundle.ts` — root index carries the seam convention alongside the spec-defined note.
- `src/emit/render/signature.ts` — its argument-list renderer moves to `sdl.ts`; it imports it back.
- `src/emit/render/body.ts` — shrinks from table generator to assembler.
- `src/conformance.test.ts` — asserts the fence rather than the table; adds an SDL-parse invariant.
- `README.md`, `okf/shop-api/`, `okf/countries-api/`.

**Deleted:**

- `src/emit/render/text.ts` and `src/emit/render/text.test.ts` — `cell()` and `collapse()` are table/inline escaping used only by `body.ts`'s tables. When the tables go, both go, and knip fails the build if they linger.

---

### Task 1: Stop emitting the hint comments

**Files:**
- Modify: `src/emit/render/seam.ts:4-10`
- Modify: `src/emit/render/concept.ts:5,14`
- Modify: `src/reconcile/parse.ts:1,80`
- Modify: `src/reconcile/tombstone.ts:3,46`
- Test: `src/emit/render/seam.test.ts`, `src/emit/render/concept.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `EMPTY_HUMAN = "\n"`; `LEGACY_GENERATED_HINT` and `LEGACY_HUMAN_HINT` exported from `src/emit/render/seam.ts` (same string values as the old `GENERATED_HINT` / `HUMAN_HINT`, renamed). `renderConceptParts(concept, resource, ctx)` keeps its signature; its `generated` region no longer opens with a hint comment.

The rename matters and is not cosmetic. The constants cannot simply be deleted: `hasHumanText` must not mistake an old hint for a human's words, and `lastKnownBody` must not copy one into a tombstone. Reader paths keep them; emitter paths drop them.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/emit/render/seam.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN, GENERATED_END, GENERATED_START } from "./seam.js";

describe("assembleFile", () => {
  it("concatenates preamble, markers, generated content, and the human region", () => {
    const out = assembleFile({ preamble: "# Title\n\n", generated: "\nbody\n" }, "\n\ntrailing\n");

    expect(out).toBe(`# Title\n\n${GENERATED_START}\nbody\n${GENERATED_END}\n\ntrailing\n`);
  });

  it("starts a fresh file's human region empty (issue #24)", () => {
    expect(EMPTY_HUMAN).toBe("\n");
  });
});
```

Add to `src/emit/render/concept.test.ts`, inside its existing top-level `describe`:

```ts
  it("opens the generated region with the body, not a hint comment (issue #24)", () => {
    const parts = renderConceptParts(scalar, "https://x.example/graphql#DateTime", ctx);

    expect(parts.generated).toBe(`\n${renderBody(scalar).trimEnd()}\n\n`);
    expect(parts.generated).not.toContain("<!--");
  });
```

Read the top of `src/emit/render/concept.test.ts` first and reuse the concept fixture and `ctx` it already defines; if its fixture is not named `scalar`, use whatever name is there. Add `renderBody` to its imports from `./body.js` if absent.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/seam.test.ts src/emit/render/concept.test.ts
```

Expected: FAIL — `EMPTY_HUMAN` is still `"\n\n<!-- Human-authored… -->\n"`, and the generated region still contains `<!--`.

- [ ] **Step 3: Rewrite the seam constants**

Replace `src/emit/render/seam.ts:4-10` with:

```ts
/**
 * The hint comments graphql-okf wrote into every file before issue #24. Nothing
 * emits them now — the convention they stated lives once on the bundle root
 * index and in the README, where someone looking for it will find it.
 *
 * They survive as constants because reader paths still meet them in bundles
 * written by an older release: `hasHumanText` must not mistake one for a human's
 * words, and `lastKnownBody` must not copy one into a tombstone.
 */
export const LEGACY_GENERATED_HINT =
  "<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->";
export const LEGACY_HUMAN_HINT =
  "<!-- Human-authored content below this line is preserved across regenerations. -->";

/** The human region of a file graphql-okf has just created for the first time. */
export const EMPTY_HUMAN = "\n";
```

- [ ] **Step 4: Stop writing the generated hint**

In `src/emit/render/concept.ts`, change line 5 to drop `GENERATED_HINT` from the import:

```ts
import { assembleFile, EMPTY_HUMAN, type FileParts } from "./seam.js";
```

and line 14 to:

```ts
    generated: `\n${renderBody(concept).trimEnd()}\n\n`,
```

- [ ] **Step 5: Point the two reader paths at the renamed constants**

`src/reconcile/parse.ts` line 1:

```ts
import {
  type FileParts,
  GENERATED_END,
  GENERATED_START,
  LEGACY_HUMAN_HINT,
} from "../emit/render/seam.js";
```

and line 80:

```ts
  return human.replace(LEGACY_HUMAN_HINT, "").trim() !== "";
}
```

`src/reconcile/tombstone.ts` line 3:

```ts
import { LEGACY_GENERATED_HINT } from "../emit/render/seam.js";
```

and line 46:

```ts
  return generated.replace(LEGACY_GENERATED_HINT, "").trim();
```

- [ ] **Step 6: Update the tests that build legacy fixtures**

These construct files as an *older release* wrote them, so they keep using the hints — only the imported names change. In each, rename `GENERATED_HINT` → `LEGACY_GENERATED_HINT` and `HUMAN_HINT` → `LEGACY_HUMAN_HINT` in both the import and the usages:

- `src/reconcile/tombstone.test.ts:4,30,90`
- `src/reconcile/prune.test.ts:2,10,42`
- `src/reconcile/relayout.test.ts:2,25,69,87`
- `src/reconcile/plan.test.ts:4,399`
- `test/reconcile.test.ts:6,409,456`

```bash
pnpm exec vitest run src/reconcile test/reconcile.test.ts
```

Expected: PASS. If a test fails on content rather than on a missing import, stop and read it — a reader path has changed behaviour, which this task must not do.

- [ ] **Step 7: Run the full suite**

```bash
pnpm test
```

Expected: PASS except `test/example-bundle.test.ts` ("matches okf/shop-api byte-for-byte") and any `src/conformance.test.ts` case asserting hint text. The example bundle is a golden fixture regenerated in Task 8 — leave it failing and note it. Every other failure is a real one.

- [ ] **Step 8: Verify types and lint**

```bash
pnpm run typecheck && pnpm run lint && pnpm run knip
```

Expected: all pass. knip must not report `LEGACY_GENERATED_HINT` or `LEGACY_HUMAN_HINT` as unused — if it does, a reader path was missed in Step 5.

- [ ] **Step 9: Commit**

```bash
git add src/emit/render/seam.ts src/emit/render/seam.test.ts src/emit/render/concept.ts src/emit/render/concept.test.ts src/reconcile
git add test/reconcile.test.ts
git commit -m "refactor: stop emitting the per-file hint comments (#24)"
```

---

### Task 2: State the seam convention once, on the root index and in the README

**Files:**
- Modify: `src/emit/render/directory-index.ts:29-41,67`
- Modify: `src/emit/bundle.ts:62-65,240-245`
- Modify: `README.md`
- Test: `src/emit/render/directory-index.test.ts`, `src/emit/bundle.test.ts`

**Interfaces:**
- Consumes: Task 1's removal of the hints — this is where the information they carried goes.
- Produces: `DirectoryIndexOptions.notes?: readonly string[]` replacing `note?: string`; `SEAM_NOTE` exported from `src/emit/bundle.ts` alongside the existing `SPEC_DEFINED_NOTE`.

- [ ] **Step 1: Write the failing tests**

Add to `src/emit/render/directory-index.test.ts`, inside its existing top-level `describe`:

```ts
  it("renders each note as its own paragraph above the bullets", () => {
    const parts = renderDirectoryIndex(
      "Types",
      [{ entries: [{ label: "A", link: "/types/A.md", summary: "An A." }] }],
      { notes: ["First note.", "Second note."] },
    );

    expect(parts.generated).toBe("\nFirst note.\n\nSecond note.\n\n* [A](/types/A.md) - An A.\n");
  });
```

Add to `src/emit/bundle.test.ts`, inside its existing top-level `describe`:

```ts
  it("puts the generated-region convention on the bundle root index (issue #24)", () => {
    const bundle = buildBundle(ir, emitContext("0.2", TIMESTAMP));
    const root = bundle.get("index.md");

    expect(root?.generated).toContain(SEAM_NOTE);
    expect(root?.generated).toContain(SPEC_DEFINED_NOTE);
  });

  it("puts it on the root index only", () => {
    const bundle = buildBundle(ir, emitContext("0.2", TIMESTAMP));

    for (const [path, parts] of bundle) {
      if (path !== "index.md") {
        expect(parts.generated, `${path} should not repeat the seam note`).not.toContain(SEAM_NOTE);
      }
    }
  });
```

Read the top of `src/emit/bundle.test.ts` and reuse the IR fixture and `TIMESTAMP` it already defines; if its fixture is not named `ir`, use whatever name is there. Add `SEAM_NOTE` to its import from `./bundle.js`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/directory-index.test.ts src/emit/bundle.test.ts
```

Expected: FAIL — `notes` is not an option, and `SEAM_NOTE` is not exported.

- [ ] **Step 3: Let an index carry more than one note**

In `src/emit/render/directory-index.ts`, replace the `note` field of `DirectoryIndexOptions` (lines 36-40) with:

```ts
  /**
   * Paragraphs above the bullets, each rendered as its own block. Inside the
   * generated region, not the preamble, so they are rewritten on every run like
   * everything else the machine owns.
   */
  readonly notes?: readonly string[];
```

and line 67 with:

```ts
  const body = options.notes === undefined ? blocks : [...options.notes, ...blocks];
```

- [ ] **Step 4: Add the seam note and put it on the root index**

In `src/emit/bundle.ts`, add after `SPEC_DEFINED_NOTE` (line 65):

```ts
/**
 * The generated-region contract, stated once (issue #24). It used to be repeated
 * as an HTML comment inside every file, which spent a fifth of a small concept
 * file restating a rule nothing parses. The bundle root is where a consumer who
 * has only the bundle will look for it.
 */
export const SEAM_NOTE =
  "Content between the `graphql-okf:generated` markers is rewritten on every run: " +
  "do not edit inside it. Anything below the end marker is yours and is preserved.";
```

Then replace the `note` computation and its use (lines 240-246) with:

```ts
    const notes =
      dir === "."
        ? [SPEC_DEFINED_NOTE, SEAM_NOTE]
        : concepts.some((concept) => signatureOf(concept) !== null)
          ? [SIGNATURE_NOTE]
          : undefined;
    bundle.set(indexPath, renderDirectoryIndex(title, sections, { frontmatter, notes }));
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/directory-index.test.ts src/emit/bundle.test.ts
```

Expected: PASS.

- [ ] **Step 6: Document the convention in the README**

In `README.md`, immediately after the `### Signatures in index files` section added by issue #21, add:

```markdown
### The generated region

Every file graphql-okf owns is split by two markers:

    <!-- graphql-okf:generated:start -->
    ...regenerated from the schema on every run...
    <!-- graphql-okf:generated:end -->
    ...yours, preserved forever...

Everything between the markers is rewritten on each run — edit it and your edit
is gone next sync. Everything below the end marker is human-authored and is
never touched (`GOAL-8.3`), which is where notes, ownership, and links to
internal docs belong.

Bundles written before this rule was hoisted out of the files repeated it as an
HTML comment in every file. Running a current release strips that comment from
files whose human region is otherwise empty, and leaves it alone in any file a
human has written in.
```

- [ ] **Step 7: Run the full suite and the static checks**

```bash
pnpm test; pnpm run typecheck && pnpm run lint && pnpm run knip
```

Expected: same set of failures as Task 1 Step 7 (the golden `okf/shop-api` fixture and any conformance case asserting hint text) and nothing new. Static checks pass.

- [ ] **Step 8: Commit**

```bash
git add src/emit/render/directory-index.ts src/emit/render/directory-index.test.ts src/emit/bundle.ts src/emit/bundle.test.ts README.md
git commit -m "feat: state the generated-region convention once, on the root index (#24)"
```

---

### Task 3: Migrate the human hint out of existing bundles

**Files:**
- Modify: `src/reconcile/migrate.ts`
- Test: `src/reconcile/migrate.test.ts`, `test/migrate.test.ts`

**Interfaces:**
- Consumes: `EMPTY_HUMAN` and `LEGACY_HUMAN_HINT` from Task 1; `splitFile` and `assembleFile` from existing modules.
- Produces: `migrateBundle(existing, ctx)` keeps its signature and `MigrationResult` shape. It now also fires for `ctx.okfVersion === "0.1"`, because the hint has nothing to do with the OKF version.

This is the one place anything rewrites a human region, so the rule is deliberately unable to destroy a human's words: it fires only when the region is byte-identical to what the emitter itself wrote at creation.

- [ ] **Step 1: Write the failing tests**

Add to `src/reconcile/migrate.test.ts`, inside its existing top-level `describe`:

```ts
  const LEGACY_EMPTY = `\n\n${LEGACY_HUMAN_HINT}\n`;

  function legacyFile(human: string): string {
    return assembleFile(
      {
        preamble: '---\ntype: "GraphQL Object Type"\ntitle: "Order"\n---\n\n',
        generated: "\n# Order\n\n",
      },
      human,
    );
  }

  it("strips the human hint from a pristine human region (issue #24)", () => {
    const result = migrateBundle(
      new Map([["types/Order.md", legacyFile(LEGACY_EMPTY)]]),
      emitContext("0.2", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/Order.md")).toBe(legacyFile(EMPTY_HUMAN));
    expect(result.migrated).toEqual(["types/Order.md"]);
  });

  it("leaves a human region a human has written in completely alone", () => {
    const written = `\n\n${LEGACY_HUMAN_HINT}\n\nOwned by the Catalog team.\n`;
    const result = migrateBundle(
      new Map([["types/Order.md", legacyFile(written)]]),
      emitContext("0.2", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/Order.md")).toBe(legacyFile(written));
    expect(result.migrated).toEqual([]);
  });

  it("strips the hint under okf-version 0.1 too", () => {
    const result = migrateBundle(
      new Map([["types/Order.md", legacyFile(LEGACY_EMPTY)]]),
      emitContext("0.1", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/Order.md")).toBe(legacyFile(EMPTY_HUMAN));
  });

  it("is idempotent", () => {
    const ctx = emitContext("0.2", "2026-08-04T00:00:00.000Z");
    const once = migrateBundle(new Map([["types/Order.md", legacyFile(LEGACY_EMPTY)]]), ctx);
    const twice = migrateBundle(once.files, ctx);

    expect(twice.migrated).toEqual([]);
    expect(twice.files.get("types/Order.md")).toBe(once.files.get("types/Order.md"));
  });

  it("does not touch a file graphql-okf does not own", () => {
    const stray = `# Notes\n\n${LEGACY_HUMAN_HINT}\n`;
    const result = migrateBundle(
      new Map([["types/notes.md", stray]]),
      emitContext("0.2", "2026-08-04T00:00:00.000Z"),
    );

    expect(result.files.get("types/notes.md")).toBe(stray);
    expect(result.migrated).toEqual([]);
  });
```

Add these imports to the top of `src/reconcile/migrate.test.ts`:

```ts
import { assembleFile, EMPTY_HUMAN, LEGACY_HUMAN_HINT } from "../emit/render/seam.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/reconcile/migrate.test.ts
```

Expected: FAIL — the hint survives; `migrated` is empty.

- [ ] **Step 3: Implement the migration**

In `src/reconcile/migrate.ts`, extend the imports:

```ts
import type { EmitContext } from "../emit/context.js";
import { assembleFile, EMPTY_HUMAN, LEGACY_HUMAN_HINT } from "../emit/render/seam.js";
import { frontmatterValue, replaceEntry } from "./frontmatter.js";
import { isOwnedFile, splitFile } from "./parse.js";
```

Add above `migrateConcept`:

```ts
/** The human region the emitter wrote at file creation before issue #24. */
const LEGACY_EMPTY_HUMAN = `\n\n${LEGACY_HUMAN_HINT}\n`;

/**
 * Issue #24 stopped emitting the human-region hint, but an existing bundle's copy
 * sits inside the region the reconciler must never rewrite (GOAL-8.3). The
 * exception is made safe by being unable to fire on anything a human wrote: the
 * whole region must be byte-identical to what the emitter itself put there at
 * creation. A region with so much as a blank line added is left alone.
 */
function migrateHumanHint(text: string, path: string): string | null {
  const split = splitFile(text, path);
  if (split === null || split.human !== LEGACY_EMPTY_HUMAN) {
    return null;
  }
  return assembleFile(split.parts, EMPTY_HUMAN);
}
```

Replace `migrateConcept` (lines 63-81) with:

```ts
/**
 * Every conversion for one file. The v0.1 -> v0.2 pair is version-gated; the
 * hint strip is not, because the hint has nothing to do with the OKF version.
 */
function migrateConcept(text: string, path: string, ctx: EmitContext): string | null {
  let current = text;
  let changed = false;

  if (ctx.okfVersion === "0.2") {
    const withProvenance = migrateProvenance(current, ctx);
    if (withProvenance !== null) {
      current = withProvenance;
      changed = true;
    }

    const withTombstoneKey = migrateTombstoneKey(current);
    if (withTombstoneKey !== null) {
      current = withTombstoneKey;
      changed = true;
    }
  }

  const withoutHint = migrateHumanHint(current, path);
  if (withoutHint !== null) {
    current = withoutHint;
    changed = true;
  }

  return changed ? current : null;
}
```

Then in `migrateBundle`, delete the early return (lines 96-98) and pass the path through:

```ts
export function migrateBundle(
  existing: ReadonlyMap<string, string>,
  ctx: EmitContext,
): MigrationResult {
  const files = new Map(existing);
  const migrated: string[] = [];

  for (const [path, text] of existing) {
    if (path === LOG_FILE || !isOwnedFile(path, text)) {
      continue;
    }
    const next = migrateConcept(text, path, ctx);
    if (next !== null && next !== text) {
      files.set(path, next);
      migrated.push(path);
    }
  }

  migrated.sort();
  return { files, migrated };
}
```

Update the doc comment above `migrateBundle` (lines 83-91), replacing its last paragraph with:

```
 * The bundle-root index needs no frontmatter rule here — it is re-rendered every
 * run and its okf_version comes from the emit context — but it does carry a human
 * region, so the hint strip applies to it like any other owned file.
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/reconcile/migrate.test.ts
```

Expected: PASS, all five new cases plus the existing provenance and tombstone cases.

- [ ] **Step 5: Add an end-to-end migration case**

Add to `test/migrate.test.ts`, inside its existing top-level `describe`. Read the file first and reuse its helper for writing a legacy bundle to a temp dir and its schema fixture path; the assertion is what matters:

```ts
  it("strips the human hint from an untouched file and keeps a human's own words (#24)", async () => {
    const outDir = await writeLegacyBundle();
    await appendFile(join(outDir, "types/Product.md"), "\n## Ownership\n\nCatalog team.\n");

    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T2, resource: RESOURCE });

    const order = await readFile(join(outDir, "types/Order.md"), "utf8");
    const product = await readFile(join(outDir, "types/Product.md"), "utf8");

    expect(order).not.toContain("Human-authored content below this line");
    expect(product).toContain("Human-authored content below this line");
    expect(product).toContain("Catalog team.");
  });
```

A current `syncOkfBundle` no longer writes the hint, so the legacy bundle cannot be produced by running the tool — it must be written by hand. If `test/migrate.test.ts` has no helper that does this, build one modelled on `test/reconcile.test.ts:405-410`: assemble each file with `assembleFile(parts, LEGACY_EMPTY)` where `LEGACY_EMPTY` is `` `\n\n${LEGACY_HUMAN_HINT}\n` ``, write them to a temp dir with `mkdtemp` + `writeFile`, and return the directory. `V1`, `T2`, and `RESOURCE` are the schema path and pinned timestamp/resource constants the file already defines; reuse them.

- [ ] **Step 6: Run it**

```bash
pnpm exec vitest run test/migrate.test.ts
```

Expected: PASS.

- [ ] **Step 7: Full suite and static checks**

```bash
pnpm test; pnpm run typecheck && pnpm run lint && pnpm run knip
```

Expected: no new failures beyond the golden `okf/shop-api` fixture and hint-asserting conformance cases.

- [ ] **Step 8: Commit**

```bash
git add src/reconcile/migrate.ts src/reconcile/migrate.test.ts test/migrate.test.ts
git commit -m "feat: strip the legacy human hint from pristine human regions (#24)"
```

---

### Task 4: SDL primitives

**Files:**
- Create: `src/emit/render/sdl.ts`
- Create: `src/emit/render/sdl.test.ts`
- Modify: `src/emit/render/signature.ts:1-25`
- Test: `src/emit/render/signature.test.ts` (must stay green untouched)

**Interfaces:**
- Consumes: `decoratedType(ref: TypeRef): string` from `./links.js`; the IR types from `../../model/ir.js`.
- Produces, all from `src/emit/render/sdl.ts`:
  - `sdlString(text: string): string`
  - `docstringLines(description: string | null, indent: string): string[]`
  - `appliedSdl(applied: readonly AppliedDirective[]): string`
  - `deprecatedSdl(deprecation: Deprecation | null): string`
  - `inlineArgumentList(args: readonly InputValueNode[]): string`
  - `argumentLines(args: readonly InputValueNode[], indent: string): string[]`
  - `fieldLines(field: FieldNode, indent: string): string[]`
  - `inputValueLines(value: InputValueNode, indent: string): string[]`

`inlineArgumentList` is today's `argumentList` from `signature.ts`, moved. Index rows must stay one line and carry no descriptions, so `signature.ts` keeps using the inline form while blocks use `argumentLines` — which delegates to `inlineArgumentList` whenever no argument has a description, so there is exactly one place that spells an inline argument list.

- [ ] **Step 1: Write the failing tests**

Create `src/emit/render/sdl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FieldNode, InputValueNode, TypeRef } from "../../model/ir.js";
import {
  appliedSdl,
  argumentLines,
  deprecatedSdl,
  docstringLines,
  fieldLines,
  inlineArgumentList,
  sdlString,
} from "./sdl.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

const arg = (over: Partial<InputValueNode> = {}): InputValueNode => ({
  name: "first",
  description: null,
  type: ref("Int"),
  defaultValue: null,
  deprecation: null,
  appliedDirectives: [],
  ...over,
});

const field = (over: Partial<FieldNode> = {}): FieldNode => ({
  name: "products",
  description: null,
  type: ref("Product", ["nonNull", "list", "nonNull"]),
  args: [],
  deprecation: null,
  appliedDirectives: [],
  ...over,
});

describe("sdlString", () => {
  it("uses a single-quoted string for a plain one-liner", () => {
    expect(sdlString("Where orders ship.")).toBe('"Where orders ship."');
  });

  it("uses a block string when the text spans lines", () => {
    expect(sdlString("One.\nTwo.")).toBe('"""\nOne.\nTwo.\n"""');
  });

  it("uses a block string when the text holds a quote", () => {
    expect(sdlString('Say "hi".')).toBe('"""\nSay "hi".\n"""');
  });

  it("uses a block string when the text holds a backslash", () => {
    expect(sdlString("A\\B")).toBe('"""\nA\\B\n"""');
  });

  it("escapes a triple quote inside a block string", () => {
    expect(sdlString('a """ b\nc')).toBe('"""\na \\""" b\nc\n"""');
  });
});

describe("docstringLines", () => {
  it("is empty for a missing description", () => {
    expect(docstringLines(null, "  ")).toEqual([]);
  });

  it("indents every line of a block string", () => {
    expect(docstringLines("One.\nTwo.", "  ")).toEqual(['  """', "  One.", "  Two.", '  """']);
  });
});

describe("appliedSdl", () => {
  it("is empty when nothing is applied", () => {
    expect(appliedSdl([])).toBe("");
  });

  it("prints each directive with its arguments, leading space included", () => {
    expect(
      appliedSdl([
        { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: "STAFF" }] },
        { name: "tag", path: "directives/tag.md", args: [] },
      ]),
    ).toBe(" @auth(requires: STAFF) @tag");
  });
});

describe("deprecatedSdl", () => {
  it("is empty when not deprecated", () => {
    expect(deprecatedSdl(null)).toBe("");
  });

  it("prints a bare @deprecated when there is no reason", () => {
    expect(deprecatedSdl({ reason: null })).toBe(" @deprecated");
  });

  it("prints the reason as an SDL string", () => {
    expect(deprecatedSdl({ reason: "Use email." })).toBe(' @deprecated(reason: "Use email.")');
  });
});

describe("inlineArgumentList", () => {
  it("is empty for no arguments, since SDL has no empty parens", () => {
    expect(inlineArgumentList([])).toBe("");
  });

  it("prints names, types, and defaults on one line", () => {
    expect(inlineArgumentList([arg(), arg({ name: "after", type: ref("String") })])).toBe(
      "(first: Int, after: String)",
    );
  });

  it("prints a default value", () => {
    expect(inlineArgumentList([arg({ defaultValue: "20" })])).toBe("(first: Int = 20)");
  });
});

describe("argumentLines", () => {
  it("stays inline when no argument is described", () => {
    expect(argumentLines([arg({ defaultValue: "20" })], "  ")).toEqual(["(first: Int = 20)"]);
  });

  it("breaks across lines when any argument is described", () => {
    expect(argumentLines([arg({ description: "How many." }), arg({ name: "after" })], "  ")).toEqual(
      ["(", '    "How many."', "    first: Int", "    after: Int", "  )"],
    );
  });
});

describe("fieldLines", () => {
  it("prints a bare field", () => {
    expect(fieldLines(field(), "  ")).toEqual(["  products: [Product!]!"]);
  });

  it("prints description, arguments, directives, and deprecation together", () => {
    expect(
      fieldLines(
        field({
          description: "Lists products.",
          args: [arg({ defaultValue: "20" })],
          deprecation: { reason: "Use search." },
          appliedDirectives: [{ name: "auth", path: "directives/auth.md", args: [] }],
        }),
        "  ",
      ),
    ).toEqual([
      '  "Lists products."',
      '  products(first: Int = 20): [Product!]! @auth @deprecated(reason: "Use search.")',
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/sdl.test.ts
```

Expected: FAIL — `./sdl.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/emit/render/sdl.ts`:

```ts
import type {
  AppliedDirective,
  Deprecation,
  FieldNode,
  InputValueNode,
} from "../../model/ir.js";
import { decoratedType } from "./links.js";

/**
 * A description as a GraphQL string. Single-quoted when it fits on one line and
 * needs no escaping; a block string otherwise, with its own delimiter escaped
 * per the GraphQL grammar. Content always sits on its own lines, so a trailing
 * quote in the text can never run into the closing delimiter.
 *
 * A single rule rather than a prettiness heuristic: the same description must
 * render identically on every run (GOAL-8.1).
 */
export function sdlString(text: string): string {
  if (!text.includes("\n") && !text.includes('"') && !text.includes("\\")) {
    return `"${text}"`;
  }
  return `"""\n${text.replace(/"""/g, '\\"""')}\n"""`;
}

/**
 * A description as indented SDL lines. Block strings have their common indent
 * stripped by GraphQL itself, so indenting every line uniformly changes how the
 * block reads without changing what it says.
 */
export function docstringLines(description: string | null, indent: string): string[] {
  if (description === null) {
    return [];
  }
  return sdlString(description)
    .split("\n")
    .map((line) => `${indent}${line}`);
}

/**
 * Applied directives as a suffix, leading space included so callers concatenate
 * rather than branch. Argument values are already SDL literals in the IR.
 * `@deprecated` and `@specifiedBy` are never here — `project.ts` models them as
 * fields, so they are printed from those fields instead and cannot double up.
 */
export function appliedSdl(applied: readonly AppliedDirective[]): string {
  return applied
    .map((directive) => {
      const args =
        directive.args.length === 0
          ? ""
          : `(${directive.args.map((arg) => `${arg.name}: ${arg.value}`).join(", ")})`;
      return ` @${directive.name}${args}`;
    })
    .join("");
}

/** Deprecation as the directive GraphQL defines for it. */
export function deprecatedSdl(deprecation: Deprecation | null): string {
  if (deprecation === null) {
    return "";
  }
  return deprecation.reason === null
    ? " @deprecated"
    : ` @deprecated(reason: ${sdlString(deprecation.reason)})`;
}

function argumentText(arg: InputValueNode): string {
  const type = decoratedType(arg.type);
  const base = arg.defaultValue === null ? `${arg.name}: ${type}` : `${arg.name}: ${type} = ${arg.defaultValue}`;
  return `${base}${appliedSdl(arg.appliedDirectives)}${deprecatedSdl(arg.deprecation)}`;
}

/**
 * The one-line argument list. Empty parentheses are not SDL, so an element with
 * no arguments renders as a bare `name: Type`. Descriptions are dropped: this is
 * the form index rows use (issue #21), and a row must stay one line.
 */
export function inlineArgumentList(args: readonly InputValueNode[]): string {
  if (args.length === 0) {
    return "";
  }
  return `(${args.map(argumentText).join(", ")})`;
}

/**
 * The argument list as it appears inside a block: inline when nothing is
 * described, one argument per line when anything is. Delegating the inline case
 * keeps a single spelling of it shared with `signature.ts`.
 */
export function argumentLines(args: readonly InputValueNode[], indent: string): string[] {
  if (args.length === 0) {
    return [""];
  }
  if (args.every((arg) => arg.description === null)) {
    return [inlineArgumentList(args)];
  }
  const inner = `${indent}  `;
  return [
    "(",
    ...args.flatMap((arg) => [...docstringLines(arg.description, inner), `${inner}${argumentText(arg)}`]),
    `${indent})`,
  ];
}

/** One field definition: its docstring, then its signature. */
export function fieldLines(field: FieldNode, indent: string): string[] {
  const args = argumentLines(field.args, indent);
  const head = args.slice(0, -1);
  const tail = args[args.length - 1] ?? "";
  const suffix = `: ${decoratedType(field.type)}${appliedSdl(field.appliedDirectives)}${deprecatedSdl(field.deprecation)}`;

  if (head.length === 0) {
    return [...docstringLines(field.description, indent), `${indent}${field.name}${tail}${suffix}`];
  }
  const [open, ...middle] = head;
  return [
    ...docstringLines(field.description, indent),
    `${indent}${field.name}${open}`,
    ...middle,
    `${tail}${suffix}`,
  ];
}

/** One input-object field or one enum-adjacent input value, as a definition line. */
export function inputValueLines(value: InputValueNode, indent: string): string[] {
  return [...docstringLines(value.description, indent), `${indent}${argumentText(value)}`];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/sdl.test.ts
```

Expected: PASS. If `argumentLines`'s multi-line case is off by an indent, fix the implementation to match the test — the test encodes the intended shape.

- [ ] **Step 5: Point `signature.ts` at the shared inline form**

Replace `src/emit/render/signature.ts:1-21` with:

```ts
import type { DirectiveDefinitionNode, OperationNode } from "../../model/ir.js";
import { decoratedType } from "./links.js";
import { inlineArgumentList } from "./sdl.js";
```

and replace both uses of `argumentList(` with `inlineArgumentList(` in `operationSignature` and `directiveSignature`, deleting the now-duplicated local `argumentList` function entirely.

- [ ] **Step 6: Confirm index signatures are untouched**

```bash
pnpm exec vitest run src/emit/render/signature.test.ts src/emit/bundle.test.ts
```

Expected: PASS with no edits to `signature.test.ts`. That file is the proof the move changed no behaviour — if it needs editing, the move was not behaviour-preserving.

- [ ] **Step 7: Static checks**

```bash
pnpm run typecheck && pnpm run lint && pnpm run knip
```

Expected: pass. knip will report `inputValueLines` and `docstringLines` as unused if nothing consumes them yet — that is expected at this point and is resolved in Task 5. If knip fails the build here, note it and proceed; Step 7 of Task 5 is where it must be green.

- [ ] **Step 8: Commit**

```bash
git add src/emit/render/sdl.ts src/emit/render/sdl.test.ts src/emit/render/signature.ts
git commit -m "feat: add the SDL primitive renderer, shared with index signatures (#24)"
```

---

### Task 5: The per-kind SDL block

**Files:**
- Modify: `src/emit/render/sdl.ts`
- Test: `src/emit/render/sdl.test.ts`

**Interfaces:**
- Consumes: every primitive from Task 4.
- Produces: `sdlBlock(concept: ConceptNode): readonly string[]` from `src/emit/render/sdl.ts` — the lines that go inside the fence, without the fence itself.

- [ ] **Step 1: Write the failing tests**

Append to `src/emit/render/sdl.test.ts`. Merge the import statements below into the file's existing import block at the top rather than leaving them mid-file — Biome's import ordering rule will reject them otherwise. The `ref`, `arg`, and `field` helpers are the ones already defined in this file by Task 4.

```ts
import type {
  DirectiveDefinitionNode,
  EnumTypeNode,
  InputObjectTypeNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  UnionTypeNode,
} from "../../model/ir.js";
import { sdlBlock } from "./sdl.js";

describe("sdlBlock", () => {
  it("prints an object with its interfaces, fields, and applied directives", () => {
    const customer: ObjectTypeNode = {
      kind: "object",
      name: "Customer",
      path: "types/Customer.md",
      description: "A person who can place orders.",
      appliedDirectives: [{ name: "key", path: "directives/key.md", args: [] }],
      interfaces: [ref("Node"), ref("Timestamped")],
      fields: [
        field({ name: "id", type: ref("ID", ["nonNull"]) }),
        field({
          name: "email",
          type: ref("EmailAddress", ["nonNull"]),
          appliedDirectives: [
            { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: "STAFF" }] },
          ],
        }),
      ],
    };

    expect(sdlBlock(customer)).toEqual([
      "type Customer implements Node & Timestamped @key {",
      "  id: ID!",
      "  email: EmailAddress! @auth(requires: STAFF)",
      "}",
    ]);
  });

  it("prints a member-less type as a header alone, since empty braces are not SDL", () => {
    const empty: ObjectTypeNode = {
      kind: "object",
      name: "Empty",
      path: "types/Empty.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [],
    };

    expect(sdlBlock(empty)).toEqual(["type Empty"]);
  });

  it("prints an interface", () => {
    const node: InterfaceTypeNode = {
      kind: "interface",
      name: "Timestamped",
      path: "types/Timestamped.md",
      description: null,
      appliedDirectives: [],
      interfaces: [ref("Node")],
      implementedBy: [ref("Customer")],
      fields: [field({ name: "createdAt", type: ref("DateTime", ["nonNull"]) })],
    };

    expect(sdlBlock(node)).toEqual([
      "interface Timestamped implements Node {",
      "  createdAt: DateTime!",
      "}",
    ]);
  });

  it("prints an input object with defaults and docstrings", () => {
    const input: InputObjectTypeNode = {
      kind: "input",
      name: "PlaceOrderInput",
      path: "types/PlaceOrderInput.md",
      description: null,
      appliedDirectives: [],
      fields: [
        arg({ name: "quantity", description: "How many.", defaultValue: "1" }),
        arg({ name: "note", type: ref("String") }),
      ],
    };

    expect(sdlBlock(input)).toEqual([
      "input PlaceOrderInput {",
      '  "How many."',
      "  quantity: Int = 1",
      "  note: String",
      "}",
    ]);
  });

  it("prints an enum with descriptions and deprecation", () => {
    const role: EnumTypeNode = {
      kind: "enum",
      name: "Role",
      path: "types/Role.md",
      description: null,
      appliedDirectives: [],
      values: [
        { name: "CUSTOMER", description: "A shopper.", deprecation: null, appliedDirectives: [] },
        { name: "GUEST", description: null, deprecation: { reason: "Use CUSTOMER." }, appliedDirectives: [] },
      ],
    };

    expect(sdlBlock(role)).toEqual([
      "enum Role {",
      '  "A shopper."',
      "  CUSTOMER",
      '  GUEST @deprecated(reason: "Use CUSTOMER.")',
      "}",
    ]);
  });

  it("prints a union on one line", () => {
    const payment: UnionTypeNode = {
      kind: "union",
      name: "PaymentMethod",
      path: "types/PaymentMethod.md",
      description: null,
      appliedDirectives: [],
      members: [ref("Card"), ref("PayPalAccount")],
    };

    expect(sdlBlock(payment)).toEqual(["union PaymentMethod = Card | PayPalAccount"]);
  });

  it("prints a scalar with its specifiedBy url", () => {
    const email: ScalarTypeNode = {
      kind: "scalar",
      name: "EmailAddress",
      path: "types/EmailAddress.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: "https://example.com/email",
    };

    expect(sdlBlock(email)).toEqual([
      'scalar EmailAddress @specifiedBy(url: "https://example.com/email")',
    ]);
  });

  it("prints an operation as a field definition", () => {
    const products: OperationNode = {
      kind: "query",
      name: "products",
      path: "queries/products.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [arg({ name: "first", defaultValue: "20" })],
      type: ref("Product", ["nonNull", "list", "nonNull"]),
      deprecation: null,
    };

    expect(sdlBlock(products)).toEqual(["products(first: Int = 20): [Product!]!"]);
  });

  it("prints a directive definition with its locations", () => {
    const auth: DirectiveDefinitionNode = {
      kind: "directive",
      name: "auth",
      path: "directives/auth.md",
      description: null,
      appliedDirectives: [],
      locations: ["FIELD_DEFINITION", "OBJECT"],
      args: [arg({ name: "requires", type: ref("Role", ["nonNull"]), defaultValue: "CUSTOMER" })],
      isRepeatable: true,
    };

    expect(sdlBlock(auth)).toEqual([
      "directive @auth(requires: Role! = CUSTOMER) repeatable on FIELD_DEFINITION | OBJECT",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/sdl.test.ts
```

Expected: FAIL — `sdlBlock` is not exported.

- [ ] **Step 3: Implement `sdlBlock`**

Add to `src/emit/render/sdl.ts`. Extend the type import at the top to also bring in `ConceptNode`, `DirectiveDefinitionNode`, `EnumTypeNode`, `InputObjectTypeNode`, `InterfaceTypeNode`, `ObjectTypeNode`, `OperationNode`, `ScalarTypeNode`, `TypeRef`, and `UnionTypeNode`:

```ts
const INDENT = "  ";

function implementsClause(interfaces: readonly TypeRef[]): string {
  return interfaces.length === 0
    ? ""
    : ` implements ${interfaces.map((ref) => ref.name).join(" & ")}`;
}

/**
 * A definition with members. GraphQL has no empty braces, so a member-less type
 * is its header alone — which is valid SDL and says exactly as much.
 */
function withBody(header: string, members: readonly string[]): string[] {
  return members.length === 0 ? [header] : [`${header} {`, ...members, "}"];
}

function objectBlock(node: ObjectTypeNode | InterfaceTypeNode): string[] {
  const keyword = node.kind === "object" ? "type" : "interface";
  const header = `${keyword} ${node.name}${implementsClause(node.interfaces)}${appliedSdl(node.appliedDirectives)}`;
  return withBody(
    header,
    node.fields.flatMap((field) => fieldLines(field, INDENT)),
  );
}

function inputBlock(node: InputObjectTypeNode): string[] {
  return withBody(
    `input ${node.name}${appliedSdl(node.appliedDirectives)}`,
    node.fields.flatMap((value) => inputValueLines(value, INDENT)),
  );
}

function enumBlock(node: EnumTypeNode): string[] {
  return withBody(
    `enum ${node.name}${appliedSdl(node.appliedDirectives)}`,
    node.values.flatMap((value) => [
      ...docstringLines(value.description, INDENT),
      `${INDENT}${value.name}${appliedSdl(value.appliedDirectives)}${deprecatedSdl(value.deprecation)}`,
    ]),
  );
}

function unionBlock(node: UnionTypeNode): string[] {
  const header = `union ${node.name}${appliedSdl(node.appliedDirectives)}`;
  return node.members.length === 0
    ? [header]
    : [`${header} = ${node.members.map((ref) => ref.name).join(" | ")}`];
}

/**
 * `@specifiedBy` is printed from `specifiedByUrl` rather than from
 * `appliedDirectives`, where `project.ts` deliberately does not put it.
 */
function scalarBlock(node: ScalarTypeNode): string[] {
  const specifiedBy =
    node.specifiedByUrl === null ? "" : ` @specifiedBy(url: ${sdlString(node.specifiedByUrl)})`;
  return [`scalar ${node.name}${appliedSdl(node.appliedDirectives)}${specifiedBy}`];
}

/**
 * An operation is one field of a root type, so it prints as a field definition —
 * a valid SDL fragment rather than a standalone document. The root type name is
 * not lost with it: the concept's `resource` anchor carries it.
 */
function operationBlock(node: OperationNode): string[] {
  return fieldLines(
    {
      name: node.name,
      description: null,
      type: node.type,
      args: node.args,
      deprecation: node.deprecation,
      appliedDirectives: node.appliedDirectives,
    },
    "",
  );
}

/** Locations are already sorted by `project.ts`; this prints them as the IR holds them. */
function directiveBlock(node: DirectiveDefinitionNode): string[] {
  const args = argumentLines(node.args, "");
  const repeatable = node.isRepeatable ? " repeatable" : "";
  const on = ` on ${node.locations.join(" | ")}`;
  const head = args.slice(0, -1);
  const tail = args[args.length - 1] ?? "";

  if (head.length === 0) {
    return [`directive @${node.name}${tail}${repeatable}${on}`];
  }
  const [open, ...middle] = head;
  return [`directive @${node.name}${open}`, ...middle, `${tail}${repeatable}${on}`];
}

/** The lines inside a concept file's fenced `graphql` block. */
export function sdlBlock(concept: ConceptNode): readonly string[] {
  switch (concept.kind) {
    case "object":
    case "interface":
      return objectBlock(concept);
    case "input":
      return inputBlock(concept);
    case "enum":
      return enumBlock(concept);
    case "union":
      return unionBlock(concept);
    case "scalar":
      return scalarBlock(concept);
    case "query":
    case "mutation":
    case "subscription":
      return operationBlock(concept);
    case "directive":
      return directiveBlock(concept);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/sdl.test.ts
```

Expected: PASS, every kind.

- [ ] **Step 5: Prove the output is really SDL, not SDL-shaped text**

Append to `src/emit/render/sdl.test.ts`:

```ts
describe("sdlBlock output parses as GraphQL", () => {
  const wrap = (lines: readonly string[]): string => {
    const text = lines.join("\n");
    return /^(type|interface|input|enum|union|scalar|directive)\b/.test(text)
      ? text
      : `type Wrapper {\n${text}\n}`;
  };

  it("parses a field with a described argument", () => {
    const products: OperationNode = {
      kind: "query",
      name: "products",
      path: "queries/products.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [arg({ name: "first", description: "How many.", defaultValue: "20" })],
      type: ref("Product"),
      deprecation: null,
    };

    expect(() => parse(wrap(sdlBlock(products)))).not.toThrow();
  });

  it("parses a description containing quotes and newlines", () => {
    const weird: ObjectTypeNode = {
      kind: "object",
      name: "Weird",
      path: "types/Weird.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [field({ name: "a", description: 'Say "hi".\n\nAnd \\ this.', type: ref("String") })],
    };

    expect(() => parse(wrap(sdlBlock(weird)))).not.toThrow();
    expect(parse(wrap(sdlBlock(weird))).definitions).toHaveLength(1);
  });
});
```

Add `import { parse } from "graphql";` to the file's imports.

- [ ] **Step 6: Run them**

```bash
pnpm exec vitest run src/emit/render/sdl.test.ts
```

Expected: PASS. A failure here means `sdlString` or `argumentLines` produces something GraphQL rejects — fix the producer, never the assertion.

- [ ] **Step 7: Static checks**

```bash
pnpm run typecheck && pnpm run lint && pnpm run knip
```

Expected: all pass, knip included — every primitive from Task 4 now has a consumer.

- [ ] **Step 8: Commit**

```bash
git add src/emit/render/sdl.ts src/emit/render/sdl.test.ts
git commit -m "feat: render every concept kind as a GraphQL SDL block (#24)"
```

---

### Task 6: The References line

**Files:**
- Create: `src/emit/render/references.ts`
- Create: `src/emit/render/references.test.ts`

**Interfaces:**
- Consumes: `bundleLink(path: string): string` from `./links.js`; the IR types.
- Produces: `referencesLine(concept: ConceptNode): readonly string[]` from `src/emit/render/references.ts` — `[]` when the concept has no outbound edges, otherwise `["", "References: …"]` so callers splice it straight into a line array.

Ordering is alphabetical by concept name with the `@` sigil ignored, and the target path as tiebreaker so the order is total even if a type and a directive ever share a name (`GOAL-8.1`). `Implemented by` targets are excluded: they are a reverse edge, already linked in their own line, and folding them in would erase the direction distinction that line exists to make.

- [ ] **Step 1: Write the failing tests**

Create `src/emit/render/references.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  TypeRef,
} from "../../model/ir.js";
import { referencesLine } from "./references.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

/** A spec-defined element: no concept file, so no link (issue #23). */
const builtIn = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: null,
  wrappers,
});

const object = (over: Partial<ObjectTypeNode> = {}): ObjectTypeNode => ({
  kind: "object",
  name: "Customer",
  path: "types/Customer.md",
  description: null,
  appliedDirectives: [],
  interfaces: [],
  fields: [],
  ...over,
});

describe("referencesLine", () => {
  it("is empty when a concept links to nothing", () => {
    expect(referencesLine(object())).toEqual([]);
  });

  it("names field types, interfaces, and applied directives, alphabetically", () => {
    const customer = object({
      interfaces: [ref("Timestamped"), ref("Node")],
      fields: [
        {
          name: "email",
          description: null,
          type: ref("EmailAddress", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [
            { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: "STAFF" }] },
          ],
        },
        {
          name: "defaultAddress",
          description: null,
          type: ref("Address"),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(referencesLine(customer)).toEqual([
      "",
      "References: [`Address`](/types/Address.md), [`@auth`](/directives/auth.md), " +
        "[`EmailAddress`](/types/EmailAddress.md), [`Node`](/types/Node.md), " +
        "[`Timestamped`](/types/Timestamped.md).",
    ]);
  });

  it("names each target once however often it appears", () => {
    const customer = object({
      fields: [
        {
          name: "createdAt",
          description: null,
          type: ref("DateTime", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
        {
          name: "updatedAt",
          description: null,
          type: ref("DateTime"),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(referencesLine(customer)).toEqual([
      "",
      "References: [`DateTime`](/types/DateTime.md).",
    ]);
  });

  it("omits spec-defined elements, which have no concept file", () => {
    const customer = object({
      fields: [
        {
          name: "id",
          description: null,
          type: builtIn("ID", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [{ name: "deprecated", path: null, args: [] }],
        },
      ],
    });

    expect(referencesLine(customer)).toEqual([]);
  });

  it("reaches argument types", () => {
    const products: OperationNode = {
      kind: "query",
      name: "products",
      path: "queries/products.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [
        {
          name: "filter",
          description: null,
          type: ref("ProductFilter"),
          defaultValue: null,
          deprecation: null,
          appliedDirectives: [],
        },
      ],
      type: ref("Product", ["nonNull", "list", "nonNull"]),
      deprecation: null,
    };

    expect(referencesLine(products)).toEqual([
      "",
      "References: [`Product`](/types/Product.md), [`ProductFilter`](/types/ProductFilter.md).",
    ]);
  });

  it("excludes the reverse implemented-by edge", () => {
    const timestamped: InterfaceTypeNode = {
      kind: "interface",
      name: "Timestamped",
      path: "types/Timestamped.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      implementedBy: [ref("Customer")],
      fields: [],
    };

    expect(referencesLine(timestamped)).toEqual([]);
  });

  it("is empty for a scalar that applies nothing", () => {
    const email: ScalarTypeNode = {
      kind: "scalar",
      name: "EmailAddress",
      path: "types/EmailAddress.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: "https://example.com/email",
    };

    expect(referencesLine(email)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/references.test.ts
```

Expected: FAIL — `./references.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/emit/render/references.ts`:

```ts
import type {
  AppliedDirective,
  ConceptNode,
  InputValueNode,
  TypeRef,
} from "../../model/ir.js";
import { bundleLink } from "./links.js";

/**
 * One outbound edge. `label` is what the reader sees; `sortKey` is the bare name,
 * so a directive files under its own letter rather than under `@`.
 */
type Edge = { readonly sortKey: string; readonly label: string; readonly path: string };

function typeEdge(ref: TypeRef): Edge[] {
  return ref.path === null ? [] : [{ sortKey: ref.name, label: `\`${ref.name}\``, path: ref.path }];
}

function directiveEdges(applied: readonly AppliedDirective[]): Edge[] {
  return applied.flatMap((directive) =>
    directive.path === null
      ? []
      : [{ sortKey: directive.name, label: `\`@${directive.name}\``, path: directive.path }],
  );
}

function inputValueEdges(values: readonly InputValueNode[]): Edge[] {
  return values.flatMap((value) => [
    ...typeEdge(value.type),
    ...directiveEdges(value.appliedDirectives),
  ]);
}

/**
 * Every concept a concept points at. `implementedBy` is deliberately absent: it
 * is the reverse edge, carried by its own prose line, and merging it here would
 * assert that an interface references its implementors.
 */
function edgesOf(concept: ConceptNode): Edge[] {
  const own = directiveEdges(concept.appliedDirectives);

  switch (concept.kind) {
    case "object":
    case "interface":
      return [
        ...own,
        ...concept.interfaces.flatMap(typeEdge),
        ...concept.fields.flatMap((field) => [
          ...typeEdge(field.type),
          ...directiveEdges(field.appliedDirectives),
          ...inputValueEdges(field.args),
        ]),
      ];
    case "input":
      return [...own, ...inputValueEdges(concept.fields)];
    case "enum":
      return [
        ...own,
        ...concept.values.flatMap((value) => directiveEdges(value.appliedDirectives)),
      ];
    case "union":
      return [...own, ...concept.members.flatMap(typeEdge)];
    case "scalar":
      return own;
    case "query":
    case "mutation":
    case "subscription":
      return [...own, ...typeEdge(concept.type), ...inputValueEdges(concept.args)];
    case "directive":
      return [...own, ...inputValueEdges(concept.args)];
  }
}

/**
 * The links an SDL block cannot hold, gathered onto one line beneath it.
 *
 * OKF §6.1 is explicit that a link asserts a relationship, and consumers that
 * build a graph view read links as its edges. Leaving them derivable from the
 * naming scheme would make them edges only for a consumer that has implemented
 * our naming scheme, and would leave `GOAL-7.2`'s no-dangling-link invariant
 * with nothing to check.
 */
export function referencesLine(concept: ConceptNode): readonly string[] {
  const byPath = new Map<string, Edge>();
  for (const edge of edgesOf(concept)) {
    if (!byPath.has(edge.path)) {
      byPath.set(edge.path, edge);
    }
  }
  if (byPath.size === 0) {
    return [];
  }

  const sorted = [...byPath.values()].sort((left, right) => {
    if (left.sortKey !== right.sortKey) {
      return left.sortKey < right.sortKey ? -1 : 1;
    }
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  });

  const links = sorted.map((edge) => `[${edge.label}](${bundleLink(edge.path)})`);
  return ["", `References: ${links.join(", ")}.`];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/references.test.ts
```

Expected: PASS.

- [ ] **Step 5: Static checks**

```bash
pnpm run typecheck && pnpm run lint
```

Expected: pass. knip will flag `referencesLine` as unused until Task 7 consumes it; that is expected here.

- [ ] **Step 6: Commit**

```bash
git add src/emit/render/references.ts src/emit/render/references.test.ts
git commit -m "feat: gather a concept's outbound links onto a References line (#24)"
```

---

### Task 7: Rewrite the body as an assembler

**Files:**
- Modify: `src/emit/render/body.ts` (whole file)
- Modify: `src/emit/render/body.test.ts` (whole file)
- Delete: `src/emit/render/text.ts`, `src/emit/render/text.test.ts`

**Interfaces:**
- Consumes: `sdlBlock` (Task 5), `referencesLine` (Task 6), `typeLink` from `./links.js`.
- Produces: `renderBody(concept: ConceptNode): string` — the only export left. The eight `render*Body` functions are gone; `src/emit/render/concept.ts` already calls only `renderBody`.

`text.ts` goes with the tables: `cell()` escapes a table cell and `collapse()` flattens a docstring for one, and `body.ts` is the only consumer of either. Leaving them would fail `pnpm run knip`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/emit/render/body.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  TypeRef,
} from "../../model/ir.js";
import { renderBody } from "./body.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

const customer: ObjectTypeNode = {
  kind: "object",
  name: "Customer",
  path: "types/Customer.md",
  description: "A person who can place orders.\n\nNever hard-deleted.",
  appliedDirectives: [],
  interfaces: [ref("Node")],
  fields: [
    {
      name: "defaultAddress",
      description: "Where orders ship.",
      type: ref("Address"),
      args: [],
      deprecation: null,
      appliedDirectives: [],
    },
  ],
};

describe("renderBody", () => {
  it("renders heading, description, a fenced SDL block, and the references line", () => {
    expect(renderBody(customer)).toBe(
      [
        "# Customer",
        "",
        "A person who can place orders.",
        "",
        "Never hard-deleted.",
        "",
        "# Schema",
        "",
        "```graphql",
        "type Customer implements Node {",
        '  "Where orders ship."',
        "  defaultAddress: Address",
        "}",
        "```",
        "",
        "References: [`Address`](/types/Address.md), [`Node`](/types/Node.md).",
        "",
      ].join("\n"),
    );
  });

  it("emits no markdown table anywhere", () => {
    expect(renderBody(customer)).not.toContain("| --- |");
  });

  it("omits the description block when a concept has no docstring", () => {
    const bare: ObjectTypeNode = { ...customer, description: null, interfaces: [], fields: [] };

    expect(renderBody(bare)).toBe(["# Customer", "", "# Schema", "", "```graphql", "type Customer", "```", ""].join("\n"));
  });

  it("keeps the reverse implemented-by edge, which SDL cannot express", () => {
    const timestamped: InterfaceTypeNode = {
      kind: "interface",
      name: "Timestamped",
      path: "types/Timestamped.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      implementedBy: [ref("Customer"), ref("Order")],
      fields: [],
    };

    expect(renderBody(timestamped)).toContain(
      "Implemented by [`Customer`](/types/Customer.md), [`Order`](/types/Order.md).",
    );
  });

  it("titles a directive with its sigil", () => {
    const auth = {
      kind: "directive" as const,
      name: "auth",
      path: "directives/auth.md",
      description: null,
      appliedDirectives: [],
      locations: ["FIELD_DEFINITION"],
      args: [],
      isRepeatable: false,
    };

    expect(renderBody(auth)).toContain("# @auth");
  });

  it("states an operation's deprecation inside the block, not above it", () => {
    const legacy: OperationNode = {
      kind: "query",
      name: "legacy",
      path: "queries/legacy.md",
      description: null,
      appliedDirectives: [],
      rootTypeName: "Query",
      args: [],
      type: ref("Order"),
      deprecation: { reason: "Use orders." },
    };

    expect(renderBody(legacy)).toContain('legacy: Order @deprecated(reason: "Use orders.")');
    expect(renderBody(legacy)).not.toContain("**Deprecated");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/body.test.ts
```

Expected: FAIL — tables are still emitted and `renderBody` is not shaped this way.

- [ ] **Step 3: Replace `body.ts` entirely**

```ts
import type { ConceptNode } from "../../model/ir.js";
import { typeLink } from "./links.js";
import { referencesLine } from "./references.js";
import { sdlBlock } from "./sdl.js";

function descriptionBlock(text: string | null): string[] {
  return text === null ? [] : ["", text];
}

/**
 * The one relationship an element's own SDL cannot state, because it points the
 * other way. Everything else the body used to spell out in prose — implements,
 * applied directives, locations, repeatability, return type, specifiedBy,
 * deprecation — is in the block, where GraphQL puts it.
 */
function implementedByBlock(concept: ConceptNode): string[] {
  if (concept.kind !== "interface" || concept.implementedBy.length === 0) {
    return [];
  }
  const links = concept.implementedBy.map((ref) => typeLink(ref)).join(", ");
  return ["", `Implemented by ${links}.`];
}

/**
 * OKF §4.2 gives `# Schema` conventional meaning and asks producers to favour
 * structural markdown, naming fenced code blocks alongside tables. SDL is the
 * notation a GraphQL schema is written in, so the section holds one (issue #24).
 * This is a second H1 below the title, matching §4.3's own example.
 */
function schemaSection(concept: ConceptNode): string[] {
  return [
    "",
    "# Schema",
    "",
    "```graphql",
    ...sdlBlock(concept),
    "```",
    ...referencesLine(concept),
  ];
}

function heading(concept: ConceptNode): string {
  return concept.kind === "directive" ? `# @${concept.name}` : `# ${concept.name}`;
}

export function renderBody(concept: ConceptNode): string {
  return [
    heading(concept),
    ...descriptionBlock(concept.description),
    ...implementedByBlock(concept),
    ...schemaSection(concept),
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/body.test.ts
```

Expected: PASS.

- [ ] **Step 5: Delete the table helpers**

```bash
git rm src/emit/render/text.ts src/emit/render/text.test.ts
```

- [ ] **Step 6: Run the whole suite and read the damage**

```bash
pnpm test
```

Expected failures, all of which are fixtures rather than defects:
- `test/example-bundle.test.ts` — the golden bundle, regenerated in Task 8.
- `src/conformance.test.ts:184` — asserts the table header; rewritten in Task 8.
- Any `src/emit/bundle.test.ts` or `src/emit/render/concept.test.ts` case asserting body text. Update these to the SDL shape now: they are unit tests, not fixtures.

Anything else failing is a real defect — fix it before moving on.

- [ ] **Step 7: Static checks**

```bash
pnpm run typecheck && pnpm run lint && pnpm run knip
```

Expected: pass. knip must now be clean — `referencesLine` has a consumer and `text.ts` is gone. If knip reports another newly-orphaned export, delete it rather than re-exporting it.

- [ ] **Step 8: Commit**

```bash
git add src/emit/render/body.ts src/emit/render/body.test.ts src/emit/render/text.ts src/emit/render/text.test.ts src/emit/bundle.test.ts src/emit/render/concept.test.ts
git commit -m "feat: render concept bodies as SDL blocks instead of tables (#24)"
```

---

### Task 8: Conformance, fixtures, documentation, measurement

**Files:**
- Modify: `src/conformance.test.ts:184-190`
- Modify: `README.md`
- Modify: `okf/shop-api/` (regenerated), `okf/countries-api/` (regenerated)

**Interfaces:**
- Consumes: the emitter behaviour from Tasks 1–7. Produces no new source.

- [ ] **Step 1: Replace the table assertion with a fence assertion**

In `src/conformance.test.ts`, replace the test at lines 184-190 with:

```ts
  it("emits a top-level # Schema section holding an SDL block", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const product = files.get("types/Product.md");

    expect(product).toContain("\n# Schema\n");
    expect(product).toContain("\n```graphql\ntype Product");
    expect(product).not.toContain("| --- |");
  });
```

- [ ] **Step 2: Add the bundle-wide SDL-parse invariant**

Add immediately after it, inside the same `describe`:

```ts
  it("emits only parseable SDL in every graphql block", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const blocks = /```graphql\n([\s\S]*?)```/g;

    for (const [path, contents] of files) {
      for (const [, block] of contents.matchAll(blocks)) {
        // An operation renders as a field definition, which is a fragment
        // rather than a document; it parses inside a type.
        const document = /^(type|interface|input|enum|union|scalar|directive)\b/.test(block)
          ? block
          : `type Wrapper {\n${block}}`;
        expect(() => parse(document), `${path} holds unparseable SDL:\n${block}`).not.toThrow();
      }
    }
  });
```

Add `import { parse } from "graphql";` to the file's imports. Note it already imports `parse` from `yaml` — alias one of them, e.g. `import { parse as parseSdl } from "graphql";`, and use `parseSdl` in this test.

- [ ] **Step 3: Run the conformance suite**

```bash
pnpm exec vitest run src/conformance.test.ts
```

Expected: PASS, including the pre-existing link-resolution (`:121`) and no-relative-link (`:144`) invariants — those now guard the `References:` line and must be green without edits.

- [ ] **Step 4: Regenerate the shop-api fixture**

```bash
UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts
```

This rewrites `okf/shop-api` from the pinned v1 → v2 → v3 → v0.2-migration sequence. No network needed.

- [ ] **Step 5: Confirm the regenerated bundle matches and inspect it**

```bash
pnpm exec vitest run test/example-bundle.test.ts
```

Expected: PASS.

```bash
git diff okf/shop-api/types/Customer.md
```

Expected: the table is gone, a `graphql` fence holds `type Customer implements Node & Timestamped`, the `References:` line lists the linked concepts alphabetically, and no hint comment remains.

```bash
git status --short okf/shop-api
```

Expected: nearly every file modified — this change touches every concept file by design — including `log.md`, which gains a dated entry for the run. Confirm `types/Product.md` still contains `Ping #catalog`: that human section surviving is `GOAL-8.3` demonstrated on the committed bundle, and losing it means Task 3's migration is too broad.

- [ ] **Step 6: Regenerate the countries-api fixture**

Generated from a live third-party endpoint; needs network access.

```bash
pnpm run build
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
```

If the endpoint is unreachable, stop and say so in the PR rather than hand-editing the bundle. Hand-edited generated output is exactly what `M1/GOAL-4.5` exists to prevent.

```bash
git status --short okf/countries-api
```

Expected: every concept file modified, plus `log.md`.

- [ ] **Step 7: Measure**

```bash
git diff --stat okf/shop-api okf/countries-api
```

```bash
find okf/shop-api -name '*.md' | xargs wc -c | tail -1
```

Record the shop bundle's total byte count against the 46,217 bytes the issue measured before the change. This number goes in the PR whether or not it flatters the change.

- [ ] **Step 8: Document the format in the README**

In `README.md`, immediately after the `### The generated region` section added in Task 2, add:

```markdown
### Schema sections are SDL

A concept file's `# Schema` section is a fenced `graphql` block holding the
element's own SDL definition, followed by a `References:` line linking each
concept it names:

    # Schema

    ```graphql
    type Customer implements Node & Timestamped {
      "Where orders are shipped by default."
      defaultAddress: Address
      email: EmailAddress! @auth(requires: STAFF)
    }
    ```

    References: [`Address`](/types/Address.md), [`@auth`](/directives/auth.md), ...

SDL rather than a table because it is the notation GraphQL is written in, it
carries applied directives that a table drops, and OKF §4.2 names fenced code
blocks as structural markdown alongside tables. The links move to their own line
because a code fence cannot hold one, and they stay rather than being left
derivable from file names: §6.1 treats a link as an asserted relationship, and
the bundle's graph is meant to be readable by consumers that know nothing about
this tool's naming scheme.

An operation's block is a field definition rather than a whole type, since that
is what the concept is; its root type is recorded in the file's `resource` field.
```

- [ ] **Step 9: Full CI-equivalent verification**

```bash
pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Expected: all pass, coverage at or above lines 90% / functions 90% / branches 85% / statements 90%.

- [ ] **Step 10: Confirm determinism directly**

```bash
pnpm exec vitest run test/reconcile.test.ts test/migrate.test.ts
```

Expected: PASS — a re-run against an unchanged schema stays byte-identical with no `log.md` entry (`GOAL-8.1`).

- [ ] **Step 11: Commit**

```bash
git add src/conformance.test.ts README.md okf/shop-api okf/countries-api
git commit -m "docs: regenerate bundles as SDL, document the format (#24)"
```

- [ ] **Step 12: Open the PR**

Reference issue #24 and the spec. State five things explicitly:

1. The measured byte change from Step 7, against the issue's 46,217-byte baseline — and that the `References:` line is roughly break-even by design, so the win comes from table→SDL compression, not from deduplicating links.
2. That non-GraphQL consumers lose a uniformly-shaped table. The bundle describes a GraphQL API and §4.2 sanctions fenced code blocks, so this is a deliberate trade.
3. That OKF's reference tooling extracts field names from a top-level `# Schema` section and we do not know whether that parser is table-shaped. If it is, generic field extraction degrades. This is SHOULD-level, not the §11 conformance floor.
4. That upgrading an existing bundle strips the legacy human hint from files whose human region is otherwise pristine — the one deliberate exception to `GOAL-8.3`, narrow by construction — and that this is a logged migration.
5. That verification is CI-only by decision: no `bench/` run backs the retrieval-accuracy claim, and the harness stays available if the result looks wrong in practice.

---

## Verification

Every check CI enforces, in one run:

```bash
pnpm install --frozen-lockfile && pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Behavioural guarantees this plan must leave intact:

- Re-running against an unchanged schema is byte-identical with no `log.md` entry (`GOAL-8.1`) — `test/reconcile.test.ts`.
- Human-authored content below the end marker survives regeneration (`GOAL-8.3`) — `test/example-bundle.test.ts`, whose committed `types/Product.md` must keep its `Ping #catalog` section. The single exception is Task 3's hint strip, which cannot fire on a region a human has touched.
- No link in the bundle dangles (`GOAL-7.2`) — `src/conformance.test.ts:121`. The `References:` line is now what this guards.
- No relative internal links (`#22`) — `src/conformance.test.ts:144`.
- No concept file for a spec-defined element (`#23`) — `src/conformance.test.ts:176`, and no such element in any `References:` line.
- Index rows still carry their signatures (`#21`) — `src/emit/render/signature.test.ts`, which must pass untouched through Task 4's move.
- Every emitted `graphql` block parses as GraphQL — `src/conformance.test.ts`, added in Task 8.
