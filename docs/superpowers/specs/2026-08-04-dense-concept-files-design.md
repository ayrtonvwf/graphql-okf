# Make emitted concept files denser

Design for issue #24. Sub-issue of the token/cost umbrella (#20).

## Problem

Concept files are shaped for a human skimming a rendered page; the primary
consumer is an agent doing retrieval. Two things spend bytes on presentation
rather than facts.

**Hint comments.** Every one of the shop bundle's 58 files carries:

```markdown
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->
<!-- Human-authored content below this line is preserved across regenerations. -->
```

Nothing parses them. They restate, 58 times, a convention that belongs in one
place. The issue measures them at 9,546 bytes — 21% of a 46,217-byte bundle. On
`types/scalars/ID.md` (923 bytes) they are roughly 190 bytes, against ~250 of
frontmatter.

**Markdown tables for the schema section.** A table is a notation invented for
this output. SDL is the notation GraphQL was designed in, is what every model has
seen orders of magnitude more of, and carries applied directives for free where a
table needs a whole extra column that is empty for most rows.

Neither is required by the spec. OKF v0.2 §11 makes only three things MUST:
parseable YAML frontmatter, a non-empty `type` field, and §8/§9 filenames when
present. §4.2 states there are no required body sections and asks producers to
"favor structural markdown (headings, lists, tables, fenced code blocks) over
freeform prose" — naming fenced code blocks as first-class structure alongside
tables. So this is not a deviation from §4.2's intent; it picks a different
sanctioned structure. §6.1 makes links MAY, but the graph they form is the point
of the format, which is why they are preserved rather than dropped (see
"References line" below).

All of #24's stated dependencies have landed: #15 (`ad1b8fd`) settled how applied
directives are represented, #21 (`f2f693d`) introduced signature rendering, #22
(`6ebf2ff`, `215618a`) made links absolute and flattened `types/`, #23 (`0b7dc14`)
made `TypeRef.path` null for spec-defined elements.

## Scope

Two phases, sequenced, one spec. Phase A is independent and lands first.

- **Phase A** — remove the hint comments; restate the convention once; migrate
  existing bundles conservatively.
- **Phase B** — replace the `# Schema` tables with SDL blocks plus a
  `References:` line.

Out of scope: the frontmatter/body description overlap (issue item 3). Both
`GOAL-5.2` (`description` is the docstring's first sentence) and `GOAL-6.3` (the
body carries the full docstring) are load-bearing — `description` is what makes a
bundle queryable without opening files — so the duplication stands as designed.

## Phase A — cut the hint comments

`GENERATED_HINT` and `HUMAN_HINT` are removed from
[`src/emit/render/seam.ts`](../../../src/emit/render/seam.ts). `EMPTY_HUMAN`
becomes a bare newline. `GENERATED_START` and `GENERATED_END` stay: `assembleFile`
splits on them and the reconciler uses them to preserve human regions.

The convention is restated in two places, once each:

- a short generated paragraph in the bundle root `index.md`, so a consumer who
  has only the bundle still finds the rule;
- the repo README, for someone reading the project.

### Migrating existing bundles

`GENERATED_HINT` sits inside the generated block and clears itself on the next
sync. `HUMAN_HINT` does not: it is written once at file creation as part of
`EMPTY_HUMAN` and thereafter lives inside the human-authored region the
reconciler is contractually forbidden to touch.

[`migrateBundle`](../../../src/reconcile/migrate.ts) gains a third rule alongside
the existing provenance and tombstone conversions. It strips `HUMAN_HINT` **only**
when the file's human region — everything after `GENERATED_END` — is
byte-identical to the current `EMPTY_HUMAN` (`"\n\n" + HUMAN_HINT + "\n"`). Any
other content, including a human's own text following the hint, is left exactly
as-is. The exception to the reconciler's contract is therefore explicit and
narrow: the only region it touches is one provably containing nothing but our own
generated comment.

It runs in the same pre-pass as the other migrations, is recorded in `log.md` the
same way, and is idempotent — a second run finds nothing to strip.

## Phase B — SDL blocks

Every concept kind renders its `# Schema` section as one fenced `graphql` block.
`# Schema` stays as the heading: §4.2's convention is about the section, not its
internal format.

`types/Customer.md` today:

```markdown
# Customer

A person who can place orders.

A customer is created on first sign-in and is never hard-deleted.

Implements [`Node`](/types/Node.md), [`Timestamped`](/types/Timestamped.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `createdAt` | [`DateTime!`](/types/DateTime.md) |  |
| `defaultAddress` | [`Address`](/types/Address.md) | Where orders are shipped by default. |
| `displayName` | `String!` |  |
| `email` | [`EmailAddress!`](/types/EmailAddress.md) | [`@auth`](/directives/auth.md)(requires: STAFF) |
| `id` | `ID!` |  |
| `updatedAt` | [`DateTime`](/types/DateTime.md) |  |
```

