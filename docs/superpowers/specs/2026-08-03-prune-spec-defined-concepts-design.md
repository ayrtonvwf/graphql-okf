# Stop emitting concept files for built-in scalars and spec directives

Design for issue #23. Sub-issue of the token/cost umbrella.

## Problem

The bundle emits a concept file for every element the GraphQL specification
defines: the scalars `Boolean`, `Float`, `ID`, `Int`, `String` and the directives
`@deprecated`, `@include`, `@oneOf`, `@skip`, `@specifiedBy`. Ten elements; a
given bundle emits a file for each one its schema's type map holds. The shop-api
bundle emits nine of them — it never mentions `Float` — totalling 7,289 bytes, 16%
of the bundle, restating the specification's own wording. `types/ID.md` spends 923
bytes saying `ID` is a unique identifier. The countries-api bundle emits all ten.

The bytes are the smaller cost. These files are *link targets*: every
``[`ID!`](/types/ID.md)`` in every field table invites a consumer to spend a turn
confirming something it knew before it started, and `ID` and `String` appear in
nearly every type.

`GOAL-7.3` already permits the fix — "Links to built-in scalars MAY be omitted or
handled by a documented convention, but the convention MUST be consistent." What
it demands is that whatever we do, we do uniformly and write down.

## The rule

An element is **spec-defined** when GraphQL itself defines it: the five specified
scalars and the five specified directives. A spec-defined element gets **no
concept file and is never a link target**. Every other element is unaffected —
custom scalars such as `DateTime` and `EmailAddress` carry `@specifiedBy` and real
documentation, and custom directives such as `@auth` and `@tag` are schema
facts. Both keep their files.

Two facts settled during design that change the issue as written:

- **#15 is merged** (commit `ad1b8fd`), clearing the dependency the issue named.
  `deprecated` and `specifiedBy` sit in `MODELED_AS_FIELDS` (`src/model/project.ts`),
  so nothing has ever linked to their concept files.
- **`@oneOf` is a live link target.** `examples/shop-api/v1.graphql` declares
  `input PaymentInput @oneOf`, and `PaymentInput.md` renders
  ``Directives: [`@oneOf`](/directives/oneOf.md).`` It is the one file of the nine
  that something points at.

The applied directive still renders — it is a schema fact that `PaymentInput`
takes exactly one field — but as plain code, ``Directives: `@oneOf`.`` The rule is
uniform: spec-defined elements appear as code, never as links, whether or not a
given schema applies them.

There is no opt-out flag. One behaviour and one convention is what `GOAL-7.3`
asks for, and a flag would double the reconciler's migration matrix for no
established need.

## Where the rule lives

`src/model/naming.ts` owns it. `GOAL-4.5` makes the naming scheme the single
source of truth for the element-to-path mapping, consumed by both emitter and
reconciler; "which elements have paths at all" is part of that mapping.

```ts
export function hasConceptFile(element: ElementName): boolean;
```

`hasConceptFile` decides on `kind` plus `name`, matching the two fixed name sets.
That is safe rather than approximate: GraphQL forbids a schema from redefining a
specified scalar or directive, so a custom element can never carry one of these
names in the matching kind. Case-sensitivity is GraphQL's — a `type id` is a
different element from the built-in `ID` and keeps its file.

`src/model/project.ts` consults it in one place: spec-defined elements are left
out of the `elements[]` array handed to `resolvePaths`, and `pathFor` returns
`null` for them. `pathFor` still throws on a genuinely unresolved path — that
remains a bug, and the two cases stay distinguishable.

Three consequences follow without further code:

- `ir.concepts` no longer holds spec-defined nodes, so `buildBundle`'s index
  generation drops them from `types/index.md` and `directives/index.md` with no
  change to `src/emit/bundle.ts`.
- **Spec-defined names stop participating in collision resolution.** A schema
  declaring `type id` alongside built-in `ID` currently case-folds to a collision
  and both sides get hashed basenames (`types/id-<hash>.md`). With `ID` out of the
  bucket, `id` takes the clean `types/id.md`. An improvement, but a real
  behaviour change, so it gets a test.
- `ScalarTypeNode.isBuiltIn` and `DirectiveDefinitionNode.isBuiltIn`
  (`src/model/ir.ts`) become unreachable, as does `renderScalarBody`'s
  `"Built-in GraphQL scalar."` branch (`src/emit/render/body.ts`). knip will flag
  the fields. All three are removed.

