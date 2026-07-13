# graphql-okf — M1 Goal Specification

**Status:** Draft
**Scope:** Milestone 1 (frontend-only utility)
**Audience:** Anyone (human or agent) implementing or evaluating M1

This document specifies *what* M1 delivers and the requirements it must satisfy.
It is the *what we build* spec. The *how we build it* — tooling, CI, automation —
lives in `SETUP.md` alongside this file. This document describes behavior and
output shape; it does not prescribe which test runner or linter is used.

---

## 1. Vision

`graphql-okf` reads a GraphQL API's public interface and produces — and keeps up to
date — an [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog)
bundle that describes that interface. The bundle is a directory of Markdown files
with YAML frontmatter, cross-linked into a graph, that any human or AI agent can
read without bespoke tooling.

**M1 is deliberately frontend-only.** It answers the question *"what does this
GraphQL API expose, and how do its types relate?"* using only information that is
discoverable from the schema itself — via an SDL file or an introspection query.
It makes no attempt to describe resolver behavior, federation topology, or
downstream calls; those belong to later milestones. The immediate beneficiary is
a client engineer integrating against the API who wants an accurate, versioned,
agent-readable map of the interface.

The two verbs that define M1 are **create** and **update**. Producing a bundle
once is easy; keeping it faithful to a changing schema across re-runs, without
destroying human edits, is the hard and valuable part.

---

## 2. Core concepts and terminology

- **Source** — the input GraphQL schema, provided either as an SDL document or
  obtained by introspecting a live endpoint.
- **Concept model** — graphql-okf's internal, source-agnostic representation of the
  schema (types, fields, arguments, enums, inputs, interfaces, unions,
  directives). Both input paths normalize into this single model.
- **Concept** — one unit of knowledge in the output bundle, serialized as one
  Markdown file. Its file path is its identity.
- **Bundle** — the output directory of concept files plus reserved `index.md` and
  `log.md` files. The unit of distribution.
- **Naming scheme** — the deterministic mapping from a schema element to a concept
  file path. This is load-bearing: stable identity across re-runs depends on it.

---

## 3. Inputs

**Requirements**

- `GOAL-3.1` — graphql-okf MUST accept a local GraphQL SDL file
  (`.graphql` / `.gql`) as a source.
- `GOAL-3.2` — graphql-okf MUST accept a live GraphQL endpoint URL and obtain the
  schema via a standard introspection query.
- `GOAL-3.3` — For introspection, it MUST support supplying request headers
  (e.g. authorization) so that protected endpoints can be read.
- `GOAL-3.4` — Both input paths MUST normalize into the identical concept model,
  such that an SDL file and the introspection of the same schema produce the same
  bundle (modulo information genuinely absent from one form).
- `GOAL-3.5` — Schema loading and parsing MUST use a canonical GraphQL library's
  build/validate routines rather than hand-rolled parsing, so that any schema the
  reference implementation accepts is accepted here.
- `GOAL-3.6` — Invalid or unreachable sources MUST fail with a clear, actionable
  error (what was wrong, which input), not a stack trace or a partial bundle.

---

## 4. The concept model and naming scheme

This is the single most important design decision in M1; every later capability
inherits it. It MUST be settled and documented before the emitter is built.

**Requirements**

- `GOAL-4.1` — The concept model MUST represent, at minimum: object types,
  interface types, union types, enum types, input object types, scalar types
  (built-in and custom), fields (with arguments and return types), root
  operations (queries, mutations, subscriptions), and directive definitions and
  their applications where they carry interface meaning (e.g. `@deprecated`).
- `GOAL-4.2` — There MUST be a deterministic, documented naming scheme mapping
  each modeled element to a concept file path. Re-running against an unchanged
  schema MUST produce byte-identical paths.
- `GOAL-4.3` — The scheme MUST group concepts sensibly for progressive disclosure
  (for example: types under a `types/` area, root operations under
  `queries/` / `mutations/` / `subscriptions/`), while remaining within OKF's
  rule that a file's path is its identity.
- `GOAL-4.4` — Naming MUST handle collisions and case sensitivity safely across
  filesystems (two schema elements must never map to the same path; casing-only
  differences must not collide on case-insensitive filesystems).
- `GOAL-4.5` — The naming scheme MUST be the single source of truth, consumed by
  both the emitter and the reconciler. Neither may re-derive paths independently.

---

