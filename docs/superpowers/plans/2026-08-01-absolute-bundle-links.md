# Absolute Bundle-Relative Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit every internal Markdown link in the bundle in OKF §6.1's absolute bundle-relative form (`/types/objects/Product.md`) instead of the depth-dependent relative form (`../scalars/DateTime.md`).

**Architecture:** Bundle paths are unchanged — they stay `types/objects/Product.md` with no leading slash, because they are the keys of the file map the emitter builds, the reconciler diffs, and `applyPlan` joins against `outDir`. The leading slash is added in exactly one place, `src/emit/render/links.ts`, and consumed at the four sites that emit Markdown links. `src/model/naming.ts` remains the single source of truth for paths (`GOAL-4.5`) and does not change.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), Vitest + v8 coverage, Biome, knip, tsdown, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-01-absolute-bundle-links-design.md`](../specs/2026-08-01-absolute-bundle-links-design.md). Resolves the first half of [issue #22](https://github.com/ayrtonvwf/graphql-okf/issues/22). Branch: `claude/issue-22-3988b4`.

## Global Constraints

- `GOAL-*` and `NG-*` refer to `docs/northstar-specs/GOAL-M1.md`. §-prefixed numbers refer to the OKF v0.2 specification unless another document is named.
- **No paths change in this plan.** Every concept file stays exactly where it is. Only link text changes. A task that moves a file is out of scope and wrong.
- **Determinism (`GOAL-8.1`, `NG-6`):** no runtime model calls, no nondeterministic iteration order, no wall-clock dependence beyond the ISO-8601 timestamps the spec already defines. `bundleLink` is a pure function of its argument.
- **The link rule, verbatim:** every link from one bundle file to another is `/` followed by the target's bundle-relative path. Links matching `^[a-z]+:` (external) or starting with `#` (fragment) are untouched — these come from schema documentation strings, which `GOAL-6.3` requires be preserved verbatim.
- **Coverage gate (enforced, not aspirational):** lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%. Verify with `pnpm run coverage`.
- **TDD (`.claude/skills/test-driven-development`):** write the failing test, run it and watch it fail for the stated reason, write the minimal implementation, run it and watch it pass. Do not write implementation before its test. Do not backfill tests.
- **`okf/shop-api/` is a golden fixture.** It is guarded byte-for-byte by `test/example-bundle.test.ts` and is regenerated only by `UPDATE_EXAMPLE=1`, never by hand. Any task that changes emitted bytes must regenerate it in the same commit, or the test suite goes red.
- **`okf/countries-api/` has no golden test** and is generated from a live endpoint. It is regenerated once, in Task 8.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `test/support/bundle-links.ts` (create) | Link inspection helpers shared by the conformance tests: classify a target, resolve it against the bundle root, extract a file's generated region. | 1, 6 |
| `test/support/bundle-links.test.ts` (create) | Unit tests for the above. | 1, 6 |
| `src/conformance.test.ts` (modify) | Rewired onto the helpers; gains the strict no-relative-links invariant. | 1, 6 |
| `src/emit/render/links.ts` (modify) | `relLink` → `bundleLink`; `typeLink` loses `fromPath`. The only module that knows about the leading slash. | 2 |
| `src/emit/render/links.test.ts` (modify) | Unit tests for the above. | 2 |
| `src/emit/render/body.ts` (modify) | Twelve internal functions shed the `fromPath` parameter they carried only to compute link depth. | 2 |
| `src/emit/render/body.test.ts` (modify) | Assertions updated from `../`-relative to `/`-absolute targets. | 2 |
| `src/emit/bundle.ts` (modify) | Index entry links become absolute. | 3 |
| `src/emit/bundle.test.ts` (modify) | Index link assertions updated. | 3 |
| `src/reconcile/log.ts` (modify) | `log.md` concept links become absolute. | 4 |
| `src/reconcile/log.test.ts` (modify) | Log link assertions updated. | 4 |
| `test/fixtures/kitchen-sink.graphql` (modify) | Gains a description containing a *relative* Markdown link, pinning that `GOAL-6.3`-preserved prose is not mistaken for an emitter-authored link. | 5 |
| `test/reconcile.test.ts` (modify) | Gains the legacy-bundle transition test. | 7 |
| `okf/shop-api/**` (regenerate) | Committed golden bundle. | 2, 3, 4 |
| `okf/countries-api/**` (regenerate) | Committed sample bundle. | 8 |
| `docs/northstar-specs/GOAL-M1.md` (modify) | `GOAL-7.1`/`GOAL-7.2` name the emitted link convention. | 9 |
| `README.md` (modify) | Notes that committed bundles' links do not resolve in GitHub's file browser. | 9 |

**Task ordering rationale.** Task 1 comes first because the existing conformance check resolves link targets with `posix.join(posix.dirname(path), target)`, which breaks the instant anything emits a `/`-prefixed target. Teaching the checker both forms *before* changing any emitter keeps every intermediate commit green. The strict "no relative links" assertion is deliberately held back to Task 6, after all four emission sites have been converted.

---

### Task 1: Teach the conformance link checker the absolute form

Extract the link-checking logic out of `src/conformance.test.ts` into a tested helper module, and make it accept both the relative form (emitted today) and the absolute form (emitted from Task 2 onward). Behaviour is unchanged today — this is pure preparation, and it must stay green.

**Files:**
- Create: `test/support/bundle-links.ts`
- Create: `test/support/bundle-links.test.ts`
- Modify: `src/conformance.test.ts:115-133` (the "resolves every internal link to a file in the bundle" test)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `internalLinkTargets(text: string): string[]` — every Markdown link target in `text` that is neither external (`^[a-z]+:`) nor a pure fragment (`^#`), in source order.
  - `resolveBundleLink(fromPath: string, target: string): string` — the bundle-relative path a target names. A `/`-prefixed target resolves against the bundle root; anything else resolves against `posix.dirname(fromPath)`. The returned path never has a leading slash, so it can be looked up directly in the bundle file map.

- [ ] **Step 1: Write the failing test**

