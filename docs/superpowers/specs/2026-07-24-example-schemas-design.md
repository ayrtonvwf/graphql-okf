# Design — Example schemas and the committed demo bundle

**Date:** 2026-07-24
**Status:** Approved
**Implements:** `DOD-G-4` (reconciliation demonstrated against fixture schemas),
`DOD-G-1`/`DOD-G-2` (conformance and cross-linking, shown on a real bundle),
`GOAL-8.1`–`GOAL-8.4` (idempotence, reconcile, human-edit preservation, log),
`GOAL-9.2` (CLI), `GOAL-9.5` (reproducible scheduled runs)
**Depends on:** sub-projects A (naming scheme), B (emitter), C (reconciler) — all done

---

## 1. Scope

graphql-okf has no example schema that a reader can point at. What exists is:

- `test/fixtures/kitchen-sink.graphql` — a terse, deliberately adversarial fixture
  (`type index`, `type User_case`, `[[String!]]!`) that exercises naming edge cases.
- `test/fixtures/kitchen-sink-evolved.graphql` — a four-line diff off it.
- `okf/countries-api/` — a bundle generated from a live third-party endpoint,
  currently the README's only example.

None of these demonstrates the product. The kitchen-sink pair is unreadable as a
showcase by design, its evolution touches roughly a third of the reconciler's
behavior, and `okf/countries-api/` depends on a third-party endpoint staying up
and unchanged.

This document specifies a **second, realistic fixture family** — three versions of
a shop API, plus the bundle they produce — that serves as both the human-facing
example and the end-to-end test of create, update and determinism.

### 1.1 The two fixture families

The two families have different jobs and are kept apart deliberately:

| Family | Job | Optimized for |
|---|---|---|
| `test/fixtures/kitchen-sink*.graphql` | naming edge cases, collisions, reserved basenames, exotic type wrappers | being small and ugly enough to eyeball |
| `examples/shop-api/v*.graphql` | showcase, feature coverage, multi-step reconciliation | reading as a believable API |

Merging them would make both jobs worse: a realistic schema does not naturally
contain `type index`, and a schema full of collision traps cannot headline a
README. The kitchen-sink pair is **unchanged** by this work.

---

## 2. Artifacts

```
examples/shop-api/v1.graphql      new — the showcase schema
examples/shop-api/v2.graphql      new — additions, deprecation cycle begins
examples/shop-api/v3.graphql      new — deprecated members removed
okf/shop-api/                     new — committed bundle, end state after v1 → v2 → v3
test/example-bundle.test.ts       new — regenerates and asserts the committed bundle
src/cli.ts                        changed — accepts --now
src/index.ts                      changed — validates and normalizes `now`
README.md                         changed — documents the example and --now
```

The SDL files live under `examples/`, not `test/fixtures/`. They are reader-facing
artifacts that tests also consume; filing the README's showcase under `test/`
misrepresents what it is for.

`okf/countries-api/` is retained unchanged. It is the only committed evidence that
introspection against a live endpoint works end to end (`GOAL-3.2`, `DOD-G-6`),
which a local SDL fixture cannot replace.

---

## 3. The v1 schema

`examples/shop-api/v1.graphql` describes a small e-commerce API. The domain is
chosen for familiarity: a reader should spend no attention decoding the domain and
all of it on the emitted bundle.

It must exercise every branch of the concept model in `src/model/ir.ts`:

| Element | Present as | Why |
|---|---|---|
| Root operations | default `Query` / `Mutation` / `Subscription` | subscriptions are handled at `src/model/project.ts:195` but have no end-to-end fixture today |
| Subscriptions | `orderStatusChanged(orderId: ID!): Order!`, `productPriceChanged: Product!` | closes that gap |
| Scalars | `DateTime` with `@specifiedBy`, `EmailAddress` without | both branches of `ScalarTypeNode.specifiedByUrl` |
| Interface | `Node`, `Timestamped` | plain interfaces |
| Interface implementing an interface | `Purchasable implements Node` | `InterfaceTypeNode.interfaces` |
| Multiple implementation | `Product implements Node & Purchasable & Timestamped` | `implementedBy` back-references |
| Union | `PaymentMethod = CreditCard \| PayPalAccount \| GiftCard` | `UnionTypeNode.members` |
| Enums | `OrderStatus` (one value `@deprecated` at v1), `Currency`, `Role` | `EnumValueNode.deprecation`; `Role` is the `@auth` argument's type |
| Input object | `ProductFilter` | see below |
| `@oneOf` input | one input carrying `@oneOf` | applied-directive rendering on a type |
| Custom directives | `@auth(requires: Role! = CUSTOMER)`, `repeatable @tag(name: String!)` | `DirectiveDefinitionNode.isRepeatable`, argument defaults |
| Deprecation | `Query.searchProducts` with a reason, one object field without one, and a deprecated **argument** | `Deprecation.reason` null and non-null; `InputValueNode.deprecation` |
| Descriptions | block descriptions containing Markdown | `GOAL-6.3` faithfulness |

