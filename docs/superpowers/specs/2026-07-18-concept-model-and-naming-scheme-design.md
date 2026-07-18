# Design — Concept model and naming scheme (M1 sub-project A)

**Date:** 2026-07-18
**Status:** Approved
**Implements:** `GOAL-M1` §3 (Inputs) and §4 (Concept model and naming scheme)
**Depended on by:** sub-project B (emitter), sub-project C (reconciler), sub-project D (delivery surface)

---

## 1. Scope

`GOAL-M1.md` is too large for a single spec. It is decomposed into four
sub-projects, each with its own spec → plan → implementation cycle:

| # | Sub-project | Covers | Deliverable |
|---|---|---|---|
| **A** | **Concept model + naming scheme** | §3, §4 | SDL/introspection → normalized IR with resolved paths. **This document.** |
| B | Emitter | §5, §6, §7 | IR → bundle on disk: frontmatter, body prose, cross-links, per-directory `index.md`. |
| C | Reconciler | §8 | Idempotency, add/change/tombstone, human-edit preservation, `log.md`, crash safety. |
| D | Delivery surface | §9 | CLI flags, config file, archive output, CI recipe. |

This ordering is mandated by the goal spec itself: §4 states the naming scheme
"MUST be settled and documented before the emitter is built."

**Sub-project A produces an in-memory value and nothing else.** No file writing,
no Markdown, no frontmatter, no `index.md`. That constraint is what makes it
finishable and verifiable on its own.

---

## 2. Architecture

```
src/source/sdl.ts          loadFromSdl(filePath)       ─┐
src/source/endpoint.ts     loadFromEndpoint(url, hdrs)  ├─→ LoadedSchema
src/source/index.ts        loadSchema(SourceSpec)      ─┘   { schema: GraphQLSchema,
                                                              resource: string,
                                                              origin: "sdl" | "introspection" }

src/model/naming.ts        kind→directory map, filename rules, case-fold
                           collision resolution. Pure; imports nothing from
                           graphql-js.

src/model/ir.ts            IR type declarations. Types only, no logic.

src/model/project.ts       project(LoadedSchema) → SchemaIr

src/index.ts               readSchema(SourceSpec) → Promise<SchemaIr>
                           plus the IR types. The only supported surface.
```

### 2.1 Paths are baked into IR nodes

`GOAL-4.5` requires the naming scheme to be a single source of truth consumed by
both emitter and reconciler, with neither re-deriving paths independently.

Each IR node therefore carries its final `path` as a field. Consumers read
`node.path`; there is no path-computing function for them to call incorrectly and
no second code path that can drift. The requirement becomes structurally
unviolatable rather than merely documented.