Create `test/support/bundle-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { internalLinkTargets, resolveBundleLink } from "./bundle-links.js";

describe("internalLinkTargets", () => {
  it("finds bundle-internal targets", () => {
    const text = "See [`Money`](Money.md) and [`ID`](/types/scalars/ID.md).";

    expect(internalLinkTargets(text)).toEqual(["Money.md", "/types/scalars/ID.md"]);
  });

  it("skips external links and pure fragments", () => {
    const text = "[docs](https://example.test) [here](#schema) [`X`](/types/X.md)";

    expect(internalLinkTargets(text)).toEqual(["/types/X.md"]);
  });

  it("returns targets in source order and keeps duplicates", () => {
    const text = "[a](/types/A.md) [b](/types/B.md) [a again](/types/A.md)";

    expect(internalLinkTargets(text)).toEqual([
      "/types/A.md",
      "/types/B.md",
      "/types/A.md",
    ]);
  });
});

describe("resolveBundleLink", () => {
  it("resolves an absolute target against the bundle root", () => {
    expect(resolveBundleLink("types/objects/Product.md", "/types/scalars/ID.md")).toBe(
      "types/scalars/ID.md",
    );
  });

  it("resolves an absolute target the same way from any depth", () => {
    expect(resolveBundleLink("index.md", "/types/scalars/ID.md")).toBe("types/scalars/ID.md");
  });

  it("resolves a sibling relative target", () => {
    expect(resolveBundleLink("types/objects/Product.md", "Money.md")).toBe(
      "types/objects/Money.md",
    );
  });

  it("resolves an ascending relative target", () => {
    expect(resolveBundleLink("types/objects/Product.md", "../scalars/ID.md")).toBe(
      "types/scalars/ID.md",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/support/bundle-links.test.ts`

Expected: FAIL — `Failed to resolve import "./bundle-links.js"`, because the module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `test/support/bundle-links.ts`:

```ts
import { posix } from "node:path";

const LINK = /\]\(([^)]+)\)/g;

/** True for a link target that points outside the bundle, or nowhere. */
function isExternal(target: string): boolean {
  return /^[a-z]+:/.test(target) || target.startsWith("#");
}

/**
 * Every bundle-internal Markdown link target in `text`, in source order.
 * External URLs and pure fragments are excluded: they come from schema
 * documentation strings, which GOAL-6.3 preserves verbatim, and are none of
 * the emitter's business.
 */
export function internalLinkTargets(text: string): string[] {
  const targets: string[] = [];
  for (const match of text.matchAll(LINK)) {
    const target = match[1];
    if (target !== undefined && !isExternal(target)) {
      targets.push(target);
    }
  }
  return targets;
}

/**
 * The bundle-relative path a link target names, with no leading slash, so the
 * result is a key into the bundle's file map. A `/`-prefixed target is OKF
 * §6.1's absolute bundle-relative form and resolves against the bundle root;
 * anything else resolves against the linking file's directory.
 */
export function resolveBundleLink(fromPath: string, target: string): string {
  if (target.startsWith("/")) {
    return posix.normalize(target.slice(1));
  }
  return posix.normalize(posix.join(posix.dirname(fromPath), target));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/support/bundle-links.test.ts`

Expected: PASS — 7 tests.

- [ ] **Step 5: Rewire the conformance test onto the helpers**

In `src/conformance.test.ts`, replace the body of the existing test at line 115:

```ts
  it("resolves every internal link to a file in the bundle", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const broken: string[] = [];

    for (const [path, text] of files) {
      for (const target of internalLinkTargets(text)) {
        if (!files.has(resolveBundleLink(path, target))) {
          broken.push(`${path} -> ${target}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
```

Add the import at the top of the file:

```ts
import { internalLinkTargets, resolveBundleLink } from "../test/support/bundle-links.js";
```

Then **remove `posix` from the `node:path` import** on line 3 — it is now unused there and Biome will fail the build on it. The line becomes:

```ts
import { join } from "node:path";
```

- [ ] **Step 6: Verify the rewired check still catches a real dangling link**

Do not assume the check still works — prove it. Temporarily edit `src/emit/render/links.ts:22`, changing `relLink(fromPath, ref.path)` to `relLink(fromPath, "nope/missing.md")`, then run:

Run: `pnpm exec vitest run src/conformance.test.ts -t "resolves every internal link"`

Expected: FAIL, listing many `-> ../../nope/missing.md` entries.

Revert that edit, then re-run the same command.

Expected: PASS.

- [ ] **Step 7: Run the full suite and the gates**

Run: `pnpm test && pnpm run typecheck && pnpm run lint`

Expected: all PASS. Nothing about emitted output changed in this task, so `test/example-bundle.test.ts` still matches `okf/shop-api/` byte-for-byte.

- [ ] **Step 8: Commit**

```bash
git add test/support/bundle-links.ts test/support/bundle-links.test.ts src/conformance.test.ts
git commit -m "test: resolve bundle links through a shared, absolute-aware helper"
```

---

### Task 2: Absolute links in concept bodies

Replace `relLink` with `bundleLink`, drop `fromPath` from `typeLink`, and unthread `fromPath` from `body.ts`. TypeScript forces these together — there is no green intermediate state, which is why they are one task.

**Files:**
- Modify: `src/emit/render/links.ts:17-23`
- Modify: `src/emit/render/links.test.ts:27-50`
- Modify: `src/emit/render/body.ts` (imports, and twelve functions)
- Modify: `src/emit/render/body.test.ts`
- Regenerate: `okf/shop-api/**`

**Interfaces:**
- Consumes: nothing from Task 1 (that task only touched tests).
- Produces:
  - `bundleLink(toPath: string): string` — returns `/${toPath}`. Replaces `relLink`, which is deleted.
  - `typeLink(ref: TypeRef): string` — one parameter, not two. Returns `` [`<decorated>`](/<path>) ``.
  - `decoratedType(ref: TypeRef): string` — **unchanged**.

- [ ] **Step 1: Write the failing test**

In `src/emit/render/links.test.ts`, replace the entire `describe("relLink", …)` block (lines 27-41) and the `describe("typeLink", …)` block (lines 43-50) with:

```ts
describe("bundleLink", () => {
  it("prefixes a bundle path with a slash", () => {
    expect(bundleLink("types/objects/Language.md")).toBe("/types/objects/Language.md");
  });

  it("does not depend on where the link is written from", () => {
    expect(bundleLink("types/scalars/ID.md")).toBe("/types/scalars/ID.md");
  });

  it("handles a bundle-root file", () => {
    expect(bundleLink("index.md")).toBe("/index.md");
  });
});

describe("typeLink", () => {
  it("wraps the decorated type in a code-formatted markdown link", () => {
    const t = ref("Language", "types/objects/Language.md", ["nonNull", "list", "nonNull"]);

    expect(typeLink(t)).toBe("[`[Language!]!`](/types/objects/Language.md)");
  });
});
```

Update the import on line 3 to:

```ts
import { bundleLink, decoratedType, typeLink } from "./links.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/emit/render/links.test.ts`

Expected: FAIL — `bundleLink` is not exported from `./links.js`, and `typeLink(t)` is called with one argument where two are declared.

- [ ] **Step 3: Write minimal implementation**

Replace lines 17-23 of `src/emit/render/links.ts`:

```ts
/**
 * OKF §6.1's absolute bundle-relative form, which the spec recommends "because
 * it is stable when documents are moved within their subdirectory". Bundle
 * paths themselves stay slash-free — they are file-map keys — so this is the
 * single place the two spellings meet.
 */