and after:

````markdown
# Customer

A person who can place orders.

A customer is created on first sign-in and is never hard-deleted.

# Schema

```graphql
type Customer implements Node & Timestamped {
  createdAt: DateTime!
  "Where orders are shipped by default."
  defaultAddress: Address
  displayName: String!
  email: EmailAddress! @auth(requires: STAFF)
  id: ID!
  updatedAt: DateTime
}
```

References: [`Address`](/types/Address.md), [`@auth`](/directives/auth.md), [`DateTime`](/types/DateTime.md), [`EmailAddress`](/types/EmailAddress.md), [`Node`](/types/Node.md), [`Timestamped`](/types/Timestamped.md).
````

### Per-kind block forms

| Kind | Block |
| --- | --- |
| object | `type X implements A & B { … }` |
| interface | `interface X implements A { … }` |
| input | `input X { … }` |
| enum | `enum X { … }` |
| union | `union X = A \| B` |
| scalar | `scalar X @specifiedBy(url: "…")` |
| directive | `directive @auth(requires: Role!) repeatable on FIELD_DEFINITION` |
| operation | `country(code: ID!): Country` |

An operation renders as a bare field definition — a valid SDL fragment, not a
standalone document. Its root type name is not lost: the `resource` frontmatter
anchor already carries it (`…#Query.country`), which is why `rootTypeName` exists
in the IR at all.

A type with no members renders its header alone (`type Empty`, `enum Empty`),
which is valid SDL. Empty braces are not.

### Arguments move inside the block

The `## Arguments` subsection and its per-field tables
([`body.ts:119-134`](../../../src/emit/render/body.ts)) are removed. SDL carries
argument types, defaults, and per-argument docstrings inline:

```graphql
products(
  "Narrows the result set."
  filter: ProductFilter
  first: Int = 20
): [Product!]!
```

Nothing is lost, the largest remaining table disappears, and a field stops being
separated from its own arguments by half a page.

### Prose lines SDL states natively

Dropped, because the block says the same thing: `Implements A, B.`,
`Directives: @auth(…).`, `Locations: …`, `Repeatable.`, `**Returns** T`,
`Custom scalar. Specified by <url>.`, and the `**Deprecated: …**` block.
Deprecation becomes `@deprecated(reason: "…")` inside the block, where GraphQL
puts it.

Kept: `Implemented by X, Y.` on interfaces. It is a reverse edge that an
interface's own SDL cannot express, so nothing else in the file carries it.

Kept: the concept's own docstring as prose under the H1, per `GOAL-6.3`. It is
the one place freeform text genuinely belongs, and burying it in the code fence
makes the block's first line noise. Field and argument docstrings do go inside
the block — they describe members, not the concept.

### Docstring rendering

