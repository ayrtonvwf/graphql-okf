# Design — Reconciler (M1 sub-project C)

**Date:** 2026-07-24
**Status:** Approved
**Implements:** `GOAL-M1` §8 (update / reconcile behavior), `GOAL-9.1` (create-or-update entry point)
**Depends on:** sub-project A (`SchemaIr`, naming scheme), sub-project B (rendering, the machine/human seam)
**Depended on by:** sub-project D (delivery surface)

---

## 1. Scope

Sub-project C turns graphql-okf from a generator into a maintainer. B writes a
complete bundle into a fresh directory; C makes a **second run against an existing
bundle** correct: unchanged schemas produce an empty diff, changed schemas produce
exactly the edits they imply, removed elements are tombstoned rather than deleted,
and human-authored prose survives every regeneration.

C owns `GOAL-M1` §8 in full:

| Requirement | Covered by |
|---|---|
| `GOAL-8.1` idempotent no-op re-run | §3.2 change detection, §4 timestamp reuse |
| `GOAL-8.2` add / change / remove reconciliation | §4 the decision table |
| `GOAL-8.3` machine vs. human content preserved | §5 the seam, extended to `index.md` |
| `GOAL-8.4` chronological `log.md` entry | §6 |
| `GOAL-8.5` safe to interrupt and re-run | §7 convergent apply |
| `GOAL-8.6` reviewable as a normal diff | §3.2 (no-write-when-equal), §6 (append-only log) |

It also replaces the create-only entry point with the create-or-update verb
`GOAL-9.1` asks for (§8).

### 1.1 Decomposition recap

| # | Sub-project | Covers | Status |
|---|---|---|---|
| A | Concept model + naming scheme | §3, §4 | Done. Produces `SchemaIr`. |
| B | Emitter | §5, §6, §7 | Done. Renders and writes a fresh bundle. |
| **C** | **Reconciler** | **§8** | **This document.** |
| D | Delivery surface | §9 | Later. |

The A spec is the authority on the IR and the naming scheme; the B spec is the
authority on rendering. C re-derives neither — it never turns a name into a path
(`GOAL-4.5`) and never renders a body itself, it calls B's renderers.

---

## 2. Architecture

The same pure-core / fs-at-the-edge shape as A and B:

```
src/reconcile/
  parse.ts    parseConceptFile(text) -> ParsedFile | null                (pure)
  plan.ts     reconcile(ir, existing, timestamp) -> BundlePlan           (pure)
  log.ts      renderLogEntry(plan) -> string                             (pure)
  read.ts     readExistingBundle(outDir) -> ReadonlyMap<path, string>    (fs)
  apply.ts    applyPlan(plan, outDir) -> Promise<void>                   (fs)

src/index.ts  syncOkfBundle({ source, outDir, now? }) -> Promise<SyncResult>
```

`reconcile` is the whole brain and touches nothing: it takes the new `SchemaIr`, a
map of the bundle's current file contents, and one injected timestamp, and returns
a plan of actions. Every interesting behavior in this document is therefore
testable with in-memory literals. Only `read.ts` and `apply.ts` see the
filesystem, and neither makes a decision.

### 2.1 The timestamp stays injected

C inherits B's rule (`NG-6`): no module below `syncOkfBundle` reads the clock.
`reconcile` receives `timestamp` as a parameter and is a total, deterministic
function of `(ir, existing, timestamp)`. C adds a second, stronger property —
the timestamp is applied **only to concepts whose content actually changed**.
Everything else keeps the ISO value already on disk, which is what makes
`GOAL-8.1` hold across runs rather than merely within one.

### 2.2 The ownership rule

**A file is graphql-okf-owned if and only if it contains the generated-region
markers.**

This single test does all the work that a sidecar manifest would otherwise do:

- it identifies concept files and `index.md` files as ours;
- it identifies **tombstone candidates** — owned files whose element is no longer
  in the schema;
- it identifies **strays** — any file in the bundle that we did not write (a
  hand-authored `guides/onboarding.md`, a stray `README.md`). Strays are never
  read, never written, and never enumerated.