export function bundleLink(toPath: string): string {
  return `/${toPath}`;
}

export function typeLink(ref: TypeRef): string {
  return `[\`${decoratedType(ref)}\`](${bundleLink(ref.path)})`;
}
```

Delete `relLink` entirely, and remove the now-unused `import { posix } from "node:path";` on line 1.

- [ ] **Step 4: Run the links test to verify it passes**

Run: `pnpm exec vitest run src/emit/render/links.test.ts`

Expected: PASS.

- [ ] **Step 5: Unthread `fromPath` from `body.ts`**

`pnpm run typecheck` is now red across `src/emit/render/body.ts`. Work through it:

Change the import on line 17 to:

```ts
import { bundleLink, typeLink } from "./links.js";
```

Then drop the `fromPath` parameter from every function that carried it only for link depth, and drop the corresponding argument at every call site. The affected functions, with their new signatures:

```ts
function appliedInline(applied: readonly AppliedDirective[], escapeArgs: boolean): string
function directivesLine(applied: readonly AppliedDirective[]): string[]
function implementsLine(interfaces: readonly TypeRef[]): string[]
function descriptionCell(
  description: string | null,
  deprecation: Deprecation | null,
  applied: readonly AppliedDirective[],
): string
function fieldsTable(fields: readonly FieldNode[]): string[]
function argumentsTable(args: readonly InputValueNode[]): string[]
function fieldArgumentsSection(fields: readonly FieldNode[]): string[]
function fieldsSchema(fields: readonly FieldNode[]): string[]
function inputFieldsSchema(fields: readonly InputValueNode[]): string[]
function argumentsSchema(args: readonly InputValueNode[]): string[]
```

Inside `appliedInline`, the link line becomes:

```ts
      return `[\`@${directive.name}\`](${bundleLink(directive.path)})${args}`;
```

Every `typeLink(fromPath, x)` becomes `typeLink(x)`, and every `typeLink(node.path, x)` becomes `typeLink(x)`. The eight exported `render*Body` functions keep their signatures; they simply stop passing `node.path` down. For example `renderObjectBody` becomes:

```ts
export function renderObjectBody(node: ObjectTypeNode): string {
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives),
    ...implementsLine(node.interfaces),
    ...fieldsSchema(node.fields),
    "",
  ].join("\n");
}
```

and `renderInterfaceBody`'s `implementedBy` clause becomes:

```ts
          `Implemented by ${node.implementedBy.map((ref) => typeLink(ref)).join(", ")}.`,
```

`renderEnumBody`'s `descriptionCell` call drops its trailing `node.path` argument. `renderOperationBody`'s returns line becomes `` `**Returns** ${typeLink(node.type)}` ``.

- [ ] **Step 6: Verify the type checker is clean**

Run: `pnpm run typecheck`

Expected: PASS, no output.

- [ ] **Step 7: Update the body test expectations**

Run: `pnpm exec vitest run src/emit/render/body.test.ts`

Expected: FAIL, with assertion diffs showing `/types/...` produced where `../types/...` was expected.

Update each failing assertion to the absolute form. **Update them, do not delete them** — the point of these tests is that the link is correct, and that is exactly what changed. Where a test's name mentions relative paths or depth, rename it to describe the absolute form.

Run: `pnpm exec vitest run src/emit/render/body.test.ts`

Expected: PASS.

- [ ] **Step 8: Regenerate the golden bundle**

Run: `pnpm exec vitest run test/example-bundle.test.ts`

Expected: FAIL on "matches okf/shop-api byte-for-byte" — the committed bundle still has relative links.

Run: `UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts`

Then inspect the diff before trusting it:

```bash
git diff --stat okf/shop-api
```

Expected: every concept file touched; **no** file added, deleted, or renamed. Spot-check one file:

```bash
git diff okf/shop-api/types/objects/Product.md
```

Expected: only link targets change (`../scalars/DateTime.md` → `/types/scalars/DateTime.md`, `Money.md` → `/types/objects/Money.md`). Frontmatter, prose, table structure and the human-authored "Ping #catalog" section are all untouched. `log.md` is unchanged at this point — the golden bundle is built from fixed timestamps in a temp dir, not reconciled.

- [ ] **Step 9: Run the full suite and the gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS, coverage above every threshold.

- [ ] **Step 10: Commit**

```bash
git add src/emit/render/links.ts src/emit/render/links.test.ts \
        src/emit/render/body.ts src/emit/render/body.test.ts okf/shop-api
git commit -m "feat: emit absolute bundle-relative links in concept bodies