Deterministic, one rule, no heuristics: a description that is a single line
containing no `"` and no `\` renders as `"…"`; anything else renders as a
`"""…"""` block string, with any `"""` inside it escaped as `\"""` per GraphQL's
own rule.

### The References line

An SDL block cannot hold markdown links — a fenced `graphql` block containing
``[`Address`](/types/Address.md)`` is no longer SDL. One line under the block
names each distinct linked concept once.

The alternative considered and rejected was documenting the naming scheme so
links are derivable by convention. Three reasons it loses:

- **The graph is the product.** §6.1 is explicit that a link from A to B asserts a
  *relationship*, and consumers building a graph view treat links as directed
  edges. Derivable links are edges only for a consumer that has implemented
  `graphql-okf`'s naming scheme — which makes the bundle a set of files that
  happen to be co-located, the same objection that ruled out the digest file in
  #20.
- **Interop.** A search index, a graph renderer, or another agent's OKF reader
  knows markdown links. None knows that a GraphQL type name maps to
  `/types/<Name>.md`. `M1/GOAL-4.5` makes the naming scheme the single source of
  truth *inside this codebase*; exporting it as a precondition for reading our
  output inverts that.
- **`GOAL-7.2` stays testable.** The no-dangling-link invariant is a real
  regression test. With derivable links there is nothing to check — every
  reference is trivially valid because nothing is asserted.

Rules:

- One entry per distinct target path, deduplicated.
- Sorted alphabetically by concept name, with the `@` sigil ignored for sorting
  and the target path as tiebreaker, so ordering is total and stable
  (`M1/GOAL-8.1`) even when a type and a directive share a name.
- Absolute bundle-relative paths per #22.
- Spec-defined elements omitted per #23 — they have `path === null` and no
  concept file. In an SDL block `ID!` is simply `ID!`, with no link to omit.
- Applied directives included. That is the cross-link #15 is about, and the one
  relationship an introspection-based consumer cannot reconstruct at all.
- `Implemented by` targets excluded: they are a reverse edge, already linked in
  their own line, and folding them in would erase the direction distinction that
  line exists to make.
- Omitted entirely when a concept has no outbound edges.

**Honest framing of the cost.** The issue measures per-field links across the 16
object/input/interface files at 2,902 bytes against roughly 1,632 for per-file
`References:` lines — about 1,270 saved, most of it from built-in scalars
dropping out (#23) rather than from deduplication (bundle-wide, links repeat only
1.11×). A few small files get marginally larger. The `References:` line is
justified as **preserving the graph at roughly break-even cost**, not as a byte
optimisation. The byte win comes from table→SDL compression. The PR should say so;
framing it otherwise sets up the wrong tradeoff in review.

## Modules

The guiding rule: **SDL syntax is generated in exactly one place.**

### `src/emit/render/sdl.ts` (new)

Pure `ConceptNode → readonly string[]`. Owns every piece of SDL notation: type
headers, brace bodies, field and argument lists, default values, applied
directives, docstrings, `@deprecated`, `@specifiedBy`. It knows nothing about
markdown, links, or file paths. Depends only on `decoratedType` from
[`links.ts`](../../../src/emit/render/links.ts).

### `src/emit/render/signature.ts` (folded in)

`argumentList` is the same SDL argument syntax `sdl.ts` needs. Rather than two
functions that must agree, it moves into `sdl.ts` and `signature.ts` imports it.
`operationSignature` and `directiveSignature` — the #21 index rows — become thin
wrappers over the same builders the concept files use, so an index row and a
concept file cannot disagree about how a signature is spelled.

### `src/emit/render/references.ts` (new)

Pure `ConceptNode → readonly string[]`, empty when there are no edges. Walks the
concept for outbound edges — field and argument types, interfaces, union members,
applied directives, at every depth — keeps those with a non-null `path`, dedupes,
sorts, and renders the line using `bundleLink`.

### `src/emit/render/body.ts` (shrinks)

Stops being a table generator and becomes an assembler: H1, description,
`Implemented by` (interfaces only), `# Schema`, the SDL block, the `References:`
line. The eight `render*Body` functions collapse toward a single shape, with
`Implemented by` the only per-kind branch left in the body layer.

`cell()` from [`text.ts`](../../../src/emit/render/text.ts) is table escaping and
survives only for the directory indexes; knip reports it if it goes fully unused.

The boundary: `sdl.ts` produces the notation, `references.ts` produces the graph,
`body.ts` assembles the page. Each is testable on IR nodes alone — no bundle, no
context, no filesystem.

## Risks

**The reference tooling may be table-shaped.**
[`body.ts:86-90`](../../../src/emit/render/body.ts) records that OKF's reference
tooling extracts field names from a top-level `# Schema` section, and
[`conformance.test.ts:184`](../../../src/conformance.test.ts) asserts the table
header. We know the *section* is what is conventional and that §4.2 sanctions
fenced code blocks within it; we do not know whether that particular parser
expects a table. If it does, field-name extraction by generic OKF tooling
degrades. This is SHOULD-level and cannot make the bundle non-conformant under
§11, but it is a real interop cost. State it in the PR as a deliberate trade
rather than let a reviewer find it.

**No retrieval-accuracy evidence.** Verification is CI-only (decided). We ship on
deterministic evidence — bytes down, links resolve, bundle conforms — and no
evidence that retrieval accuracy held up, which is the actual point of the
change. `bench/` remains available to run against the `qa` case afterwards if the
result looks wrong in practice; it makes paid, nondeterministic model calls and
never runs in CI, so it cannot be a merge gate.

## Verification

- **SDL validity, proved not assumed.** Feed every emitted `graphql` block to
  `graphql-js`'s `parse` in the conformance suite and assert it is syntactically
  valid SDL. Operations render as field-definition fragments, so those are parsed
  in a wrapping type context.
- **Escaping.** Descriptions containing `"`, `\`, or newlines round-trip through
  the docstring rule.
- **Unit tests per kind** on `sdl.ts` and `references.ts` against IR nodes.
- **Existing invariants carry over unchanged** and now guard the `References:`
  line: link resolution (`conformance.test.ts:121`) and no relative links
  (`:144`).
- **`conformance.test.ts:184`** is rewritten to assert the fence rather than the
  table header.
- **Fixtures.** `okf/countries-api` and `okf/shop-api` are regenerated; the diff
  is the real review artifact.
- **Determinism (`M1/GOAL-8.1`).** Re-running against the regenerated fixtures is
  a byte-identical no-op with no `log.md` entry.
- **Migration.** `HUMAN_HINT` stripping fires on a pristine human region, does not
  fire on a written-in one, and is idempotent.
- **Bytes.** Measured from the regenerated fixtures and reported in the PR. No
  figure is carried forward from the issue as though we had re-measured it.

Coverage thresholds (lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements
≥ 90%) apply as always.