`ProductFilter` carries a default value of every literal kind — int, string,
boolean, enum, list — plus one field with no default, so every branch of
`InputValueNode.defaultValue` rendering is covered.

### 3.1 Deliberately absent

Nested list wrappers (`[[String!]]!`), reserved basenames (`index`, `log`) and
case-fold collisions do **not** appear in the shop API. They remain the
kitchen-sink fixture's responsibility. Forcing them into a realistic schema is the
contortion that keeping two families exists to avoid.

---

## 4. The evolution

Two steps, because a single step cannot express a deprecate-then-remove lifecycle
or prove that an existing tombstone survives a later run untouched.

### 4.1 v1 → v2 — additions, and the deprecation cycle begins

- **Added type** `Money { amountCents: Int!, currency: Currency! }`.
- **Added fields** `Purchasable.price: Money!`, `Order.total: Money!`.
- **Deprecated fields** `Purchasable.priceCents` and `Order.totalCents` gain
  `@deprecated(reason: ...)` pointing at their replacements. Because `Purchasable`
  is an interface, this change propagates to every implementor — a single schema
  edit touching many concepts.
- **Added type + members** `Review`, `Product.reviews: [Review!]!`, an `addReview`
  mutation, a `reviewPosted` subscription.
- **Added enum value** `OrderStatus.REFUNDED`.
- **Added argument** `Query.products(first: Int = 20)`.
- **Changed description** on `Customer`, with no structural change, so that a
  description-only edit is reconciled on its own.
- **Removed** `Query.searchProducts`, which was already deprecated in v1. This
  creates a tombstone during the v2 run.

### 4.2 v2 → v3 — the removals

- **Removed fields** `priceCents` and `totalCents`, from the interface and from
  every implementor.
- **Removed enum value** the one deprecated since v1.
- **Removed type** `GiftCard`, dropped from the `PaymentMethod` union in the same
  version.
- **Untouched** the `searchProducts` tombstone created in v2 must survive the v3
  run byte-for-byte.

The `GiftCard` removal is the important one. A removal whose referrers still point
at the removed type is not a valid GraphQL schema, so the union must change in the
same version — which is exactly the multi-concept reconcile worth demonstrating,
and it must be deliberate rather than incidental.

### 4.3 Reconciler coverage

| Behavior | Where it occurs |
|---|---|
| added concept | `Money`, `Review`, `addReview`, `reviewPosted` (v2) |
| changed concept — new field | `Product.reviews` (v2) |
| changed concept — deprecation added | `priceCents`, `totalCents` (v2) |
| changed concept — description only | `Customer` (v2) |
| changed concept — argument added | `Query.products` (v2) |
| changed concept — enum value added | `OrderStatus.REFUNDED` (v2) |
| removed concept → tombstone | `Query.searchProducts` (v2), `GiftCard` (v3) |
| tombstone persists across a later run | `searchProducts` through v3 |
| removal with referrer updated together | `GiftCard` + `PaymentMethod` (v3) |
| human edit preserved | §6 |
| `log.md` gains one entry per change run | three entries total |

Restoration of a tombstoned concept is already covered by
`test/reconcile.test.ts:158` against the kitchen-sink pair and is not duplicated
here.

---

## 5. The `--now` CLI flag

`syncOkfBundle` accepts `now` (`src/index.ts:13`) but the CLI parses only `--out`
(`src/cli.ts:11`), so a deterministic run is unreachable from the command line.
Regenerating a bundle with pinned timestamps, and the reproducible scheduled runs
`GOAL-9.5` asks for, both need it.

**Parsing.** `parseArgs` gains `--now <iso-8601>` and returns
`{ source, outDir, now?: string }`. Usage becomes:

```
Usage: graphql-okf <sdl-path-or-endpoint-url> --out <dir> [--now <iso-8601>]
```