OKF §6.1 recommends the absolute form because it survives a document
moving within the bundle. Replaces relLink with bundleLink and drops the
fromPath parameter, which existed only to compute link depth."
```

---

### Task 3: Absolute links in index files

`src/emit/bundle.ts` builds index entries with `posix.basename(concept.path)` and `` `${base}/index.md` ``. Those work only because an `index.md` sits beside what it lists — an invariant the flatten is about to disturb. Make them absolute.

**Files:**
- Modify: `src/emit/bundle.ts:112-136`
- Modify: `src/emit/bundle.test.ts:60-63, 68-69, 93-94, 150-151, 159-162`
- Regenerate: `okf/shop-api/**`

**Interfaces:**
- Consumes: `bundleLink(toPath: string): string` from `src/emit/render/links.js` (Task 2).
- Produces: no new exports. `IndexEntry.link` now always holds an absolute bundle link.

- [ ] **Step 1: Write the failing test**

In `src/emit/bundle.test.ts`, update the index-link assertions (lines 60-63) to:

```ts
    expect(assembled(bundle, "index.md")).toContain("* [types/](/types/index.md)");
    expect(assembled(bundle, "index.md")).toContain("* [queries/](/queries/index.md)");
    expect(assembled(bundle, "types/index.md")).toContain(
      "* [scalars/](/types/scalars/index.md)",
    );
    expect(assembled(bundle, "types/scalars/index.md")).toContain(
      "* [String](/types/scalars/String.md)",
    );
```

and the remaining four (lines 68-69, 93-94, 150-151, 159-162) to:

```ts
    expect(assembled(bundle, "queries/index.md")).toContain(
      "* [hello](/queries/hello.md) - Query operation.",
```

```ts
    expect(bundle.get("types/objects/index.md")?.generated).toContain(
      "* [Product](/types/objects/Product.md) - A product spanning lines.",
```

```ts
    expect(index?.generated).toContain(
      "* [LegacyOrder](/types/objects/LegacyOrder.md) - (removed)",
    );
```

```ts
    expect(bundle.get("types/inputs/index.md")?.generated).toContain(
      "* [OldInput](/types/inputs/OldInput.md) - (removed)",
    );
    expect(bundle.get("types/index.md")?.generated).toContain(
      "* [inputs/](/types/inputs/index.md)",
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/emit/bundle.test.ts`

Expected: FAIL — the rendered indexes still contain `[types/](types/index.md)` and `[String](String.md)`.

- [ ] **Step 3: Write minimal implementation**

In `src/emit/bundle.ts`, add to the imports:

```ts
import { bundleLink } from "./render/links.js";
```

Change the child-directory entry (lines 112-119) to:

```ts
    for (const child of childDirs.get(dir) ?? []) {
      const base = posix.basename(child);
      entries.push({
        label: `${base}/`,
        link: bundleLink(`${child}/index.md`),
        summary: DIRECTORY_LABELS[child] ?? base,
      });
    }
```

the concept entry (lines 121-128) to:

```ts
    for (const concept of filesByDir.get(dir) ?? []) {
      const summary = firstSentence(concept.description) ?? KIND_SUMMARY[concept.kind];
      entries.push({
        label: concept.name,
        link: bundleLink(concept.path),
        summary,
      });
    }
```

and the tombstone entry (lines 130-136) to:

```ts
    for (const tombstone of tombstonesByDir.get(dir) ?? []) {
      entries.push({
        label: tombstone.title,
        link: bundleLink(tombstone.path),
        summary: "(removed)",
      });
    }
```

`posix` stays imported — `posix.basename` and `posix.dirname` are still used for directory-tree construction.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/emit/bundle.test.ts`

Expected: PASS.

- [ ] **Step 5: Regenerate the golden bundle and inspect it**

Run: `UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts`

```bash
git diff okf/shop-api/index.md okf/shop-api/types/index.md okf/shop-api/types/scalars/index.md
```

Expected: only index files changed this time, only link targets within them, and each target is now the full path from the bundle root rather than a basename.

- [ ] **Step 6: Run the full suite and the gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/emit/bundle.ts src/emit/bundle.test.ts okf/shop-api
git commit -m "feat: emit absolute bundle-relative links in index files

Index links were basenames, correct only because an index.md sits beside
what it lists. Absolute links remove that dependency on co-location."
```

---

### Task 4: Absolute links in log.md

**Files:**
- Modify: `src/reconcile/log.ts:14-24`
- Modify: `src/reconcile/log.test.ts:28-37`

**Interfaces:**
- Consumes: `bundleLink(toPath: string): string` from `src/emit/render/links.js` (Task 2).
- Produces: no new exports.

`log.md` is append-only. Entries written before this change keep their relative links; those still resolve, because `log.md` sits at the bundle root and its old links were already root-relative minus the slash. Only new entries use the absolute form. Do not attempt to rewrite historical entries.

- [ ] **Step 1: Write the failing test**

In `src/reconcile/log.test.ts`, update the four link assertions (lines 28-37) to:

```ts
        "* [`Invoice`](/types/objects/Invoice.md)",
        "* [`invoices`](/queries/invoices.md)",
```

```ts
        "* [`User`](/types/objects/User.md)",
```

```ts
        "* [`LegacyOrder`](/types/objects/LegacyOrder.md)",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/reconcile/log.test.ts`

Expected: FAIL — the run block still renders `* [\`Invoice\`](types/objects/Invoice.md)`.

- [ ] **Step 3: Write minimal implementation**

In `src/reconcile/log.ts`, add the import:

```ts
import { bundleLink } from "../emit/render/links.js";
```

and change line 21 inside `group`:

```ts
    ...changes.map((change) => `* [\`${change.name}\`](${bundleLink(change.path)})`),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/reconcile/log.test.ts`

Expected: PASS.

- [ ] **Step 5: Regenerate the golden bundle and inspect its log**

Run: `UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts`

```bash
git diff okf/shop-api/log.md
```

Expected: every entry's link gains a leading slash. The golden bundle is rebuilt from scratch on each run, so all four dated entries convert; that is correct for a fixture. A real bundle's history would keep its old entries unchanged — which is what Task 7's transition test pins.

- [ ] **Step 6: Run the full suite and the gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/reconcile/log.ts src/reconcile/log.test.ts okf/shop-api
git commit -m "feat: emit absolute bundle-relative links in log.md"
```

---

### Task 5: Pin that preserved prose is not an emitter link

A schema documentation string may legally contain a relative Markdown link. `GOAL-6.3` requires it be preserved verbatim, so the strict assertion added in Task 6 must not flag it. No current fixture exercises this — the only Markdown link in any description is `[links](https://example.test)`, which the external-link guard already skips. Add the missing case before writing the assertion that depends on it.

**Files:**
- Modify: `test/fixtures/kitchen-sink.graphql`
- Modify: `test/support/bundle-links.test.ts`

**Interfaces:**
- Consumes: `internalLinkTargets` from Task 1.
- Produces: `test/fixtures/kitchen-sink.graphql` now contains a description with a relative Markdown link.

`kitchen-sink.graphql` is used only by `test/equivalence.test.ts`, which compares SDL-derived against introspection-derived IR. It backs no committed bundle, so adding a description here changes no golden file. Descriptions round-trip through introspection, so the equivalence assertions still hold.

- [ ] **Step 1: Add the fixture case**

In `test/fixtures/kitchen-sink.graphql`, give the existing `Post.author` field a description containing a relative Markdown link. `type Post` is at line 33 and currently reads:

```graphql
type Post implements Node {
  id: ID!
  author: User!
}
```

Change it to:

```graphql
type Post implements Node {
  id: ID!
  "See the [ordering guide](../guides/ordering.md) for how this is sequenced."
  author: User!
}
```

**Add a description only — do not add a type or a field.** A new element would perturb the equivalence test's concept counts. `Post.author` is chosen deliberately: it is the one place this prose link lands, which lets Task 7 steer around it.

- [ ] **Step 2: Verify the equivalence suite still passes**

Run: `pnpm exec vitest run test/equivalence.test.ts`

Expected: PASS. If it fails on a concept count, you added a field instead of a description — revert and attach the description to an existing field.

- [ ] **Step 3: Write the failing test**

Add to `test/support/bundle-links.test.ts`, inside `describe("internalLinkTargets", …)`:

```ts
  it("cannot tell a preserved prose link from an emitted one", () => {
    const text = "See the [ordering guide](../guides/ordering.md).";

    expect(internalLinkTargets(text)).toEqual(["../guides/ordering.md"]);
  });
```

This documents the limitation deliberately: `internalLinkTargets` is a lexical scan and has no way to know who authored a link. That is precisely why the Task 6 assertion scopes itself to the generated region rather than the whole file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/support/bundle-links.test.ts`

Expected: PASS — this test describes existing behaviour, so it goes green immediately. It is a characterization test, not a red-green cycle; that is correct here, because the behaviour it pins is a constraint on Task 6 rather than new functionality.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test && pnpm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/kitchen-sink.graphql test/support/bundle-links.test.ts
git commit -m "test: cover a relative markdown link inside a schema description

GOAL-6.3 preserves description prose verbatim, so a relative link there is
not an emitter bug. Nothing exercised this before."
```

---

### Task 6: The no-relative-internal-links invariant

This is the guard rail that makes the coming flatten safe: it is what stops a link from silently reacquiring a dependency on file depth. It is scoped to the generated region, so `GOAL-6.3`-preserved prose below the seam and inside description cells is out of its reach.

**Files:**
- Modify: `test/support/bundle-links.ts`
- Modify: `test/support/bundle-links.test.ts`
- Modify: `src/conformance.test.ts`

**Interfaces:**
- Consumes: `internalLinkTargets`, `resolveBundleLink` (Task 1).
- Produces: `generatedRegionOf(text: string): string` — the text between `GENERATED_START` and `GENERATED_END`, or `""` when the markers are absent.

**Caveat the implementer must respect:** description cells inside generated tables can contain preserved prose links, so the generated region is not purely emitter-authored. The assertion therefore checks link *form*, and a preserved relative link inside a table cell would trip it. Today no fixture has one (Task 5's fixture link lives in `kitchen-sink.graphql`, which the conformance test does not read — it reads `examples/shop-api/v1.graphql`). If a future fixture puts a relative link in a shop-api description, this assertion is the thing that will complain, and the right fix then is to narrow the scan, not to weaken the rule. Record that in a comment on the test.

- [ ] **Step 1: Write the failing test**

Add to `test/support/bundle-links.test.ts`:

```ts
import { generatedRegionOf } from "./bundle-links.js";

describe("generatedRegionOf", () => {
  it("returns the text between the seam markers", () => {
    const text = [
      "---",
      "type: x",
      "---",
      "<!-- graphql-okf:generated:start -->",
      "body [`X`](/types/X.md)",
      "<!-- graphql-okf:generated:end -->",
      "human [notes](../notes.md)",
    ].join("\n");

    expect(generatedRegionOf(text)).toContain("[`X`](/types/X.md)");
    expect(generatedRegionOf(text)).not.toContain("../notes.md");
  });

  it("returns empty for a file with no generated region", () => {
    expect(generatedRegionOf("# Update Log\n\nno markers here")).toBe("");
  });
});
```

Merge the new import into the existing one from `./bundle-links.js` rather than adding a second import statement — Biome will flag a duplicate.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/support/bundle-links.test.ts`

Expected: FAIL — `generatedRegionOf is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `test/support/bundle-links.ts`:

```ts
import { GENERATED_END, GENERATED_START } from "../../src/emit/render/seam.js";
```

```ts
/**
 * The machine-owned region of a bundle file. Human-authored content below the
 * end marker is out of scope for any assertion about what graphql-okf emits.
 */
