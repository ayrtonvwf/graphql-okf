# Field-level applied directives in the emitted bundle — design

Resolves [issue #15](https://github.com/ayrtonvwf/graphql-okf/issues/15).

`GOAL-*` and `NG-*` refer to `docs/northstar-specs/GOAL-M1.md`. §-prefixed
section numbers refer to the emitter design,
`docs/superpowers/specs/2026-07-23-emitter-design.md`.

## Goal

Applied directives on **fields, arguments, input fields, and enum values** are
dropped from the emitted markdown. Type-level and operation-level directives
render correctly, which is what makes the gap dangerous: a reader who sees
`Directives:` on every concept file reasonably concludes that a field without
one carries no directive. For a field-level `@auth` gate the bundle does not
merely omit the fact — it leads to the opposite conclusion.

This matters beyond cosmetics. Standard GraphQL introspection does not expose
applied directives at all, only their definitions; reading them requires the
SDL. That is precisely the advantage `graphql-okf` holds over an
introspection-based MCP server, and at the field level the bundle currently
throws it away. The benchmark harness in `bench/` caught it: the
`customer-email-staff-only` criterion fails in all three `okf-bundle` trials of
the `qa` case, and is the only criterion holding that scenario below 1.00.

Surface those directives, consistently, across every table the emitter
produces.

## What is already correct

The IR is fine — only the renderer drops the data.

- `src/model/project.ts` populates `appliedDirectives` on every node kind,
  including fields (`fieldNode`, ~line 182), arguments (`argNode`, ~line 152),
  input fields (`inputFieldNode`, ~line 167), operation fields (~line 311), and
  enum values (`enumConcept`, ~line 359).
- `appliedDirectivesOf` sorts by name via `byName` (`src/model/project.ts:95`)
  and sorts each directive's arguments by name. Ordering is therefore already
  stable, and this change introduces none of its own (`GOAL-8.1`, `NG-6`).
- `MODELED_AS_FIELDS` (`src/model/project.ts:64`) excludes `deprecated` and
  `specifiedBy`, which are surfaced from their first-class IR fields. There is
  no risk of `@deprecated` rendering twice once the directive path is wired up
  (§5.3).

Nothing in `src/model/` changes. The whole fix lives in
`src/emit/render/body.ts`.

## Decisions

| Question | Decision |
| --- | --- |
| Rendering shape | Inline suffix in the existing description cell |
| Position relative to `(deprecated: …)` | After it, space-separated |
| Label | None — bare, like the deprecation suffix |
| Scope of application | Object/interface fields, arguments, input fields, enum values |
| Committed `okf/` bundles | Regenerate both in this PR |

The alternative shapes were a `Directives` column added only to tables that
need one, and a `## Directives` subsection mirroring `## Arguments`. The inline
suffix wins on churn: the table format is expected to be replaced with a more
compact representation in a later PR, so investing in table *shape* now would be
work thrown away. The suffix also matches the precedent `(deprecated: …)`
already sets in the same cell.

## Rendering

`descriptionCell()` (`src/emit/render/body.ts:63`) takes two new parameters: the
row's `appliedDirectives` and the enclosing concept's `path`. It composes the
cell from three parts — description, deprecation suffix, directives — joining
the non-empty ones with a single space:

```
Where orders are shipped. (deprecated: use shippingAddress) [`@auth`](../../directives/auth.md)(requires: CUSTOMER)
```

With no description:

```
[`@auth`](../../directives/auth.md)(requires: STAFF)
```

When a row has no applied directives the cell is **byte-identical** to today's
output. That is a stated test obligation below, not an incidental property: it
is what keeps the diff on regenerated bundles limited to rows that genuinely
gained information.

Four call sites pass the new arguments:

| Renderer | Table |
| --- | --- |
| `fieldsTable` (line 82) | Object and interface fields |
| `argumentsTable` (line 93) | Operation, directive, and per-field `## Arguments` tables |
| `inputFieldsSchema` (line 133) | Input object fields |
| `renderEnumBody` (line 203) | Enum values |

Union member tables are unaffected — a member is a `TypeRef`, which carries no
directives.

### Link format

The suffix reuses the existing `appliedInline()` (line 27), so a directive in a
cell renders exactly as it does in the concept-level `Directives:` line: a
backticked `@name` linked to the directive's concept file, followed by
parenthesised arguments when present. `fromPath` is in every case the enclosing
concept node's own `path` — the same value the `Directives:` line already
passes — so relative links from a cell resolve identically to the line above
it. Referential integrity (§5.4) holds by construction and stays covered by the
existing link-extraction test.

### Escaping

This is the one hazard the concept-level line never faced: the string now lives
inside a markdown table cell. A directive argument's value is `print(arg.value)`,
which for a string or block-string argument can contain `|` or newlines and
would break the row.

`appliedInline` therefore gains a cell mode. In that mode each argument's
**value** is routed through the existing `cell()` helper
(`src/emit/render/text.ts:12`), which collapses newlines and escapes pipes. The
directive name and the link path are not escaped: the name is a GraphQL name
and the path is derived from it, so neither can contain a reserved character.
Escaping them would corrupt the link.

The concept-level `Directives:` line keeps calling the unescaped mode — it is
not in a table, and collapsing there would be a behaviour change for no gain.

## Testing

Test-first, per `.claude/skills/test-driven-development`. Every test below is
written and watched to fail before the corresponding renderer change. All of
them go in `src/emit/render/body.test.ts`, which at line 88 already exercises
`appliedDirectives` on a concept node and asserts the `Directives:` line — the
shape to follow.

1. **Object field** — a field with `@auth(requires: STAFF)` renders the linked
   directive in its description cell. This is the issue's reproduction case.
2. **Argument** — a field argument with an applied directive, asserted through
   the `## Arguments` subsection.
3. **Input field** — an input object field with an applied directive.
4. **Enum value** — an enum value with an applied directive.
5. **Composition order** — one row carrying description, deprecation, and a
   directive at once asserts the exact cell string, pinning the order and the
   single-space separators.
6. **Escaping** — a directive argument whose printed value contains `|`
   produces an escaped `\|`, leaving the row's column count intact.
7. **No-op guard** — a row with an empty `appliedDirectives` renders the cell
   unchanged, including the existing deprecation-suffix cases.

Coverage thresholds are the merge gate and are unchanged: lines ≥ 90%,
functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.

## Bundle regeneration

The committed bundles under `okf/countries-api` and `okf/shop-api` go stale the
moment the renderer changes, so both are regenerated in this PR by running the
CLI over `examples/`. This accepts the reconciler's normal churn: `updated:`
frontmatter on every touched concept file and one `log.md` entry per bundle.
That churn is the reconciler working as specified, not a determinism violation —
re-running against an unchanged schema after this PR is still a no-op.

The load-bearing result is `okf/shop-api/types/objects/Customer.md`, where
`email` gains its `@auth(requires: STAFF)` annotation. That is the concrete fix
for the failing bench criterion.

## Out of scope

- Replacing the table format with a more compact representation. That is the
  planned follow-up which motivated choosing the inline suffix, but it is a
  separate change.
- Re-running the `bench/` harness. It makes paid, nondeterministic model calls
  and never runs in CI; confirming the criterion now passes is a manual,
  post-merge step.

## Gates

`pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`.
