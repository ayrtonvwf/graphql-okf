# Put operation signatures in index.md files

Design for issue #21. Sub-issue of the token/cost umbrella.

## Problem

Index rows carry a name and a sentence. Learning what an operation *takes* always
costs at least one more read. `okf/shop-api/queries/index.md` today:

```markdown
* [products](/queries/products.md) - Lists products, most recently created first.
```

An agent asked "what can I filter products by?" learns only that `products`
exists. It reads `products.md` to find `filter: ProductFilter`, then
`types/ProductFilter.md` to find the fields — three reads and three turns for one
question, each turn re-reading the accumulated context.

`GOAL-7.4` requires each `index.md` to enumerate "its contents with short
descriptions ... to support progressive disclosure by an agent traversing the
bundle". A name plus a sentence is the minimum reading of that; progressive
disclosure means each level answers as much as it can before the agent descends.
`GOAL-5.2` already treats the index generator as more than a directory listing.

Two corrections to the issue as written, both settled during design:

- **There is no existing signature renderer to reuse.** The issue points at
  `src/emit/render/body.ts`, but operation bodies render `**Returns** <link>` plus
  an arguments table — never a one-line signature. This design introduces one.
- **`GOAL-7.2` does not require linked types in signatures.** It requires that
  links not dangle. Whether a type name inside a signature is a link is a design
  choice, not a spec obligation — and it is the choice that most affects the
  savings this umbrella is chasing.

Issue #23 has landed (commit `0b7dc14`), so the built-in-scalar convention this
issue wanted settled first *is* settled: `TypeRef.path` is null for spec-defined
elements, which appear as plain code.

## The format

Operation and directive index rows become a linked SDL signature followed by the
existing description. `queries/index.md`:

```markdown
# Query operations

Signatures are GraphQL SDL. A type name in a signature is a concept file at
`/types/<Name>.md`.

* [`me: Customer`](/queries/me.md) - The currently authenticated customer, if any.
* [`node(id: ID!): Node`](/queries/node.md) - Looks up any node by its globally unique identifier.
* [`products(filter: ProductFilter, first: Int = 20): [Product!]!`](/queries/products.md) - Lists products, most recently created first.
```

`directives/index.md` — which since #23 holds only custom directives:

```markdown
* [`@auth(requires: Role! = CUSTOMER) on FIELD_DEFINITION | OBJECT`](/directives/auth.md) - Restricts a field or type to callers holding at least the given role.
```

### Rules

- **Canonical SDL, no invented notation.** Argument order as declared in the
  schema; location order as the IR holds it, which `project.ts` already sorts
  alphabetically — the same order `body.ts` prints in a directive's `Locations:`
  line, so the two cannot disagree. A zero-argument operation renders
  `me: Customer`, not
  `me(): Customer` — empty parens are not SDL. `repeatable` occupies its SDL slot,
  before `on`.
- **Defaults render as `name: Type = value`**, from the already-stringified
  `defaultValue` on the IR.
- **Types in signatures are not links.** A Markdown code span cannot contain a
  link, so linking would fragment the signature into alternating code and link
  runs — it stops reading as a signature. It also roughly doubles the row (~55
  chars to ~103 for `products`), spending the bytes on the case where the agent
  has already decided to descend, at which point the concept file's tables supply
  the links anyway. Since #22 flattened the type tree, `ProductFilter` is
  unambiguously `/types/ProductFilter.md`; the convention note buys that mapping
  once per directory instead of once per row.
- **The signature is the link label.** The operation name appears once, not twice,
  and the row keeps the two-segment grammar — link, then description — that every
  other index row already has. Scanning still works: the signature starts with the
  name.
- **A deprecated operation carries a bold `(deprecated)` marker at the head of its
  description segment**, outside the code span. The signature stays pure SDL, and the marker
  is visible before a long description pushes it off the line. The deprecation
  *reason* stays in the concept file; it is often a sentence.
- **The convention note appears on each index that carries signatures** —
  `queries/`, `mutations/`, `subscriptions/`, `directives/` — not only on the root.
  An agent frequently enters at `queries/index.md` without passing through the
  root, and a convention it never read is a convention that does not exist. Four
  copies of one line costs under 500 bytes against the ~2 KB the signatures add.
  The root's existing built-ins note is a different, genuinely global fact and
  stays as-is.