export function generatedRegionOf(text: string): string {
  const start = text.indexOf(GENERATED_START);
  const end = text.indexOf(GENERATED_END);
  if (start === -1 || end === -1 || end < start) {
    return "";
  }
  return text.slice(start + GENERATED_START.length, end);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/support/bundle-links.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing conformance assertion**

Add to `src/conformance.test.ts`, immediately after the "resolves every internal link to a file in the bundle" test:

```ts
  /**
   * The guard rail for issue #22's flatten: an emitted link must not depend on
   * how deep its file sits. Scoped to the generated region because human
   * content below the seam is not ours. Note that a *description* preserved
   * under GOAL-6.3 can carry a relative link and render inside a generated
   * table cell; no current fixture does, and if one ever does the fix is to
   * narrow this scan, not to relax the rule.
   */
  it("emits no relative internal link", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const relative: string[] = [];

    for (const [path, text] of files) {
      for (const target of internalLinkTargets(generatedRegionOf(text))) {
        if (!target.startsWith("/")) {
          relative.push(`${path} -> ${target}`);
        }
      }
    }

    expect(relative).toEqual([]);
  });
```

Extend the existing helper import:

```ts
import {
  generatedRegionOf,
  internalLinkTargets,
  resolveBundleLink,
} from "../test/support/bundle-links.js";
```

- [ ] **Step 6: Run it to verify it passes, then verify it can fail**

Run: `pnpm exec vitest run src/conformance.test.ts -t "emits no relative internal link"`

Expected: PASS — Tasks 2-4 already converted every emission site.

Now prove the assertion has teeth. Temporarily change `bundleLink` in `src/emit/render/links.ts` to `return toPath;`, and re-run the same command.

Expected: FAIL, listing many `-> types/scalars/DateTime.md` entries.

Revert that edit and re-run.

Expected: PASS.

- [ ] **Step 7: Run the full suite and the gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add test/support/bundle-links.ts test/support/bundle-links.test.ts src/conformance.test.ts
git commit -m "test: assert no emitted internal link is relative

The guard rail for the coming type-tree flatten: this is what stops a link
from silently depending on its file's depth again."
```

---

### Task 7: The legacy-bundle transition

The one behaviour a reader would worry about, and nothing currently pins it: an existing bundle with relative links and human-authored content, re-run under the new emitter. Assert links convert, human regions survive byte-for-byte, concepts log as **Changed**, and nothing is tombstoned.

**Files:**
- Modify: `test/reconcile.test.ts`

**Interfaces:**
- Consumes: `syncOkfBundle` from `src/index.js`; `readTree as snapshot` (already imported in this file) and `writeTree` from `test/support/bundle-tree.js`.
- Produces: no new exports.

**Facts about this file, already verified — do not re-derive them:**
- It imports `readTree as snapshot` from `./support/bundle-tree.js`. `writeTree` is **not** yet imported; add it to that existing import statement.
- Its fixtures are `BASE` and `EVOLVED` (kitchen-sink), not the shop-api examples. Use `BASE`.
- Its timestamps are `T1 = "2026-07-01T10:00:00.000Z"` and `T2 = "2026-07-24T09:00:00.000Z"`. Reuse them.
- `syncOkfBundle` returns `SyncResult`, whose `added` / `changed` / `removed` are **`readonly string[]` of paths**, not objects. `result.changed.map((c) => c.path)` would not compile.
- Its `freshBundle(sdl)` helper creates the temp dir and syncs at `T1`. Reuse it.

- [ ] **Step 1: Read the existing file**

Read `test/reconcile.test.ts` in full before writing, and confirm the facts above still hold. They were verified when this plan was written; if any has drifted, follow the file, not the plan.

- [ ] **Step 2: Write the failing test**

Add `writeTree` to the existing `./support/bundle-tree.js` import:

```ts
import { readTree as snapshot, writeTree } from "./support/bundle-tree.js";
```

Then add:

```ts
describe("a bundle written before absolute links", () => {
  it("converts links, preserves human content, and logs the concepts as changed", async () => {
    const outDir = await freshBundle(BASE);
    const before = await snapshot(outDir);

    // Rewrite every emitted link back to a relative form, standing in for a
    // bundle written by an older release. The `../`-per-level spelling is not
    // byte-identical to what the old emitter produced (it emitted the shortest
    // relative path), but it resolves to the same file, which is all this test
    // needs: the point is that the new run replaces whatever relative form it
    // finds.
    const legacy = new Map<string, string>();
    for (const [path, text] of before) {
      const prefix = "../".repeat(path.split("/").length - 1);
      legacy.set(path, text.replaceAll("](/", `](${prefix}`));
    }

    // A human edit that must survive the conversion untouched, including its
    // own relative link, which is the human's to maintain, not ours.
    //
    // User, not Post: Task 5 gave Post.author a description carrying a
    // relative link, which GOAL-6.3 preserves verbatim into a generated table
    // cell. The "nothing relative in the generated region" assertion below
    // would rightly flag it, and this test is not the place to argue about it.
    const concept = "types/objects/User.md";
    expect(before.has(concept), `${concept} missing from the fixture bundle`).toBe(true);
    const human = "\n## Ownership\n\nOwned by Catalog. See [runbook](../../runbook.md).\n";
    legacy.set(concept, `${legacy.get(concept) ?? ""}${human}`);
    await writeTree(outDir, legacy);

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: BASE },
      outDir,
      now: T2,
    });
    const after = await snapshot(outDir);
    const text = after.get(concept) ?? "";

    // Links converted: nothing relative survives inside the generated region.
    const generated = text.slice(
      text.indexOf("<!-- graphql-okf:generated:start -->"),
      text.indexOf("<!-- graphql-okf:generated:end -->"),
    );
    expect(generated).toContain("](/types/");
    expect(generated).not.toContain("](../");

    // The human region survived verbatim, relative link and all.
    expect(text).toContain("See [runbook](../../runbook.md).");

    // Logged as changed, not added; nothing removed.
    expect(result.changed).toContain(concept);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);

    // No tombstone anywhere: no path moved.
    for (const [path, contents] of after) {
      expect(contents, `${path} was tombstoned`).not.toContain('graphql_okf_status: "removed"');
    }

    // Same file set, before and after.
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
  });
});
```

- [ ] **Step 3: Run test to verify it fails for the right reason**

Run: `pnpm exec vitest run test/reconcile.test.ts -t "a bundle written before absolute links"`

Expected: FAIL initially only if the test itself is wrong — the implementation already supports this. Run it and read the failure carefully:
- If it fails on the `.replaceAll` producing malformed relative links, fix the test's legacy-rewrite helper, not the implementation.
- If it fails on `result.changed` or on tombstones, that is a real defect in the change — stop and investigate before proceeding.

The expected end state is PASS. This is a characterization test for behaviour Tasks 2-4 produced; it is being written now because nothing else pins it.

- [ ] **Step 4: Confirm it can fail**

Temporarily change the assertion `expect(after.get(product)).not.toContain("](../scalars/DateTime.md)")` to `.toContain(...)` and re-run.

Expected: FAIL. Revert.

- [ ] **Step 5: Verify idempotence on top of it**

Add a second `it` in the same `describe`, asserting a third run is a no-op:

```ts
  it("is a no-op on the run after the conversion", async () => {
    const outDir = await freshBundle(BASE);
    const before = await snapshot(outDir);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect(result.added).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(await snapshot(outDir)).toEqual(before);
  });