## 5. Output: OKF conformance

The bundle MUST be a conformant OKF v0.1 bundle. OKF is permissive on the
consumer side, but graphql-okf is a *producer* and MUST emit well-formed output.

**Requirements**

- `GOAL-5.1` — Every concept file MUST be Markdown with a YAML frontmatter block
  and MUST include the one required OKF field, `type`.
- `GOAL-5.2` — Each concept SHOULD populate the recommended OKF fields where
  meaningful: `title`, `description`, `resource`, `tags`, `timestamp`.
  - `description` MUST be sourced from the schema element's documentation string
    when present.
  - `resource` MUST point at the source of truth (the endpoint URL or SDL origin).
  - `timestamp` MUST be an ISO-8601 value reflecting when the concept was
    generated or last changed.
- `GOAL-5.3` — The `type` value MUST distinguish GraphQL element kinds (e.g. an
  object type vs. a query vs. an input) using a consistent, documented vocabulary,
  so a consumer can filter by kind.
- `GOAL-5.4` — The reserved filenames `index.md` and `log.md` MUST be used only
  for their OKF-defined purposes and MUST NOT be used for concept documents.
- `GOAL-5.5` — Frontmatter MUST be valid YAML and MUST round-trip (a consumer
  parsing then re-serializing MUST not lose fields graphql-okf wrote).
- `GOAL-5.6` — The emitted bundle MUST be valid against the reference OKF
  consumer expectations: browsable as plain files, renderable as Markdown, with
  no required field missing from any concept.

---

## 6. Output: content of a concept document

Frontmatter makes a concept queryable; the body makes it useful.

**Requirements**

- `GOAL-6.1` — Each concept's Markdown body MUST describe the element in prose
  derived from the schema: for a type, its fields and their types; for a field,
  its arguments, argument types, and return type; for an enum, its values; for an
  operation, its arguments and return type. Deprecation and its reason MUST be
  surfaced when present.
- `GOAL-6.2` — The body MUST NOT invent information absent from the schema. If the
  schema provides no description for an element, the document states the
  structural facts without fabricating intent. (Behavioral/"under the hood"
  narrative is explicitly a later-milestone concern.)
- `GOAL-6.3` — Where the schema carries a documentation string, it MUST be
  preserved faithfully in the body, not paraphrased away.

---

## 7. Output: cross-linking (the graph)

Cross-linking is what turns a flat dump into a knowledge graph and is M1's first
genuinely differentiated capability.

**Requirements**

- `GOAL-7.1` — Every reference from one concept to another schema element MUST be
  rendered as a standard Markdown link to that element's concept file. Examples:
  a field returning `User` links to the `User` concept; an argument of type
  `OrderInput` links to the `OrderInput` concept; an object implementing an
  interface links to that interface; a union links to each member type.
- `GOAL-7.2` — Links MUST resolve to real paths within the bundle as produced by
  the naming scheme (§4). Referential integrity within a single emitted bundle
  MUST hold: no link points to a path the bundle did not create for an element it
  contains.
- `GOAL-7.3` — Links to built-in scalars MAY be omitted or handled by a
  documented convention, but the convention MUST be consistent.
- `GOAL-7.4` — Each directory, including the bundle root, MUST have an `index.md`
  enumerating its contents with short descriptions, per OKF, to support
  progressive disclosure by an agent traversing the bundle.

---

## 8. The update / reconcile behavior

This is the correctness core of M1. graphql-okf is not a one-shot generator; it
maintains a living bundle. Re-running against an evolved schema MUST reconcile the
existing bundle rather than blindly overwrite it.

**Requirements**

- `GOAL-8.1` — Running against an existing bundle MUST be **idempotent** when the
  schema is unchanged: no file content changes, no spurious diffs, no churn in
  `timestamp` or ordering. A no-op re-run MUST produce an empty diff.
- `GOAL-8.2` — When the schema has changed, graphql-okf MUST reconcile:
  - **added** elements → new concept files created;
  - **changed** elements → corresponding concept files updated;
  - **removed** elements → corresponding concept files marked removed per a
    documented policy (e.g. tombstoned/annotated) rather than silently deleted,
    so consumers and history retain the fact of removal.
- `GOAL-8.3` — graphql-okf MUST distinguish **machine-owned** content from
  **human-authored** content within a concept file and MUST preserve human edits
  across re-runs. The mechanism (e.g. a delimited generated region vs. a free
  prose region) MUST be documented and stable.
