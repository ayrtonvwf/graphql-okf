# Design — Emitter (M1 sub-project B)

**Date:** 2026-07-23
**Status:** Approved
**Implements:** `GOAL-M1` §5 (OKF conformance), §6 (concept body content), §7 (cross-linking)
**Depends on:** sub-project A (concept model + naming scheme) — consumes `SchemaIr`
**Depended on by:** sub-project C (reconciler), sub-project D (delivery surface)

---

## 1. Scope

Sub-project B turns the in-memory `SchemaIr` produced by sub-project A into an OKF
bundle **on disk**: one Markdown file per concept with YAML frontmatter and a prose
body, a fully cross-linked graph of Markdown links, and an `index.md` for every
directory including the root.

B is **create-only**. It writes a complete bundle into a fresh output directory.
It does **not** reconcile: no idempotent-no-op re-run handling, no add/change
detection, no tombstones, no human-edit merge-back, no `log.md`. Those are
sub-project C. B does, however, lay down the machine-vs-human seam (§4.3) that C
will rely on, so C's job becomes pure preservation rather than a bundle-wide
rewrite.

B ships one convenience: a **minimal CLI** (`graphql-okf <source> --out <dir>`) so
the emitter is runnable end-to-end today. Full flag design — headers, config file,
archive output, overwrite/force semantics — is sub-project D.

### 1.1 Decomposition recap

| # | Sub-project | Covers | Status |
|---|---|---|---|
| A | Concept model + naming scheme | §3, §4 | Done. Produces `SchemaIr`. |
| **B** | **Emitter** | **§5, §6, §7** | **This document.** |
| C | Reconciler | §8 | Later. |
| D | Delivery surface | §9 | Later. |

The A spec (`2026-07-18-concept-model-and-naming-scheme-design.md`) is the
authority on the IR and the naming scheme; B consumes both and re-derives neither.

---

## 2. Architecture

The governing principle matches sub-project A's pure-core / fs-at-the-edge shape:

> **Compute the whole bundle as an in-memory `Map<path, fileContents>` — a pure,
> deterministic function of `(SchemaIr, timestamp)` — then write that map to disk
> in one thin filesystem step.**

Everything interesting is therefore testable with no filesystem and no on-disk
snapshots.

```
src/emit/
  render/links.ts        TypeRef + current concept path -> relative Markdown link,
                         and TypeRef -> decorated type string. Pure.
  render/frontmatter.ts  ConceptNode + resource + timestamp -> YAML frontmatter. Pure.
  render/body.ts         ConceptNode -> generated Markdown body (per-kind). Pure.
  render/concept.ts      assemble one file: frontmatter + generated-region markers
                         + human area. Pure.
  render/index.ts        a directory's entries -> its index.md text. Pure.
  bundle.ts              buildBundle(ir, timestamp) -> ReadonlyMap<path,string>. Pure. No fs.
  write.ts               writeBundle(map, outDir). The ONLY fs-touching module.

src/index.ts   createOkfBundle({ source, outDir, now? })
                 = readSchema(source) -> buildBundle(ir, now ?? nowIso()) -> writeBundle(map, outDir)
src/cli.ts     minimal positional CLI: graphql-okf <sdl-or-url> --out <dir>
```

### 2.1 The timestamp is injected, not sampled inside the core

`timestamp` (§5.2) is the **only** non-deterministic byte in the output (`NG-6`).
The pure core takes it as a parameter — `buildBundle(ir, timestamp)` is a total,
deterministic function. `createOkfBundle` supplies `now ?? new Date().toISOString()`
at the single composition point. Tests pass a fixed ISO value and byte-compare the
entire map. No module below `createOkfBundle` reads the clock.

`index.md` files carry **no** timestamp (an index is not a concept), so they are a
pure function of the schema alone and fully deterministic.

### 2.2 `write.ts` is the only module that touches the filesystem