```

This overlaps the file's existing "re-running against an unchanged schema" test. If that test already asserts exactly this against `BASE`, do not duplicate it — delete this step's test and note in the commit message that idempotence is already covered there.

Run: `pnpm exec vitest run test/reconcile.test.ts`

Expected: PASS. A failure here is a `GOAL-8.1` / `NG-6` determinism violation and must be fixed, not accommodated.

- [ ] **Step 6: Run the full suite and the gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add test/reconcile.test.ts
git commit -m "test: pin the relative-to-absolute link transition of an existing bundle

Links convert, human regions survive byte-for-byte, concepts log as
changed, nothing is tombstoned, and the next run is a no-op."
```

---

### Task 8: Regenerate the committed countries-api bundle

`okf/shop-api/` was regenerated in Tasks 2-4 under its golden test. `okf/countries-api/` has no test guarding it and is produced from a live endpoint, so it is regenerated here, deliberately and last.

**Files:**
- Regenerate: `okf/countries-api/**`

**Interfaces:**
- Consumes: the built CLI at `dist/cli.mjs`.
- Produces: no code.

- [ ] **Step 1: Build the CLI**

Run: `pnpm run build`

Expected: PASS, `dist/cli.mjs` exists.

- [ ] **Step 2: Reconcile the existing bundle against the live endpoint**