No state file, no checksum field, no drift between a manifest and reality. The
bundle remains fully self-describing, and a human who deletes a concept file gets
it recreated on the next run rather than a crash.

One exception, by reserved name: **`index.md` is always ours** regardless of
markers, and `log.md` is always the log. A marker-less `index.md` — what B emits
today, and what every bundle generated before C contains — is treated as fully
machine-owned and rewritten in the seam-bearing form (§5) on the first reconcile
run. That upgrade is a one-time *Changed* action per directory, logged as nothing
(§6 does not log index changes), after which index files compare equal like
everything else.

---

## 3. Reading and comparing

### 3.1 `parseConceptFile`

Splits an owned file into its three parts:

```ts
interface ParsedFile {
  readonly frontmatter: readonly FrontmatterLine[]; // ordered key/raw-value pairs
  readonly generated: string;                       // between the markers, exclusive
  readonly human: string;                           // everything after the end marker
}
```

Returns `null` for a file without markers (a stray). Throws
`GraphqlOkfError("MALFORMED_CONCEPT", …)` — naming the file — for a file with
unbalanced, duplicated, or out-of-order markers. Guessing at a mis-parsed file
risks clobbering someone's prose; stopping with a named path does not.

Frontmatter parsing mirrors B's hand-rolled writer: a flat sequence of
`key: value` lines, no nesting, no YAML dependency. Frontmatter is machine-owned,
but **unknown keys are preserved verbatim**, emitted after the machine-written
keys in their original relative order. Dropping a key a human added would be
silent data loss for no benefit.

### 3.2 The comparison

For each concept in the new IR whose path already exists on disk:

```
render new file      -> newFrontmatter, newGenerated
parse existing file  -> oldFrontmatter, oldGenerated, human

unchanged  <=>  newGenerated == oldGenerated
           &&  newFrontmatter == oldFrontmatter  (ignoring `timestamp`)
```

An unchanged concept produces **no action at all** — the file is not rewritten,
so its bytes, its `timestamp`, and its mtime are untouched. This is the mechanism
behind both `GOAL-8.1` (empty diff) and `GOAL-8.6` (a reconcile diff shows only
real changes).

A changed concept is rewritten as: new frontmatter (carrying the **new**
timestamp and any preserved unknown keys), the new generated region, and the
existing `human` string spliced back **verbatim** — byte-for-byte, no
normalization, no trimming.

---

## 4. The decision table

For every concept path, old and new:

| On disk | In schema | Action | Logged as |
|---|---|---|---|
| absent | yes | **create** — full render, new timestamp | Added |
| present, compares equal (§3.2) | yes | **none** | — |
| present, differs | yes | **update** — new frontmatter + new generated region + human region verbatim | Changed |
| present, live | no | **tombstone** (§4.1) | Removed |
| present, already tombstoned | no | **none** | — |
| present, tombstoned | yes again | **restore** — `status`/`removedAt` dropped, body regenerated normally | Added |

The *already tombstoned → none* row is load-bearing: without it, a bundle that has
ever seen a removal would rewrite its tombstones on every subsequent run and fail
the no-op test forever.

The *human deleted the file* case falls out of row 1 for free — the file is
absent, so it is recreated and logged as Added.

### 4.1 Tombstone format

The file **stays at its path**, so every inbound Markdown link from a surviving
concept keeps resolving and referential integrity (`GOAL-7.2`) survives removals:

```markdown
---
type: object
title: "LegacyOrder"
resource: "https://api.example.com/graphql"
tags: [graphql, object]
timestamp: 2026-07-01T10:00:00.000Z
status: removed
removedAt: 2026-07-24T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
> **Removed.** This element is no longer present in the schema as of 2026-07-24.

## Last known definition

<the previous generated body, verbatim>
<!-- graphql-okf:generated:end -->

<human region preserved verbatim>
```

`status` and `removedAt` appear only on tombstones. `timestamp` retains its
original value — the concept's content did not change, its presence in the schema
did, and `removedAt` is the field that records that.

The last known definition is carried over from the existing file's generated
region rather than re-rendered, because the element is gone from the IR and
cannot be re-rendered.

---

