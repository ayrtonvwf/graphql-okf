# Flatten the type directory tree — design

Second and final step of
[issue #22](https://github.com/ayrtonvwf/graphql-okf/issues/22), itself a
sub-issue of the token/cost umbrella
[#20](https://github.com/ayrtonvwf/graphql-okf/issues/20). Step 1 —
[PR #30](https://github.com/ayrtonvwf/graphql-okf/pull/30), spec
`2026-08-01-absolute-bundle-links-design.md` — adopted absolute bundle-relative
links precisely so that this step could be a path change rather than a rewrite
of every link in the bundle.

`GOAL-*` and `NG-*` refer to `docs/northstar-specs/GOAL-M1.md`. §-prefixed
numbers refer to the OKF v0.2 specification unless another document is named.

## Goal

Move every type concept from `types/<kind>/<Name>.md` to `types/<Name>.md`,
deleting the six kind directories and their index files, and fold the kind
distinction into `types/index.md` as headings.

Reaching a type drops from four reads to two:

```
before: index.md → types/index.md → types/objects/index.md → types/objects/Customer.md
after:  index.md → types/index.md → types/Customer.md
```

Six `index.md` files disappear outright. The kind distinction is not lost: it is
already carried by each concept's `type:` frontmatter (`GOAL-5.3` exists to
provide it) and is now also carried by a heading in `types/index.md`, so it
survives at one read instead of two.

`GOAL-4.3` — "group concepts sensibly for progressive disclosure (for example:
types under a `types/` area…)" — already permits this layout. No goal changes.

## Non-goals

- Index content beyond grouping. Signatures in indexes are
  [#21](https://github.com/ayrtonvwf/graphql-okf/issues/21).
- Built-in scalar and spec directive omission
  ([#23](https://github.com/ayrtonvwf/graphql-okf/issues/23)) — which would
  shrink `types/` further, but is a separate decision about content, not layout.
- Flattening anything else. `queries/`, `mutations/`, `subscriptions/` and
  `directives/` stay exactly as they are; they are already one level deep, and
  directive names and root operation field names occupy namespaces that can
  legally collide with type names (`directive @auth` and `type auth`;
  `Query.product` and `type Product`, which would also collide case-insensitively
  on macOS). Only `types/` is collision-free by construction.
- Any configurability of layout. One layout, no flag.

## Why flattening `types/` is safe

GraphQL puts all named types in a **single namespace**: `type User` and
`input User` cannot coexist, which is why the ecosystem writes `UserInput`.
Verified against `graphql-js` — `buildSchema` rejects a document defining both
with *There can be only one type named "User"*. Within `types/`, every name is
unique by construction.

What is *not* guaranteed is uniqueness under case folding: `type User` and
`input user` are both legal and previously landed in different directories.
Section 2 covers what happens to them now.

## 1. Paths

`src/model/naming.ts` remains the single source of truth (`GOAL-4.5`). The only
edit is to `DIRECTORY_BY_KIND`: its six type rows collapse to `types`.

```ts
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

`resolvePaths` is unchanged. This is worth dwelling on: it buckets elements by
directory and disambiguates within each bucket, so folding six buckets into one
means its existing rules now apply *across* kinds, for free.

- **Case-fold collision.** `type User` + `input user` now share a bucket, so both
  receive the existing `-<shortHash>` suffix: `types/User-<hash>.md` and
  `types/user-<hash>.md`. `GOAL-4.4` holds with no new code.
- **Reserved basename.** A type named `Index` (or `Log`) now resolves to
  `types/Index-<hash>.md`. Previously the reserved-name rule could only fire
  inside a kind directory, where a type named `Index` was equally reserved but
  the collision was with a different index file.
- **`NAME_HASH_COLLISION`** stays the defensive backstop it is today.

Neither the case-fold nor the reserved-name path is exercised by any current
fixture. Both get direct tests (§6).

The ordering of `DIRECTORY_BY_KIND`'s keys becomes load-bearing for a second
reason — it is the group order in `types/index.md` — so the type annotation
stays `Record<ConceptKind, string>` and the key order is documented as
significant.

## 2. `types/index.md`

### Shape

```markdown
# Types

<!-- graphql-okf:generated:start -->
## Object types

* [Address](/types/Address.md) - A postal address.
* [Customer](/types/Customer.md) - A person who can place orders.

## Interface types

* [Node](/types/Node.md) - An object with a globally unique ID.

## Scalar types

* [DateTime](/types/DateTime.md) - An ISO-8601 timestamp.

## Removed

* [GiftCard](/types/GiftCard.md) - (removed)
<!-- graphql-okf:generated:end -->
```

Headings live **inside** the generated region — they are content, regenerated
wholesale each run. OKF §8's own example groups entries under multiple headings,
so this is the spec's intended index shape; §11 imposes no structure on index
files beyond §8.

### The grouping rule

> An index groups its concept entries under one `##` heading per kind when the
> directory holds concepts of **more than one kind**, and renders a flat list
> when it does not.

Stated as a function of content rather than as a special case for `types/`.
`queries/`, `mutations/`, `subscriptions/` and `directives/` each hold exactly
one kind and therefore emit byte-identical output to today — no diff, no churn,
nothing to review in four of the five top-level directories.

Ordering:

- Child-directory entries (only the bundle root has any) render first, with no
  heading, exactly as today.
- Kind sections follow in `DIRECTORY_BY_KIND` key order: objects, interfaces,
  unions, enums, inputs, scalars. Definitional weight, and it needs no new table.
- A `## Removed` section is last, holding every tombstone. A tombstone is not in
  the IR, so its kind is unknown — `TombstoneEntry` carries only `path` and
  `title`. Recovering it would mean parsing `type:` out of the tombstone's
  frontmatter inside `buildBundle` and reverse-mapping `TYPE_LABEL_BY_KIND` with
  a fallback for labels it cannot recognise. Not worth it for rows whose summary
  is literally `(removed)`.
- Entries within every section stay sorted by label, as today.

### Renderer interface

`src/emit/render/directory-index.ts` takes sections instead of a flat list:

```ts
export interface IndexSection {
  /** Omitted for the leading, un-headed group. */
  readonly heading?: string;
  readonly entries: readonly IndexEntry[];
}

export function renderDirectoryIndex(
  title: string,
  sections: readonly IndexSection[],
  frontmatter?: readonly string[],
): FileParts;
```

`IndexEntry` is unchanged. A single headingless section reproduces today's output
byte for byte, which is what keeps the four unaffected directories quiet.

`src/emit/bundle.ts` decides the sections. `DIRECTORY_LABELS` loses its six
`types/<kind>` rows and gains a `Record<ConceptKind, string>` carrying the same
strings ("Object types", "Interface types", …) re-keyed by kind — net zero new
tables, since those strings exist today only to title the directories being
deleted.

## 3. The relayout pre-pass

New module `src/reconcile/relayout.ts`, sitting beside `migrate.ts` and running
**before** it in `reconcile()`, so the frontmatter migration and everything
downstream see final paths:

```
existing files → relayoutBundle → migrateBundle → ownedFiles → reconcile
```

It rewrites the in-memory file map and reports what it did:

```ts
export interface RelayoutResult {
  readonly files: ReadonlyMap<string, string>;
  /** Old path → new path, sorted by old path. */
  readonly moves: readonly { readonly from: string; readonly to: string }[];
  /** Legacy kind indexes rewritten to a redirect, sorted. */
  readonly redirects: readonly { readonly path: string; readonly contents: string }[];
  /** Paths to remove from disk, sorted. */
  readonly deletes: readonly string[];
}
```

`LEGACY_TYPE_DIRS` is the fixed set `types/objects`, `types/interfaces`,
`types/unions`, `types/enums`, `types/inputs`, `types/scalars`. Rules, applied
to each entry of the existing map:

**Owned concept file** (`isOwnedFile`, i.e. carries the generated markers) at
`types/<kind>/<Base>.md` where `<kind>` ∈ `LEGACY_TYPE_DIRS` and `<Base>` is not
`index` → re-keyed to `types/<Base>.md`, whole file text, human region included.
The old key is dropped from the map and added to `deletes`.

- If `types/<Base>.md` already exists in the map and its text is **byte-identical**
  to the legacy file, the legacy file is deleted and no move is recorded. This is
  exactly the interrupted-run recovery path (§4).
- If it exists and **differs**, throw `GraphqlOkfError("LAYOUT_MOVE_CONFLICT", …)`
  naming both paths and telling the user to delete one. Never a silent loss.

**Tombstoned concept files** are owned files and move under the same rule — the
pre-pass keys off the path, not the IR, so `types/objects/` genuinely empties.

**Unowned stray** in a legacy directory (a human's own file, no markers) → left
exactly where it is, untouched. graphql-okf deletes only files it owns
(`GOAL-8.3`). The directory survives to hold it, which is correct.

**Legacy `types/<kind>/index.md`** → its human region decides:

- **Empty** — after removing `HUMAN_HINT` only whitespace remains, or the file
  has no markers at all (a v0.1-era index) — the file is deleted.
- **Non-empty** — the file is kept and its generated region is replaced by a
  single redirect row:

  ```markdown
  * [Types](/types/index.md) - This directory was flattened into the parent index.
  ```

  The human's text below the end marker is untouched. No link dangles, and the
  human who wrote the note can see what happened to it. This rewrite is emitted
  **only if the current generated region differs from the redirect**; otherwise
  a second run would rewrite it forever and break `GOAL-8.1`.

The pre-pass is permanent code, like the v0.1→v0.2 pass beside it. It is a
six-name table and one scan of a map already in memory. There is no marker in a
bundle recording its layout version, so there is nothing to gate on — and a
bundle generated a year ago is exactly the one that needs it.

## 4. Deletion

graphql-okf has never deleted a file. `FileAction` becomes a discriminated union
so that a delete cannot carry unused `contents`:

```ts
type FileAction =
  | { readonly kind: "delete"; readonly path: string }
  | {
      readonly kind: "create" | "update" | "tombstone" | "index" | "migrate";
      readonly path: string;
      readonly contents: string;
    };
```

`applyPlan` performs **all writes first, then all deletes**. A crash between the
two leaves a duplicate — recoverable, because the next run's byte-identical rule
(§3) collapses it — rather than a hole, which nothing could recover. After each
delete it attempts `rmdir` on the containing directory and swallows `ENOTEMPTY`
and `ENOENT`; without this the flatten leaves six empty directories behind, which
reads as an incomplete result. A legacy directory still holding a stray or a
redirect index correctly fails `rmdir` with `ENOTEMPTY` and survives.

### Threading moves into actions

One subtlety that is easy to miss: a relayouted concept whose content is
otherwise unchanged is `sameContent` at its **new** path, so the main reconcile
loop classifies it as unchanged and emits no action — and the file never reaches
disk at its new location. The move exists only in memory.

Moves therefore have to be threaded into actions explicitly. `reconcile()` already
has the machinery: the write-back loop that exists for the frontmatter migration,
which skips paths reconcile has already acted on. Relayout joins it:

- For each move whose `to` path has no action yet → `{ kind: "migrate", path: to,
  contents: files.get(to) }`.
- Each redirect → `{ kind: "index", path, contents }`.
- Each delete → `{ kind: "delete", path }`.

In practice most moved concepts *do* also change — their links to other types
moved — so they appear as `update` anyway. The write-back covers the ones that
do not: built-in scalars, `@oneOf`, and any type that links to nothing. Those are
precisely the files that would silently fail to move, so this path needs a test
of its own, not incidental coverage.

## 5. Reporting

`BundlePlan.migrated` is currently one `readonly string[]` doing double duty as
the log count and the write-back list. It splits:

```ts
readonly migrated: {
  readonly frontmatter: readonly string[];
  readonly relocated: readonly string[];
};
```

`SyncResult` — public API, `src/index.ts` — keeps `migrated` meaning the
frontmatter conversion, so no consumer breaks, and gains a sibling
`relocated: readonly string[]` holding the new paths of moved concepts.

`hasLoggableChanges` sums both. `migrationGroup` emits up to two bullets:

```markdown
**Migrated**

* OKF bundle format 0.1 → 0.2 (`timestamp` → `generated`) across 28 concepts.
* Bundle layout: `types/<kind>/` flattened into `types/` across 28 concepts.
```

Counts, not lists, for the same reason the frontmatter pass settled on counts: a
mechanical whole-bundle event that names every concept buries the run's real
changes under N identical-shaped lines. Concepts whose content genuinely changed
still appear under **Changed** as normal, and git carries the detail.

Nothing is tombstoned by the flatten. A moved element is still in the schema; the
`Removed` group is for elements that left it.

## 6. Testing

Test-first throughout, per `.claude/skills/test-driven-development`.

**Unit.**

- `naming.test.ts` — a type and an input differing only by case both receive hash
  suffixes; a type named `Index` receives one; every kind resolves under `types/`;
  operations and directives are unmoved.
- `directory-index.test.ts` — a single headingless section reproduces today's
  output byte for byte; multiple sections emit `##` headings in the order given;
  an empty section emits nothing (not a bare heading).
- `bundle.test.ts` — `types/index.md` groups by kind in `DIRECTORY_BY_KIND` order
  with `## Removed` last; `queries/index.md` stays flat; the root index still
  lists child directories with no heading.
- `relayout.test.ts` — each rule in §3 in isolation, including: a stray is left
  alone; a byte-identical target collapses silently; a differing target throws
  `LAYOUT_MOVE_CONFLICT`; a kind index with human text becomes a redirect and a
  second pass over the result is a no-op.
- `log.test.ts` — both migration bullets, either alone, and neither.

**Conformance (`src/conformance.test.ts`).** Add one assertion: **no concept file
in a freshly generated bundle lives under `types/<kind>/`**. This is the guard
that keeps the collapsed directory from silently regrowing — the counterpart to
step 1's "no relative internal links". The existing no-dangling-link check
(`GOAL-7.2`) and the no-relative-link check are unchanged and must still pass;
verify the dangling check by temporarily breaking a path rather than assuming.

**Integration (`test/reconcile.test.ts`).** The load-bearing test. Hand-build a
legacy-layout bundle — kind directories, absolute links, v0.2 frontmatter — with
a human-authored region in **both** a concept file and a kind index, plus one
tombstone and one type that links to nothing. Run, then assert:

- every concept sits at `types/<Name>.md`;
- both human regions survive byte for byte;
- the linkless type moved (the write-back path of §4);
- the tombstone moved and appears under `## Removed` in `types/index.md`;
- the empty kind directories are gone from disk;
- `log.md` gained exactly one `Migrated` layout bullet;
- **a second run produces zero actions and appends nothing** (`GOAL-8.1`, `NG-6`).

A separate case covers the stray file: a human's `types/objects/notes.md` is
untouched and its directory survives.

**Coverage.** The enforced gate (lines ≥ 90%, functions ≥ 90%, branches ≥ 85%,
statements ≥ 90%) applies as always.

## 7. Test-surface churn

Worth stating plainly, because it is the bulk of the diff and none of it is
interesting: `src/emit/render/body.test.ts` alone hardcodes 72 kind-directory
paths, and `src/model/project.test.ts`, `src/emit/bundle.test.ts`,
`src/reconcile/plan.test.ts`, `test/example-bundle.test.ts` and the
`test/support/` helpers add roughly 150 more. All mechanical path updates. The
implementation plan sequences them so that a reviewer can separate them from the
behavioural changes.

## 8. Regenerating the committed bundles

The two committed bundles are maintained differently, and the flatten reaches
them by different routes.

**`okf/shop-api/` is a golden fixture**, rebuilt from scratch by
`test/example-bundle.test.ts`: `buildExampleBundle()` replays v1 → v2 → v3 with
pinned timestamps, and `UPDATE_EXAMPLE=1` writes the result over the committed
tree. It therefore **cannot** exercise the relayout pre-pass — the emitter it
replays no longer knows how to produce a legacy layout. It is regenerated flat
from its first historical run onward, `log.md` included, and its four dated
entries link to the new paths. That is self-consistent and is the only option a
from-scratch golden allows.

**`okf/countries-api/` is reconciled in place** against a live endpoint, with no
test guarding it. It is the one committed bundle that actually runs the
migration, and it is where the `Migrated` layout log entry appears for real. It
is regenerated last, after the pre-pass is wired in.

Expect, for `shop-api`: 27 type concepts at new paths, 6 kind indexes gone. For
`countries-api`: 14 type concepts moved and 3 kind indexes deleted — it has no
interfaces, unions or enums, so only three kind directories exist, which makes it
the fixture proving the pre-pass does not assume all six are present. Both get a
rewritten `types/index.md` and link-text changes in every file referencing a type.

The consequence worth stating: **the end-to-end migration is proven by the
integration test in §6, not by either committed bundle.** `shop-api` cannot reach
it and `countries-api` will only pass through it once, in this PR, never again.

## 9. Documentation

- `README.md:245` cites `/types/objects/Product.md` as the link form; update to
  `/types/Product.md`.
- `docs/okf-vs-mcp-for-graphql.md:247` cites
  `../graphql-api/types/objects/Order.md`; update the path (the sentence's point
  about dangling links is unaffected).
- `docs/northstar-specs/GOAL-M1.md` — no requirement changes. `GOAL-4.3` already
  permits this layout and `GOAL-7.4`'s attribution was corrected in 22c85a3. Add
  a sentence under `GOAL-4.3` recording that type concepts live directly under
  `types/`, with the kind carried by `type:` frontmatter and by a heading in
  `types/index.md`, per issue #22.

## 10. Risks

- **A move that silently does not happen.** The `sameContent` trap in §4. Covered
  by the linkless-type assertion in the integration test, which is why that
  fixture includes a type linking to nothing.
- **Churn on the second run.** The redirect rewrite is the one conditional write
  in the pre-pass; an unconditional version would violate `GOAL-8.1` on every
  subsequent run of every migrated bundle. Pinned by the no-op-second-run
  assertion.
- **Destroying human content.** Three guards: strays are never touched, a
  differing move target throws rather than overwrites, and a kind index with
  human text is redirected rather than deleted.
- **Case-fold collisions now reachable across kinds.** Handled by existing code,
  but previously unreachable and therefore untested. Direct tests in §6.
- **Determinism.** Nothing here introduces ordering or wall-clock dependence.
  `moves`, `redirects` and `deletes` are all sorted before use, and section order
  comes from a static table (`GOAL-8.1`, `NG-6`).