Do **not** delete the directory first — reconciliation in place is the whole point, and a fresh generation would discard the bundle's `log.md` history.

```bash
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
```

If the endpoint is unreachable, stop and say so in the PR rather than hand-editing the bundle. Hand-edited generated output is exactly what `M1/GOAL-4.5` exists to prevent.

- [ ] **Step 3: Inspect the diff before trusting it**

```bash
git status --short okf/countries-api
git diff --stat okf/countries-api
```

Expected: every concept and index file modified; **no** file added, deleted, or renamed. An added or deleted file means the upstream schema drifted since the bundle was last generated — that is a real, separate change. Keep it (reverting would leave the bundle stale) and call it out explicitly in the PR description.

```bash
git diff okf/countries-api/queries/country.md
```

Expected: `](../types/objects/Country.md)` → `](/types/objects/Country.md)`, `](../types/scalars/ID.md)` → `](/types/scalars/ID.md)`, and `generated.at` restamped to the run's timestamp. The restamp is correct: the file's content genuinely changed, and `generated.at` records the last meaningful change (`GOAL-5.2`).

- [ ] **Step 4: Confirm the new log entry**

```bash
head -30 okf/countries-api/log.md
```

Expected: a new dated entry with a **Changed** group listing all 25 concepts, each with a `/`-prefixed link. Older entries keep their original relative links — the log is append-only and must not be rewritten.

- [ ] **Step 5: Verify the re-run is a no-op**

```bash
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
git status --short okf/countries-api
```

Expected: no output from `git status` beyond what step 3 already showed — the second run writes nothing new and appends no log entry (`GOAL-8.1`, `GOAL-8.4`).

- [ ] **Step 6: Run the full suite and the gates**

Run: `pnpm run coverage && pnpm run typecheck && pnpm run lint && pnpm run knip`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add okf/countries-api
git commit -m "chore: regenerate countries-api bundle with absolute links"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/northstar-specs/GOAL-M1.md` (`GOAL-7.1` at line 171, `GOAL-7.2` at line 176)
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: no code.

This documents how an existing goal is implemented. It does not change what any goal requires — do not restate a MUST, and do not attribute a project decision to OKF (the mistake issue #22 was raised to correct).

- [ ] **Step 1: Record the link convention in GOAL-M1.md**

Under `GOAL-7.1`, after the existing sentence and examples, add:

```markdown
  - Links are emitted in OKF §6.1's **absolute bundle-relative** form —
    `/types/objects/Product.md` — rather than relative to the linking file.
    §6.1 recommends this form "because it is stable when documents are moved
    within their subdirectory". Recorded per issue #22: this is the emitted
    convention, not an additional requirement.
```

Under `GOAL-7.2`, after the existing text, add:

```markdown
  - A link target is resolved against the bundle root, not the linking file's
    directory. Bundle paths themselves remain slash-free; the leading slash is
    added at render time only.