## 5. The seam, extended to `index.md`

B gives every concept file a generated region and a human area below it. C
extends the same seam to **`index.md` files**, which B emits as fully machine-owned
text. Without this, the documented promise "your edits are preserved" would have
an exception a user discovers only by losing work.

```markdown
# Object types

<!-- graphql-okf:generated:start -->
- [Country](Country.md) — A country.
- [LegacyOrder](LegacyOrder.md) — (removed)
<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
See also our onboarding notes.
```

Index files are compared and rewritten by exactly the same rule as concepts
(§3.2), minus the timestamp (an index is not a concept and carries none, so an
index is a pure function of the schema alone).

Tombstoned concepts **remain listed** in their directory index, suffixed
`— (removed)`, so the index never links into a void and a reader browsing the
bundle sees the removal rather than an absence.

Strays are not listed. Enumerating them would make the output depend on directory
contents as well as the schema, weakening `NG-6` and making a no-op run sensitive
to unrelated files.

---

## 6. `log.md`

A run that produces at least one action appends one section; a no-op run appends
nothing (`GOAL-8.4`).

```markdown
## 2026-07-24T09:00:00.000Z

**Added**
- [`Invoice`](types/objects/Invoice.md)
- [`invoices`](queries/invoices.md)

**Changed**
- [`User`](types/objects/User.md)

**Removed**
- [`LegacyOrder`](types/objects/LegacyOrder.md)
```

Newest entry at the **end** of the file: a true append, so a run's diff is purely
added lines at the tail with no churn above them. Empty groups are omitted.
Entries within a group follow the IR's existing sort order, so the log is
deterministic too.

Index-only changes are not logged. The log records concept-level facts about the
API, not the bundle's internal bookkeeping. Restorations are logged under
**Added**.

`log.md` remains reserved (`GOAL-5.4`) — it is never a concept document, and it
carries no generated markers, so the ownership rule (§2.2) correctly treats it as
neither concept nor stray. It is append-target-only.

---

## 7. Applying the plan

```
plan = reconcile(ir, existing, now)          # pure, nothing touched yet
if plan.actions.length === 0: return         # GOAL-8.1
if plan has any concept-level action:        # first
    appendLogEntry(outDir, renderLogEntry(plan))
for (const action of plan.actions)           # then
    write <path>.tmp -> rename over <path>
```

The log guard is separate from the empty-plan guard because a plan can consist
solely of index-file actions (§2.2's one-time upgrade, or an index whose entry
summaries shifted), and those are not logged (§6).