A test pins `hasConceptFile` against graphql-js's `isSpecifiedScalarType` and
`isSpecifiedDirective` across a real schema, so naming's name-based rule cannot
silently drift from the library's.

## Rendering

`TypeRef.path` and `AppliedDirective.path` become `string | null`. A null path
makes a dangling link unrepresentable rather than merely untested.

```ts
export function typeLink(ref: TypeRef): string {
  const decorated = `\`${decoratedType(ref)}\``;
  return ref.path === null ? decorated : `[${decorated}](${bundleLink(ref.path)})`;
}
```

`appliedInline` in `src/emit/render/body.ts` takes the same shape and keeps its
argument rendering unchanged.

| | before | after |
|---|---|---|
| field row | ``[`ID!`](/types/ID.md)`` | ``` `ID!` ``` |
| list of built-in | ``[`[String!]!`](/types/String.md)`` | ``` `[String!]!` ``` |
| `PaymentInput` | ``Directives: [`@oneOf`](/directives/oneOf.md).`` | ``Directives: `@oneOf`.`` |
| custom directive | ``[`@tag`](/directives/tag.md)(name: "beta")`` | unchanged |

A `TypeRef` names exactly one type, so wrappers never straddle the two cases —
the decision is all-or-nothing per reference.

### The root-index note

The convention is stated in the generated region of the bundle root `index.md`,
which is where progressive disclosure starts, so a traversing agent reads it
before it can notice anything missing. It must sit inside the generated markers
or it would never update.

> Built-in scalars (`Boolean`, `Float`, `ID`, `Int`, `String`) and spec
> directives (`@deprecated`, `@include`, `@oneOf`, `@skip`, `@specifiedBy`) have
> no concept files: they are defined by the GraphQL specification and appear as
> plain code, not links.

The string is a constant, emitted on every bundle's root index regardless of
which spec-defined elements a schema exercises. A fixed string is trivially
deterministic (`GOAL-8.1`), and the convention holds of the bundle either way.
It costs roughly 230 bytes against 7,289 saved.

`renderDirectoryIndex` currently takes `frontmatter` as a third positional
parameter; a fourth is where that signature stops reading well. Both fold into an
options object, across the two call sites in `buildBundle`:

```ts
renderDirectoryIndex(title, sections, { frontmatter, note });
```

## Migration of existing bundles

These files exist in `okf/shop-api/` (nine) and `okf/countries-api/` (ten) today.
The default reconciler path would turn each into a **tombstone** — which is larger
than the file it replaces, since a tombstone keeps the last known definition plus
a removal banner — inverting the point of the change.

Instead, a `src/reconcile/prune.ts` pre-pass deletes them before reconciliation
sees them, following the precedent `relayoutBundle` set for #22. `reconcile()`
runs:

```
relayout → prune → migrate → reconcile
```

Order matters in both directions. **After relayout**, because a legacy bundle
holds `types/scalars/ID.md` and relayout is what flattens it to `types/ID.md`;
prune then works against one path set rather than two layouts. **Before migrate**,
because converting the frontmatter of a file about to be deleted is wasted work
that also inflates the `migrated.frontmatter` count.

### The pruned path set is derived

Unlike relayout's `LEGACY_TYPE_DIRS` — a historical fact about bundles already on
disk — the pruned paths are a function of the *current* rule. `naming.ts`
therefore exports them, computed by running `resolvePaths` over the spec-defined
element list. If the rule changes, the pre-pass follows, and it cannot drift from
`hasConceptFile`.

The derived set always holds all ten paths, independent of any schema; prune
deletes whichever of them a given bundle actually contains. So the count is nine
for shop-api and ten for countries-api without the pre-pass knowing anything
about either schema.

### Guards

A path is deleted only when all three hold:

1. it is present in the existing bundle;
2. the file is owned by graphql-okf (`isOwnedFile` — it carries the generated
   markers);
3. it has no human-authored text below the end marker.

`hasHumanText` is private to `src/reconcile/relayout.ts` today and moves to
`src/reconcile/parse.ts` so both pre-passes share one definition.

Failing any guard leaves the file in place. It is then absent from the IR and the
normal path tombstones it — the right outcome for a file someone wrote into: the
human's words survive under a removal banner rather than being deleted silently.
A stray unowned file is never touched. An already-tombstoned built-in written by
an intermediate version *is* pruned; it satisfies all three guards.

### Known behaviour: the case-fold corner

A schema declaring `type id` alongside built-in `ID` produced, under the old rule,
`types/ID-<hash>.md` and `types/id-<hash>.md`. Neither matches a derived prune
path, so the built-in is tombstoned rather than deleted, while `id` moves to the
now-clean `types/id.md` as a delete-plus-add. The result is correct and lossless,
merely untidy. Not special-cased; recorded here so it is not rediscovered in
review.

### Log

`plan.migrated` gains `pruned: readonly string[]`, `hasLoggableChanges` counts
it, and `migrationGroup` reports a count in the existing style:

```
* Built-in scalars and spec directives: 9 concepts no longer emitted (GOAL-7.3).
```

The count is `plan.migrated.pruned.length` — nine for shop-api, ten for
countries-api.

Re-running after the prune is a no-op: nothing remains to delete, and no `log.md`
entry is written. That is what keeps `GOAL-8.1` intact now that prune feeds
`hasLoggableChanges`.

The checked-in `okf/shop-api/` and `okf/countries-api/` bundles are regenerated in
the same change, which is also the visible evidence the pre-pass works.

## Testing

### Unit

| file | asserts |
|---|---|
| `naming.test.ts` | `hasConceptFile` per kind; the derived prune paths; agreement with `isSpecifiedScalarType` / `isSpecifiedDirective` over a real schema |
| `project.test.ts` | spec-defined elements absent from `concepts`; `path: null` on an `ID` reference and on applied `@oneOf`; `DateTime` and `@tag` keep theirs; `type id` resolves to a clean `types/id.md` |
| `links.test.ts` | `typeLink` renders ``` `[String!]!` ``` unlinked when the path is null |
| `body.test.ts` | field row and `Directives:` line in both branches |
| `directory-index.test.ts` | the options object; the note lands inside the generated markers |
| `bundle.test.ts` | indexes omit spec-defined elements; the root index carries the note and child indexes do not |
| `prune.test.ts` | deletes owned and clean files; keeps files with human text; keeps unowned files; prunes an already-tombstoned built-in; is a no-op on an already-pruned bundle |

### Integration

`test/reconcile.test.ts` drives the real sequence: a v0.1 nested bundle runs
relayout, prune and migrate in one pass, producing `delete` actions and **no
tombstones** for the spec-defined files; a second run against the result changes nothing
and writes no `log.md` entry. That second run is the `GOAL-8.1` guard.

`src/conformance.test.ts` keeps its existing link-integrity test ("resolves every
internal link to a file in the bundle") unchanged — it is already the `GOAL-7.2`
regression test this change needs, and it fails if the work is done half-way. It
gains one assertion from the file-set side: no bundle path is a spec-defined
concept path.

`test/example-bundle.test.ts` covers the regenerated `okf/` bundles.
`test/equivalence.test.ts` must continue to hold, since the SDL and introspection
paths share the projector.

Coverage stays above the enforced gate: removing the `isBuiltIn` branches deletes
code, and every new branch is directly tested.

### Not verified by test

The byte reduction. The actual figure is measured against the regenerated bundles
and reported in the PR alongside the issue's 7,289 / 16% claim. Asserting a byte
count in a test would break on any unrelated wording change. `bench/` is out of
scope — it never runs in CI.

## Documentation

- **README** — the human-facing statement of the convention.
- **Bundle root `index.md`** — the machine-facing one, as above.
- **`docs/northstar-specs/GOAL-M1.md`** — `GOAL-7.3` already permits this, so no
  requirement changes. But `GOAL-4.1` requires the concept model to represent
  "scalar types (built-in and custom)", and the reading belongs on record rather
  than implied: built-in scalars *are* still represented — every reference names
  one and carries its wrappers — they simply have no concept file. A sub-bullet
  is added in the style `GOAL-4.3` already uses for #22: *"Recorded per issue #23:
  representation in the model does not imply a concept file; spec-defined
  elements are represented as references only."*

## Out of scope

- Any change to custom scalars or custom directives.
- A CLI flag restoring the old behaviour.
- Pruning anything beyond the ten spec-defined elements.
- Benchmark measurement of the token saving (`bench/`, issue #13).