The pure map is produced in full **before** any write begins, so a render error
cannot leave a half-written tree. This is a down payment on `GOAL-8.5` (safe to
interrupt) without B claiming to own crash-safe reconciliation.

Create-only behavior: if `outDir` exists and is non-empty, `writeBundle` refuses
with a clear error. A `--force`/overwrite mode is a small later addition; full
re-run intelligence is C.

### 2.3 B consumes `SchemaIr` only

The emitter never sees a `GraphQLSchema`, exactly as the A design's §2.4 boundary
requires. B is tested against hand-written IR literals and the shared kitchen-sink
fixture, never against graphql-js internals.

### 2.4 Paths are never constructed, only related

B links exclusively through `TypeRef.path` (and each concept's own `path`), both
already resolved by `naming.ts`. The only path arithmetic B performs is computing
the **relative** form between two given paths (§5.1). B never turns a type *name*
into a path — that would re-derive the naming scheme and violate `GOAL-4.5`.

---

## 3. Output: OKF conformance (§5)

### 3.1 File zones

Every **concept** file has three zones, in order:

1. **Frontmatter** — YAML, machine-owned, regenerated every run.
2. **Generated body region** — delimited by stable HTML-comment markers,
   machine-owned.
3. **Human area** — everything after the end marker, created empty (a single hint
   comment) and never touched again by B. This is the seam C preserves (§8.3).

```markdown
---
type: object
title: Country
description: An ISO country with its languages and continent.
resource: https://countries.trevorblades.com/graphql
tags: [graphql, object]
timestamp: 2026-07-23T12:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Country

An ISO country with its languages and continent.

## Fields

- **`code`** — [`ID!`](../scalars/ID.md)
- **`continent`** — [`Continent!`](Continent.md)
- **`languages`** — [`[Language!]!`](../objects/Language.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
```

### 3.2 Frontmatter fields

| Field | Value | Notes |
|---|---|---|
| `type` | the IR `ConceptKind` string | `object`, `interface`, `union`, `enum`, `input`, `scalar`, `query`, `mutation`, `subscription`, `directive`. The one required OKF field (§5.1); already discriminates every kind (§5.3). |
| `title` | exact GraphQL name | For operations, the field name (e.g. `countries`). Matches the body H1. |
| `description` | schema doc-string, verbatim | Omitted when the element has no description (§6.2). |
| `resource` | `ir.resource` | Endpoint URL or SDL origin; identical on every file (§5.2). |
| `tags` | `[graphql, <kind>]` | Lets a consumer filter broadly (`graphql`) or by kind. |
| `timestamp` | injected ISO-8601 | §5.2. The sole non-deterministic byte (§2.1). |

Frontmatter is emitted as valid YAML and round-trips (§5.5): a plain string
serializer with correct quoting/escaping of description text; no custom YAML dialect.

### 3.3 Reserved filenames (§5.4)

`index.md` is used only as the OKF directory index (§4 below). `log.md` is **not
written by B** — it is reserved for the reconciler. The naming scheme (sub-project A)
already guarantees no concept maps to an `index` or `log` basename.

---

## 4. Output: `index.md` and the directory tree (§7.4)

Every directory, **including the bundle root**, gets an `index.md`, generated as a
pure function of the schema (no timestamp, no human region, no `type` frontmatter —
an index is not a concept and is fully machine-owned).

- **Leaf directory** (e.g. `types/objects/`): H1 naming the group, then a list of
  its concepts, each `- [Name](Name.md) — <short description>`, where the short
  description is the first line of the concept's doc-string, or a structural
  fallback (e.g. `Object type.`) when there is none.
- **Grouping directory** (`types/`): lists its subdirectories, each
  `- [objects/](objects/index.md) — Object types`.
- **Root** (`index.md`): lists the top-level areas present for this schema
  (`types/`, `queries/`, `mutations/`, `subscriptions/`, `directives/`), omitting
  any that are empty.

Directories that would be empty for a given schema (e.g. no subscriptions) are not
created and are absent from their parent index.

---

## 5. Output: body content and cross-linking (§6, §7)

### 5.1 Type references and links

Two pure helpers in `render/links.ts`:

- **Decorated type string** — from `TypeRef.wrappers` (outermost first) wrapped
  around `TypeRef.name`: `nonNull` -> `!`, `list` -> `[...]`. Examples:
  `Language` + `[nonNull,list,nonNull]` -> `[Language!]!`; `Int` + `[list,list]` ->
  `[[Int]]`.
- **`relLink(fromPath, toPath)`** — POSIX-relative path from `dirname(fromPath)` to
  `toPath`. Both inputs are already-resolved paths (§2.4). Examples:
  `types/objects/Country.md` -> `types/scalars/ID.md` = `../scalars/ID.md`;
  `queries/languages.md` -> `types/objects/Language.md` = `../types/objects/Language.md`.

A rendered reference is the **decorated string as the link text**, linking to the
named type's file: `` [`[Language!]!`](../objects/Language.md) ``.

Three cases need no special handling in B because A already resolved them into
`TypeRef.path`: built-in scalars link to their real emitted files (§4.3, §7.3
permission declined for uniformity); a reference to a root operation type links to
that operation directory's `index.md` (§4.4). B only makes those paths relative.

### 5.2 Per-kind generated body

Every body opens with `# <name>` and the verbatim description (when present), then:

| Kind | Sections |
|---|---|
| object | `Implements:` (linked interfaces, when any) · `## Fields` |
| interface | as object, plus `Implemented by:` (linked `implementedBy`) |
| union | `## Members` — each member type linked |
| enum | `## Values` — each value, its description, deprecation |
| input | `## Fields` — each `name: Type = default`, linked, description/deprecation |
| scalar | description · `Specified by:` URL when present · built-in note when `isBuiltIn` |
| query / mutation / subscription | signature · `## Arguments` (linked, defaults) · `Returns:` linked type |
| directive | `Locations:` · `## Arguments` (linked) · repeatable note |

Field and argument rendering:

- A field renders as `**\`name(arg: Type, …): ReturnType\`**` with every type
  linked and each argument's printed default shown as `= <default>` when present.
- Deprecation is surfaced wherever it occurs — on a field, enum value, argument, or
  operation — as an inline `(deprecated: <reason>)`, or `(deprecated)` when the
  reason is null. It is never omitted when present (§6.1).

### 5.3 Faithfulness and determinism guards

- **No fabrication (§6.2):** when a description is null the document states only the
  structural fact — no filler prose.
- **Verbatim doc-strings (§6.3):** descriptions are copied, never paraphrased.
- **Applied custom directives** (present on the SDL path only, per A §5.3) render as
  a `Directives:` line when non-empty, so introspection-sourced and SDL-sourced
  bodies differ **only** where §5.3 mandates.
- `@deprecated` and `@specifiedBy` are surfaced from their first-class IR fields
  (`deprecation`, `specifiedByUrl`) and never doubled as applied directives.
- Ordering is inherited from the IR, which A already sorts alphabetically
  (A §5.5); B introduces no ordering of its own.

### 5.4 Referential integrity (§7.2)

Because every link target is a `TypeRef.path` that A placed in the bundle,
integrity holds by construction. It is still asserted by a test (§7): extract every
Markdown link from every generated file and confirm each resolves to a key in the
bundle map.

---

## 6. Delivery: library function and minimal CLI

### 6.1 Library entry point

`src/index.ts` replaces the current `createOkfBundle` stub with:

```ts
export interface CreateOkfBundleOptions {
  readonly source: SourceSpec;   // reuses sub-project A's SourceSpec
  readonly outDir: string;
  readonly now?: string;         // injected ISO-8601; defaults to new Date().toISOString()
}

export async function createOkfBundle(options: CreateOkfBundleOptions): Promise<void>;
```

It composes the existing `readSchema` with `buildBundle` and `writeBundle`. The
pure `buildBundle(ir, timestamp)` is **not** exported from the public surface in B
(kept internal so C can evolve it); only `createOkfBundle` is public, per the
single-entry-point convention.

### 6.2 Minimal CLI

`src/cli.ts` parses one positional source and a required `--out <dir>`:

```
graphql-okf <sdl-path-or-endpoint-url> --out <dir>
```

Source kind is inferred: an argument that parses as an `http(s)` URL is an
`endpoint` spec; otherwise it is an `sdl` path. Errors print `error.message` only
(never a stack), as the existing `cli.ts` already does. Everything else — headers,
`--sdl`/`--endpoint` explicit selectors, config file, archive output, force/overwrite
— is deferred to sub-project D and explicitly out of scope here.

---

## 7. Testing

Built test-first per the repo's `test-driven-development` skill. The pure-core /
fs-edge split keeps almost every test filesystem-free.

1. **`render/links.ts` — pure string tests.** `relLink` for sibling, up-one, and
   cross-tree pairs; the decorated-type builder for nested `wrappers`
   (`[Language!]!`, `[[Int]]`, `ID!`). No schema fixtures.
2. **`render/*` + `bundle.ts` — hand-written IR literals -> expected text.** One
   focused test per kind, each covering: present vs null description (no
   fabrication), deprecation with and without a reason, an argument with a printed
   default, applied custom directives present vs absent. Full-byte assertions for a
   representative couple; targeted substrings for the rest.
3. **Whole-bundle test against the shared kitchen-sink fixture** (built for
   sub-project A): `buildBundle(ir, FIXED_TIMESTAMP)` -> assert the complete
   `Map<path, string>`. Doubles as the determinism check (same input twice ->
   byte-identical) and the §5.4 reserved-name check (the fixture already contains a
   type named `index`).
4. **Referential-integrity property test:** parse every Markdown link out of every
   generated file; assert each resolves to a key in the map.
5. **`write.ts` — the only filesystem test.** Write the map to a temp dir, read
   back, compare; assert create-only refuses a non-empty directory.
6. **End-to-end smoke:** `createOkfBundle` against the in-process kitchen-sink
   schema (as an SDL string) into a temp dir, plus minimal CLI argument parsing
   (`<source> --out <dir>`, URL-vs-path inference).

Coverage thresholds enforced by CI (lines >= 90%, functions >= 90%, branches >= 85%,
statements >= 90%) apply unchanged.

---

## 8. Definition of done

- `createOkfBundle({ source, outDir })` writes a complete OKF bundle: one file per
  concept, every file carrying the required `type` field, plus an `index.md` in
  every non-empty directory including the root.
- Every type/argument/return/interface/union reference renders as a Markdown link
  resolving to a real path in the bundle; the referential-integrity test passes.
- Output is a pure function of `(SchemaIr, timestamp)`; re-emitting the same input
  with the same timestamp yields a byte-identical map, and `timestamp` is the only
  field that varies between two real (un-pinned) runs.
- The machine/human seam is present in every concept file; the human area is created
  empty and is documented as stable for sub-project C.
- The minimal CLI produces a bundle from both an SDL path and an endpoint URL.
- All checks green: `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`,
  `pnpm run build`, `pnpm run knip`.

---

## 9. Explicitly out of scope

- **All reconciliation (§8, sub-project C):** idempotent-no-op re-runs that preserve
  existing timestamps, add/change detection, tombstoning removed concepts,
  human-edit merge-back, and `log.md`. B is create-only and re-writes a fresh tree.
- **Full delivery surface (§9, sub-project D):** request headers on the CLI,
  explicit source selectors, config file, archive (tarball/zip) output, force/
  overwrite semantics beyond a plain refuse-if-non-empty, and the scheduled/CI
  recipe.
- The M1 non-goals `NG-1`..`NG-6` apply in full — in particular `NG-6`: no runtime
  LLM calls, and every byte of output except the injected `timestamp` a pure
  function of the schema.