Two alternatives were considered and rejected: a separate `PathIndex` map
travelling alongside a pure IR (introduces a lookup that can miss at runtime), and
a `createNamer(ir)` closure (weakest guarantee — nothing prevents a contributor
writing `` `types/${name}.md` `` inline, and the bug would not surface until a
case-fold collision appeared in a user's schema).

### 2.2 Projection is two-pass

Collision resolution is a whole-set property: `User` needs a disambiguating suffix
only once `user` also exists, so no single-node function can decide a path.

- **Pass 1** walks the schema and collects every named element as `{ kind, name }`.
- `naming.ts` resolves that complete set into a `Map` of paths.
- **Pass 2** walks again, building IR nodes with their resolved paths attached.

Because the resolver sees the complete set before deciding anything, the result is
order-independent by construction.

### 2.3 `naming.ts` is graphql-js-free

It accepts a plain list of `{ kind, name }` and returns resolved paths. The most
load-bearing rule in the project is therefore testable with plain arrays of
strings — no schema fixtures needed to exercise collision behaviour — and schema
details cannot leak into path logic.

### 2.4 Boundary against B and C

`SchemaIr` is the entire contract. The emitter and reconciler consume it and
nothing else; they never see a `GraphQLSchema`. This contains graphql-js version
drift to one module and lets B and C be tested against hand-written IR literals
rather than real schemas.

---

## 3. Inputs (§3)

- **SDL** (`GOAL-3.1`): a local `.graphql` / `.gql` file, loaded and built with
  graphql-js `buildSchema` (`GOAL-3.5`).
- **Introspection** (`GOAL-3.2`): a live endpoint URL, queried with graphql-js
  `getIntrospectionQuery()` and built with `buildClientSchema` (`GOAL-3.5`).
  Arbitrary request headers are supported (`GOAL-3.3`).

Both paths normalize into the identical `SchemaIr` (`GOAL-3.4`), with the single
documented exception in §5.3 below.

The endpoint loader takes an **injectable `fetch`**, defaulting to global `fetch`,
so every introspection test runs offline and deterministically.

`resource` is the endpoint URL or the SDL file's origin, and is carried on the IR
for the emitter to write into frontmatter per `GOAL-5.2`.

---

## 4. Naming scheme (§4)

### 4.1 Granularity

A concept is **one named type, one root operation, or one directive definition**.
Object fields and arguments are described inside their parent's concept, not as
separate files. Bundle size stays proportional to type count, and progressive
disclosure operates at the granularity a client engineer actually browses.

### 4.2 Kind → directory

| Element | Directory |
|---|---|
| Object type | `types/objects/` |
| Interface type | `types/interfaces/` |
| Union type | `types/unions/` |
| Enum type | `types/enums/` |
| Input object type | `types/inputs/` |
| Scalar type (built-in and custom) | `types/scalars/` |
| Query field | `queries/` |
| Mutation field | `mutations/` |
| Subscription field | `subscriptions/` |
| Directive definition | `directives/` |

Filename is the exact GraphQL name plus `.md`. No escaping is required: GraphQL
names match `/[_A-Za-z][_0-9A-Za-z]*/`, which is filesystem-safe on every target
platform.

**Consequence for sub-project C:** because kind is encoded in the path, a type
changing kind (object → interface) is a path change. The reconciler MUST treat it
as remove + add, tombstoning the old path per `GOAL-8.2`.

### 4.3 Built-in scalars are emitted

`String`, `Int`, `Float`, `Boolean` and `ID` get concept files in
`types/scalars/` like any other type. Every type reference in the bundle then
links to a real file, so referential integrity (`GOAL-7.2`) is one uniform rule
with no exceptions to encode, test, or explain. `GOAL-7.3` permits omitting such
links; we decline the permission in favour of uniformity. Cost is five small files
per bundle.

The IR marks them with `isBuiltIn: true` so B may style them differently if it
chooses.

### 4.4 Root operation types

Whatever type the schema designates as its query, mutation, or subscription root —
which need not be named `Query` — is **excluded from `types/objects/`**. Its fields
become the operation concepts under `queries/`, `mutations/`, `subscriptions/`.

A reference to a root type from elsewhere in the schema links to that operation
directory's `index.md`. This is the documented convention that keeps `GOAL-7.2`
intact for the edge case.

Introspection meta-types (`__Schema`, `__Type`, `__Field`, …) are excluded
entirely.

### 4.5 Collision resolution (`GOAL-4.4`)

Resolution is scoped **per directory**, the only scope in which a filesystem
collision is possible. `types/objects/User.md` and `types/enums/User.md` coexist
untouched.

A name receives a `-<hash>` suffix — the first 8 hex characters of the SHA-256 of
the exact name — when, within its directory:

1. another name case-folds to the same string, **or**
2. the name case-folds to a reserved OKF filename (`index` or `log`), per
   `GOAL-5.4`.

When trigger 1 fires, **all** members of the colliding set are suffixed, never
just one. A schema containing both `User` and `user` object types therefore yields
`types/objects/User-<sha256("User")[0..8]>.md` and
`types/objects/user-<sha256("user")[0..8]>.md` — both suffixed, so neither name
holds a privileged position that a later schema change could take away.

Because the suffix derives from the name itself and never from position or
iteration order, adding or removing a type can never rename an unrelated concept —
which is what `GOAL-4.2` (byte-identical paths across re-runs) and `GOAL-8.1`
(no-op re-runs) require.

Two distinct names sharing an 8-character hash prefix raise
`NAME_HASH_COLLISION` rather than silently overwriting.

---

## 5. The IR

### 5.1 Shape

```ts
type SchemaIr = {
  resource: string;                       // endpoint URL or SDL origin
  origin: "sdl" | "introspection";
  concepts: readonly ConceptNode[];       // sorted by path
};

type TypeRef = {
  wrappers: readonly ("nonNull" | "list")[];   // outermost first
  name: string;
  path: string;                           // resolved path of the named type
};
```

Every `ConceptNode` carries `kind`, `name`, `path`, `description: string | null`,
and `appliedDirectives`. Beyond that:

| Node | Additional fields |
|---|---|
| Object type | `fields`, `interfaces: TypeRef[]` |
| Interface type | `fields`, `interfaces: TypeRef[]`, `implementedBy: TypeRef[]` |
| Union type | `members: TypeRef[]` |
| Enum type | `values: EnumValueNode[]` |
| Input object type | `fields: InputValueNode[]` |
| Scalar type | `specifiedByUrl: string \| null`, `isBuiltIn: boolean` |
| Operation | `operationType: "query" \| "mutation" \| "subscription"`, `args`, `type: TypeRef`, `deprecation` |
| Directive definition | `locations: string[]`, `args`, `isRepeatable: boolean` |

`FieldNode` carries `name`, `description`, `type: TypeRef`, `args:
InputValueNode[]`, `deprecation`, `appliedDirectives`. `InputValueNode` carries
`name`, `description`, `type: TypeRef`, `defaultValue: string | null`,
`deprecation`, `appliedDirectives`. `EnumValueNode` carries `name`,
`description`, `deprecation`, `appliedDirectives`.

`implementedBy` is included because B cannot compute it without re-deriving paths,
which §2.1 forbids. It is a pure function of the schema.

### 5.2 Deprecation is a first-class field, not an applied directive

`@deprecated` is modeled as `deprecation: { reason: string | null } | null`, and
`@specifiedBy` as `specifiedByUrl`. Both are **excluded** from
`appliedDirectives`, so no element is ever represented twice.

### 5.3 Applied directives and §3.4 equivalence

Standard introspection cannot see applied custom directives. Per §5.2,
`appliedDirectives` contains exactly the custom directives — precisely the set
introspection cannot observe.

- **SDL-sourced** IR populates `appliedDirectives` fully.
- **Introspection-sourced** IR leaves `appliedDirectives` empty.

Custom directive *definitions* are modeled on both paths, per `GOAL-4.1`.

`GOAL-3.4`'s "modulo information genuinely absent from one form" therefore has an
exact, testable form:

> the introspection-sourced IR equals the SDL-sourced IR with
> `appliedDirectives` stripped.

### 5.4 Default values are printed strings

Argument and input-field default values are stored as strings produced by
graphql-js's own AST printer, not as live JS values. Deterministic, serializable,
and free of float-formatting surprises.

### 5.5 Ordering

**All collections sort alphabetically by name**: concepts (by path), fields,
arguments, enum values, union members, implemented interfaces, and directive
locations.

This is a deliberate trade. Declaration order carries authorial intent — `id`,
`createdAt`, `updatedAt` read together — and alphabetical ordering scrambles it.
In exchange, the IR is immune to an introspection endpoint returning an unstable
type map, insertions produce minimal diffs, and determinism (`GOAL-8.1`,
`NG-6`) holds without depending on any server's iteration behaviour.

---

## 6. Error handling (`GOAL-3.6`)

One exported error class, `GraphqlOkfError`, carrying a `code` discriminant, a
message naming *what* was wrong and *which* input, and the underlying graphql-js
or network error as `cause`.

| Code | Raised when |
|---|---|
| `SOURCE_NOT_FOUND` | SDL file path does not exist |
| `SOURCE_UNREADABLE` | SDL file exists but cannot be read |
| `SDL_PARSE_ERROR` | graphql-js syntax error; message includes file and location |
| `SCHEMA_INVALID` | schema builds but fails validation |
| `ENDPOINT_UNREACHABLE` | network-level failure |
| `ENDPOINT_HTTP_ERROR` | non-2xx response; message includes status |
| `ENDPOINT_INVALID_RESPONSE` | body is not a valid introspection result |
| `INTROSPECTION_DISABLED` | response indicates introspection is blocked |
| `NAME_HASH_COLLISION` | two distinct names share an 8-char hash prefix |

`INTROSPECTION_DISABLED` earns a dedicated code because it is the most common
real-world failure against a production endpoint and its actionable advice —
supply an SDL file instead — differs entirely from a generic GraphQL error.

Errors are thrown, not returned. There is no partial-success mode: `readSchema`
either produces a complete `SchemaIr` or throws. The CLI prints `error.message`
only, never a stack, as `src/cli.ts` already does.

---

## 7. Testing

Built test-first per the repo's `test-driven-development` skill.

1. **`naming.ts` — pure string tests, no schema fixtures.** Per-directory
   collision scoping; all members of a colliding set suffixed rather than one;
   reserved `index`/`log` handling; kind→directory mapping. Plus an
   **order-independence property test**: shuffle the input name list, assert
   byte-identical output. This is the direct test of `GOAL-4.2`.
2. **`project.ts` — fixture SDL → IR snapshots.** A kitchen-sink schema
   exercising every kind, deprecation with and without a reason, custom applied
   directives, non-default root type names (`schema { query: RootQuery }`), a
   case-fold collision pair, a type named `index`, nested list/non-null wrappers,
   an interface implementing an interface, and default values of every literal
   kind.
3. **Equivalence (`DOD-G-6`) — entirely in-process.** Build the fixture schema,
   run `getIntrospectionQuery()` against it with graphql-js's `graphql()`, feed
   the result to `buildClientSchema`, project both paths, and assert deep equality
   after stripping `appliedDirectives`. No network.
4. **Determinism.** Project the same source twice and assert deep equality — the
   unit-level precursor to `GOAL-8.1`.
5. **Errors.** One test per code in §6.

Coverage thresholds already enforced by CI (lines ≥ 90%, functions ≥ 90%,
branches ≥ 85%, statements ≥ 90%) apply unchanged.

---

## 8. Definition of done

- `readSchema` accepts an SDL path or an endpoint URL with headers and returns a
  complete `SchemaIr`.
- Every modeled element carries a resolved `path` produced solely by
  `naming.ts`; no other module constructs a path.
- Collision and reserved-name rules hold, and are proven order-independent.
- The §5.3 equivalence assertion passes against the kitchen-sink fixture.
- Projecting the same source twice yields deeply equal IR.
- Every error code in §6 is reachable and tested.
- All checks green: `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`,
  `pnpm run build`, `pnpm run knip`.

## 9. Explicitly out of scope

No file writing, Markdown rendering, frontmatter, `index.md`, `log.md`,
reconciliation, tombstoning, human-edit preservation, CLI flags, config files, or
archive output. Those belong to sub-projects B, C, and D. The M1 non-goals `NG-1`
through `NG-6` apply in full — in particular `NG-6`: no runtime LLM calls, and
every byte of output a pure function of the schema.