**The whole plan exists before anything is written** (B's rule, inherited): a
render or parse error cannot leave a half-updated tree, because it happens before
the first write.

**Per-file atomicity:** each write goes to a temporary file in the same directory
and is renamed over the target, so no individual file is ever observed
half-written.

**Recovery is convergence.** A run killed midway leaves some files new and some
old. The next run re-reads the bundle, re-derives the plan, finds the
already-applied files compare equal and skips them, and completes the rest. There
is no journal to replay and no rollback path to get wrong — the reconciler is
idempotent by construction, which is the same property `GOAL-8.1` already
demands. This satisfies `GOAL-8.5`: no interrupted state exists that a subsequent
run cannot recover from.

**The log is written first, before the file actions.** A crash after the log but
before (or during) the actions leaves an entry describing changes the next run
completes — the log stays truthful about what the tool set out to do, and the next
run finishes the job without double-logging, because by then the files it already
wrote compare equal. The reverse order has a strictly worse failure: files silently
changed with no log entry, and no later run will ever produce one.

---

## 8. Delivery: one verb

`createOkfBundle` is replaced by:

```ts
export interface SyncOkfBundleOptions {
  readonly source: SourceSpec;
  readonly outDir: string;
  readonly now?: string;
}

export interface SyncResult {
  readonly created: boolean;          // true when the bundle did not exist
  readonly added: readonly string[];  // concept paths
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: number;
}

export function syncOkfBundle(options: SyncOkfBundleOptions): Promise<SyncResult>;
```

Dispatch on the output directory:

| `outDir` | Behavior |
|---|---|
| missing or empty | create — reconcile against an empty bundle, `created: true` |
| contains a root `index.md` | reconcile |
| non-empty, no root `index.md` | `GraphqlOkfError("NOT_A_BUNDLE", …)` |

**Create is not a separate path.** Reconciling against an empty `existing` map
yields a plan of nothing but creates, which is exactly a fresh bundle. B's
`writeBundle` and its `OUTPUT_NOT_EMPTY` error are therefore deleted rather than
kept alongside `applyPlan` — one code path, exercised by every run, instead of a
create path that only ever runs once per bundle and rots. A first run logs every
concept under **Added**, so `log.md` exists and is honest from run one.

One verb rather than two because `GOAL-9.1` asks for "creates or updates", and
because the caller that most needs this — a scheduled CI job (`GOAL-9.5`) —
genuinely does not know whether the bundle exists yet. The package is at `0.0.0`
with no tags, so the rename costs no consumers.

The returned `SyncResult` is what a CI job needs to decide whether to open a PR,
and what the tests assert against without re-reading the tree.

The CLI keeps its current shape and calls the new verb. New flags (`--force`,
archive output, headers, config file) remain sub-project D.

### 8.1 New error codes

- `NOT_A_BUNDLE` — output directory is non-empty but has no root `index.md`.
- `MALFORMED_CONCEPT` — an owned file's markers are unbalanced or out of order.

---

## 9. Testing

- **Plan tests (the bulk)** — pure, in-memory `existing` maps against IR literals,
  covering every row of §4's decision table, plus unknown-frontmatter-key
  preservation and malformed-marker rejection.
- **Idempotence (`DOD-G-3`)** — create into a temp dir, snapshot every file's bytes
  and mtimes, re-run, assert byte-identical and that `log.md` gained nothing.
  Assert the same for a bundle that contains a tombstone.
- **Evolution (`DOD-G-4`)** — a new `test/fixtures/kitchen-sink-evolved.graphql`
  adding, changing, and deleting elements. Assert the creates, updates and
  tombstones; assert the `log.md` entry's content; assert a human paragraph written
  below the end marker survives verbatim in both a changed and a tombstoned file.
- **Restoration** — evolve away and back, assert the tombstone is cleaned up and
  the concept is logged as Added.
- **Interrupt recovery (`GOAL-8.5`)** — inject a failure partway through
  `applyPlan`, re-run, assert convergence to the same bytes an uninterrupted run
  produces.
- **Referential integrity after removal** — re-run B's integrity check on a bundle
  containing tombstones; every link must still resolve.
- **Strays** — a hand-authored file in the bundle is unchanged by a run and absent
  from every index.

Coverage thresholds are unchanged and enforced: lines ≥ 90%, functions ≥ 90%,
branches ≥ 85%, statements ≥ 90%.

---

## 10. Definition of done

- Re-running against an unchanged schema is a verified no-op: zero writes, empty
  diff, no `log.md` entry — including for bundles containing tombstones.
- Re-running against an evolved schema creates, updates and tombstones exactly the
  affected concepts, appends one ISO-8601 `log.md` section, and preserves every
  human-authored region byte-for-byte.
- A removed element's concept file remains at its path with `status: removed`, and
  all inbound links still resolve.
- An interrupted run converges on re-run to the same bytes as an uninterrupted one.
- `syncOkfBundle` creates or updates from both an SDL path and an endpoint URL and
  returns an accurate `SyncResult`.
- All checks green: `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`,
  `pnpm run build`, `pnpm run knip`.

---

## 11. Explicitly out of scope

- **Delivery surface (§9, sub-project D):** `--force`/overwrite, archive output,
  CLI request headers, config file, scheduled-job wiring.
- **Semantic diffing:** the reconciler compares rendered text, not schema ASTs. A
  cosmetic schema edit that changes rendered output counts as a change; that is
  correct and intended.
- **Merge conflict resolution:** if a human edits inside the generated region,
  their edit is overwritten. The seam is the contract; the region above the end
  marker is machine-owned and says so.
- **Cross-run history beyond `log.md`:** git is the history mechanism
  (`GOAL-8.6`); the tool does not keep its own.