```

- [ ] **Step 2: Note the GitHub-browsing consequence in README.md**

Read `README.md` first and find where the committed `okf/` bundles are introduced. Add, in that section's voice:

```markdown
Links inside these bundles are **bundle-root-absolute** (`/types/objects/Product.md`),
following OKF §6.1's recommendation. GitHub's file browser resolves a leading `/`
against the repository root, so cross-links in the samples above will not resolve
when clicked on github.com. Clone the repo, or point a tool at the bundle
directory, to follow them.
```

- [ ] **Step 3: Verify the docs are consistent with the code**

```bash
grep -rn "\.\./" okf/shop-api/types/objects/Product.md
```

Expected: matches only inside the human-authored region, if any — never inside the generated region. If a generated-region match appears, an emission site was missed; go back and find it.

- [ ] **Step 4: Run the gates**

Run: `pnpm run lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/northstar-specs/GOAL-M1.md README.md
git commit -m "docs: record the absolute bundle-relative link convention"
```

---

### Task 10: Final verification and pull request

- [ ] **Step 1: Run every gate CI runs**

Run: `pnpm install --frozen-lockfile && pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip`

Expected: all PASS. **Read the coverage numbers** — lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%. Do not claim the gate passed without having seen them.

- [ ] **Step 2: Confirm the invariant holds across the whole worktree**

```bash
grep -rn "](\.\./" okf/ | grep -v "log.md"
```

Expected: matches only in human-authored regions below a `graphql-okf:generated:end` marker. Anything inside a generated region is a missed emission site.

```bash
grep -rn "](\.\./" okf/*/log.md
```

Expected: matches only in log entries dated before this change. New entries must all be `/`-prefixed.

- [ ] **Step 3: Confirm no path changed**

```bash
git diff --name-status main -- okf/ | grep -v "^M" || echo "no adds, deletes or renames"
```

Expected: `no adds, deletes or renames` — unless Task 8 surfaced genuine upstream schema drift in `countries-api`, in which case those specific files are expected and must be named in the PR description.

- [ ] **Step 4: Open the pull request**

```bash
git push -u origin claude/issue-22-3988b4
```

```bash
gh pr create --title "Emit absolute bundle-relative links (#22, step 1 of 2)" --body "$(cat <<'EOF'
Adopts OKF §6.1's absolute bundle-relative link form (`/types/objects/Product.md`)
at all four link-emission sites: concept bodies, index files, and `log.md`.

This is the first of the two steps in #22. It lands on its own because it
de-risks the second: with absolute links, flattening `types/<kind>/<Name>.md`
to `types/<Name>.md` becomes a path-table change plus a set of file moves,
rather than a rewrite of every link in the bundle.

**No paths change here.** Every concept file stays where it is; only link
text changes.

- Spec: `docs/superpowers/specs/2026-08-01-absolute-bundle-links-design.md`
- Plan: `docs/superpowers/plans/2026-08-01-absolute-bundle-links.md`

## Notable

- `relLink` is replaced by `bundleLink`, and `typeLink` loses its `fromPath`
  parameter — it existed only to compute link depth, which is no longer an
  input. That unthreads through twelve functions in `src/emit/render/body.ts`.
- New conformance invariant: **no emitted internal link is relative**. This is
  the guard rail that keeps the coming flatten safe.
- No migration machinery. Links live inside the generated region, so an
  existing bundle converts on its next run; the concepts log as `Changed`,
  once, which is what `GOAL-8.4` asks for.
- **Known consequence:** GitHub's file browser resolves a leading `/` against
  the repo root, so cross-links in the committed `okf/` sample bundles will not
  resolve when clicked on github.com. Accepted deliberately — the consumer is
  an agent reading from disk with a known bundle root — and documented in the
  README.

Closes nothing on its own; #22 stays open for the flatten.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage.**

| Spec section | Task |
| --- | --- |
| The rule (`/` + bundle path; external and fragment links untouched) | 2, 3, 4; enforced by 6 |
| Where the slash lives (`links.ts` only; `naming.ts` unchanged) | 2 |
| Interface change (`bundleLink`, `typeLink(ref)`, `relLink` deleted) | 2 |
| Call site: `links.ts:22` | 2 |
| Call site: `body.ts:42` + `fromPath` unthreading | 2 |
| Call site: `bundle.ts:114`, `:126` (and tombstone entries at `:130`) | 3 |
| Call site: `log.ts:21` | 4 |
| `directory-index.ts` unchanged | 3 (explicitly untouched) |
| Migration of existing bundles (none needed; logs as Changed; no tombstones) | 7 |
| GitHub file-browsing consequence | 9 |
| Testing: unit (links, body, bundle, log) | 2, 3, 4 |
| Testing: conformance resolver accepts `/` | 1 |
| Testing: new no-relative-links assertion | 6 |
| Testing: legacy-bundle transition | 7 |
| Testing: idempotence | 7 (step 5), 8 (step 5) |
| Regenerating committed bundles | 2, 3, 4 (shop-api), 8 (countries-api) |
| Documentation | 9 |
| Risk: missed call site | 6, plus Task 10 step 2 |
| Risk: relative link in a preserved description | 5, and the caveat in Task 6 |
| Risk: determinism | 7 step 5, 8 step 5 |

No spec requirement is unassigned.

**Placeholder scan.** No TBDs. Every code step carries the actual code. Task 5 step 1 and Task 7 step 2 are the only steps that ask the implementer to adapt to an existing file's conventions rather than specifying literal text; both say explicitly to read the file first and match what is there, and both state what a wrong adaptation looks like.

**Type consistency.** `bundleLink(toPath: string): string` and `typeLink(ref: TypeRef): string` are defined in Task 2 and used with those exact signatures in Tasks 3 and 4. `internalLinkTargets(text: string): string[]` and `resolveBundleLink(fromPath: string, target: string): string` are defined in Task 1 and used in Tasks 5 and 6. `generatedRegionOf(text: string): string` is defined in Task 6 and used only there. `GENERATED_START` / `GENERATED_END` are imported from `src/emit/render/seam.js`, where they already exist.

**Known ordering constraints.**
- Task 1 must precede Task 2, or the conformance suite goes red the moment the first `/`-prefixed link is emitted.
- Tasks 2, 3 and 4 must each regenerate `okf/shop-api/` in their own commit, or `test/example-bundle.test.ts` goes red.
- Task 6 must follow Tasks 2-4, since its assertion cannot pass until every emission site is converted.
- Task 5 must precede Task 7. Task 5 puts a `GOAL-6.3`-preserved relative link into `Post.author`'s description in the kitchen-sink fixture; Task 7 runs against that same fixture and asserts nothing relative survives in a generated region. Task 7 therefore targets `types/objects/User.md` explicitly and steers around `Post.md`. An implementer who attaches Task 5's description to a different field will break Task 7 — the two are coupled through the fixture, which is why Task 5 names the field.

**Interaction the implementer must not "fix" silently.** The strict assertion in Task 6 checks link *form* over the generated region, and a description preserved under `GOAL-6.3` can legally put a relative link there. Task 6 runs against `examples/shop-api/v1.graphql`, which has no such link, so the two do not collide today. If they ever do, the resolution is to narrow the scan to emitter-authored link sites — not to relax the rule, and not to strip the preserved prose.