A `--now` with no following value is a usage error, consistent with `--out`.

**Validation.** Validation and normalization live in `syncOkfBundle`, not in the
CLI. A value `Date.parse` cannot read raises a `GraphqlOkfError`; an accepted value
is normalized through `toISOString()` so frontmatter is canonical whether the
caller wrote `2026-01-15T09:00:00Z` or `2026-01-15T09:00:00.000Z`.

Placing it in the library gives both surfaces one definition of a valid timestamp,
matching how `GOAL-4.5` treats the naming scheme. The trade-off is a stricter
library contract than today's pass-through; callers already passing a valid ISO
string are unaffected.

---

## 6. Verification: the golden-bundle test

`test/example-bundle.test.ts` is the single gate. It:

1. creates a temp directory and runs `syncOkfBundle` against `v1.graphql` with
   `now` pinned to `2026-01-15T09:00:00.000Z`;
2. appends a human-authored `## Ownership` section to
   `types/objects/Product.md`;
3. runs `v2.graphql` with `now` pinned to `2026-03-02T09:00:00.000Z`;
4. runs `v3.graphql` with `now` pinned to `2026-05-20T09:00:00.000Z`;
5. walks both trees and compares the result byte-for-byte against `okf/shop-api/`.

With the environment variable `UPDATE_EXAMPLE=1` set, step 5 writes the result into
`okf/shop-api/` instead of asserting. Regeneration is therefore one command and
never a manual copy.

Going through `syncOkfBundle` means this one test covers bundle generation,
three-step reconciliation, tombstone persistence, human-edit preservation and
determinism at once, on both Node 24 and 26, with no new CI job — the existing
`test` job is the gate.

### 6.1 The injected human edit

Step 2 is deliberate and must be commented as such in the test. Preserving human
prose (`GOAL-8.3`) is otherwise the one requirement a reader can only verify by
trusting a test name; injecting it makes it visible in the committed bundle, where
`types/objects/Product.md` carries an `## Ownership` section that no schema
produced and that three subsequent runs did not disturb.

### 6.2 Consequence: the bundle is a snapshot

Any deliberate change to emitter output produces a large diff in `okf/shop-api/`
that a reviewer must read rather than rubber-stamp. This is intended. For a tool
whose contract is determinism (`NG-6`, `GOAL-8.1`), an unexplained diff in the
committed bundle is the strongest regression signal available.

---

## 7. README changes

The examples section gains `okf/shop-api/`, pointing first at its `log.md` —
three dated entries are the fastest proof of the create-*and-update* thesis in
`GOAL-M1` §1 — and then at the bundle root. `okf/countries-api/` keeps its place
as the live-introspection example. The CLI section documents `--now`.

---

## 8. Non-goals

- **`--header` for authenticated introspection.** `GOAL-3.3` is satisfied by the
  library but the flag is absent from the CLI. It is a real gap, unrelated to
  example fixtures, and is not folded in here.
- **Changing the kitchen-sink fixtures.** They keep their current content and their
  current tests.
- **Retiring `okf/countries-api/`.** It proves something the shop API cannot.
- **A separate regeneration script or CI job.** The golden test is both.
- **Committing per-version bundle snapshots.** One living bundle carrying its own
  history is the model the tool exists to promote; three snapshot directories would
  undercut it.

---

## 9. Definition of done

- `DONE-1` — `examples/shop-api/v1.graphql` parses, and every row of the §3 coverage
  table is present in the emitted bundle.
- `DONE-2` — v2 and v3 parse, and every row of the §4.3 coverage table is observable
  in `okf/shop-api/` or its `log.md`.
- `DONE-3` — `okf/shop-api/` is committed, contains three dated `log.md` entries,
  exactly two tombstones (`queries/searchProducts.md`,
  `types/objects/GiftCard.md`), and the surviving `## Ownership` section in
  `types/objects/Product.md`.
- `DONE-4` — `test/example-bundle.test.ts` passes on Node 24 and 26; running it
  twice without `UPDATE_EXAMPLE` is a no-op.
- `DONE-5` — `graphql-okf <sdl> --out <dir> --now <iso>` produces the pinned
  timestamps; an unparseable `--now` fails with a clear `GraphqlOkfError`.
- `DONE-6` — `pnpm run coverage`, `lint`, `typecheck`, `build` and `knip` all pass,
  with coverage still above the enforced thresholds.
- `DONE-7` — README documents both examples and `--now`.