- `GOAL-8.4` — On any change, graphql-okf MUST append a chronological entry to the
  bundle's `log.md` in ISO-8601 form, recording what changed. A no-op re-run MUST
  NOT append to `log.md`.
- `GOAL-8.5` — Reconciliation MUST be safe to interrupt/re-run: a failed or
  partial run MUST NOT leave the bundle in a corrupt or half-updated state that a
  subsequent run cannot recover from.
- `GOAL-8.6` — The output of a reconcile run MUST be reviewable as a normal diff
  (this is why git is the recommended bundle host), so a human can inspect exactly
  what changed and why before committing.

---

## 9. Delivery surface

M1 ships as both a library and a CLI; both are consumers of the same core.

**Requirements**

- `GOAL-9.1` — graphql-okf MUST expose a programmatic API (through the single public
  entry point) that accepts a source plus options and creates or updates a bundle.
- `GOAL-9.2` — graphql-okf MUST expose a CLI that performs the same create/update
  operation, with flags for source selection (SDL path vs. endpoint), headers,
  output location, and output form.
- `GOAL-9.3` — graphql-okf MUST support emitting the bundle as a directory (for a
  git repo) and SHOULD support a single archive (tarball/zip) form, both being
  valid OKF distribution shapes.
- `GOAL-9.4` — Configuration SHOULD be expressible via a config file in addition
  to CLI flags, so repeated runs (e.g. in automation) are declarative.
- `GOAL-9.5` — graphql-okf SHOULD be runnable as a scheduled/CI job that
  regenerates the bundle and opens a diff when the upstream schema changes,
  fulfilling the "keep up to date" half of the vision without manual effort.

---

## 10. Explicit non-goals for M1

To keep the milestone shippable and its scope honest, M1 does **not** do the
following. These are named here so they are not smuggled in:

- `NG-1` — No federation analysis: detecting whether the API is a federation,
  enumerating subgraphs, or mapping entity ownership. (Milestone 3.)
- `NG-2` — No resolver-level or behavioral description: what an operation does
  "under the hood," what other APIs or datastores it calls. (Milestone 4.)
- `NG-3` — No backend source-code ingestion of any kind. M1's only inputs are SDL
  and introspection.
- `NG-4` — No consumer/visualizer tooling. M1 produces bundles; reading them is
  left to existing OKF consumers.
- `NG-5` — No semantic enrichment beyond what the schema states. graphql-okf does
  not infer business meaning or intent that the schema does not express.
  LLM-assisted enrichment of descriptions is a Milestone 2 concern.
- `NG-6` — **No LLM inference at runtime.** All M1 output is a deterministic,
  mechanical function of the schema. The same source MUST always produce the same
  bundle. This is required by `GOAL-6.2` (no invented information), `GOAL-6.3`
  (faithful, non-paraphrased doc-strings), `GOAL-4.2` (byte-identical paths), and
  `GOAL-8.1` (idempotent no-op re-runs) — all of which non-deterministic
  generation would violate. AI is used to *build* graphql-okf (see `SETUP.md`), not
  to run it.

---

## 11. Definition of done (goal)

M1's functional goal is met when all of the following hold:

- `DOD-G-1` — Given an SDL file OR a live endpoint, graphql-okf produces a
  conformant OKF v0.1 bundle in which every concept has the required `type` field
  and every schema element is represented per the documented naming scheme.
- `DOD-G-2` — The bundle is fully cross-linked: type/argument/return/interface/
  union references render as Markdown links with intact referential integrity, and
  every directory has an `index.md`.
- `DOD-G-3` — Re-running against the same schema is a verified no-op (empty diff,
  no `log.md` entry).
- `DOD-G-4` — Re-running against a changed schema correctly adds, updates, and
  marks-removed the affected concepts; appends an ISO-8601 `log.md` entry; and
  preserves human-authored content — all demonstrated against fixture schemas.
- `DOD-G-5` — Both the library API and the CLI perform create and update, with
  directory output working and archive output at least available.
- `DOD-G-6` — SDL-sourced and introspection-sourced bundles of the same schema
  are equivalent per `GOAL-3.4`.
- `DOD-G-7` — The concept model and naming scheme are documented in the repo as
  the referenced source of truth, and the non-goals in §10 are respected (nothing
  federation- or resolver-related has crept in).