- **Type indexes and child-directory rows are untouched.** `types/index.md` stays
  byte-identical; this change produces no churn outside the four
  operation/directive indexes.

An operation with no description still falls back to `"Query operation."` as its
summary, which beside a full signature is nearly content-free. It stays: removing
it would make the row grammar conditional, and an undescribed operation is exactly
the case where the signature carries the row.

## Structure

### `src/emit/render/signature.ts` (new)

Two pure functions:

```ts
export function operationSignature(node: OperationNode): string
export function directiveSignature(node: DirectiveDefinitionNode): string
```

Both build on `decoratedType` from `links.ts` — the existing single source for
wrapper decoration (`[Product!]!`) — so list and non-null spelling cannot drift
between a signature and a concept-file table. They deliberately do not use
`typeLink`.

Its own module rather than an addition to `body.ts`: `body.ts` renders whole
concept files and its consumer is `concept.ts`. A signature is an inline fragment
whose consumer is `bundle.ts`, the index builder. Folding it into `body.ts` would
make the index builder depend on the file-body renderer for one string.

### `IndexEntry` (`src/emit/render/directory-index.ts`)

```ts
export interface IndexEntry {
  readonly label: string;      // display text
  readonly code?: boolean;     // wrap label in a code span
  readonly link: string;
  readonly summary: string;
  readonly deprecated?: boolean;
}
```

> **As implemented:** ordering does not live on `IndexEntry` as a `sortKey`
> field. `directory-index.ts` was never responsible for ordering — sorting
> happens in `bundle.ts`, which builds a local `KeyedEntry = { key, entry }`
> wrapper and sorts that before unwrapping to `IndexEntry[]`. This reaches the
> same goal (ordering never depends on the rendered label) without threading a
> required field through every existing `IndexEntry` literal in the codebase.

`bullet` owns both the code-span wrapping and the deprecation marker:
`bundle.ts` passes data, `directory-index.ts` decides Markdown.

### `src/emit/bundle.ts`

`conceptEntry` switches on `concept.kind`: the three operation kinds and
`directive` get `code: true` and a signature label; every other kind is unchanged.
The convention note is selected the same way — a new exported `SIGNATURE_NOTE`
constant, keyed off concept **kind**, not directory name, since directory names
come from the naming scheme and a schema's root type names need not be `Query`.
`DirectoryIndexOptions.note` already exists, so no new plumbing is needed.

## Determinism

Nothing here reads the clock or the filesystem. Argument order, location order and
default values come from the IR — arguments in declaration order, locations
alphabetically sorted at projection time; the convention note is a constant
string. A re-run against an unchanged schema stays a byte-identical no-op
(`GOAL-8.1`, `M1/NG-6`).

## Testing

Test-first at each step.

- `signature.test.ts` — no arguments; arguments with and without defaults; wrapper
  spellings; built-in scalar names appearing bare; zero-argument directive;
  `repeatable`; multi-location joins.
- `directory-index.test.ts` — code-span wrapping; deprecation marker placement;
  sorting by `sortKey` rather than by label.
- `bundle.test.ts` — operation and directive indexes carry signatures and the
  note; `types/index.md` unchanged; tombstone rows unchanged.
- Regenerate the committed `okf/` fixtures; `conformance.test.ts` and the existing
  idempotence test confirm the second run is a byte-identical no-op.

Coverage thresholds are the gate: lines/functions/statements ≥ 90%, branches ≥ 85%.

## Rollout

For an existing bundle, the first run after upgrading rewrites four `index.md`
files. It records **no** `log.md` entry: index writes are counted separately in
`plan.ts` as `indexes` and are deliberately excluded from `hasLoggableChanges`, so
a reformatting of the indexes is not a change to the concepts. That is the right
behaviour — the log describes the schema's history, not the generator's — but it
means the upgrade diff arrives unannounced, and it belongs in the PR description.

## Out of scope

Adding a signature line to operation *concept* files. Tempting for
shape-consistency, but it is a density question about concept-file bodies, which
is issue #24's subject.
