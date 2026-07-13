# graphql-okf

Generate and maintain an [Open Knowledge Format (OKF)][okf] bundle from a GraphQL
API's schema.

> **Status: pre-alpha.** This is an early work in progress. The published package
> is a `0.0.0` placeholder under the `next` tag — nothing is usable yet. This
> README describes the intended project so the vision is committed before the
> build exists. Expect everything below to be aspirational until the milestones
> land.

## What it will do

`graphql-okf` reads a GraphQL API's public interface — from an SDL file or a live
introspection endpoint — and produces a conformant OKF bundle describing it: a
directory of cross-linked Markdown files with YAML frontmatter that any human or
AI agent can read without special tooling.

Crucially, it doesn't just generate once. It **keeps the bundle up to date**:
re-running against an evolved schema reconciles the existing bundle — adding new
concepts, updating changed ones, marking removed ones, preserving any
human-authored notes, and recording the change in a log — so the bundle stays a
faithful, versioned map of the interface over time.

Milestone 1 is **fully deterministic**: the bundle is a mechanical function of the
schema, with no LLM involved at runtime, so the same source always produces the
same output.

The first beneficiary is anyone integrating against the API who wants an accurate,
agent-readable map of what it exposes and how its types relate.

## Milestones

- **M1 — Frontend-only utility.** Describe the public GraphQL interface using only
  what's discoverable from the schema itself (SDL or introspection): types,
  fields, arguments, operations, enums, and the cross-links between them. Create
  and keep the bundle up to date. Fully deterministic — no LLM in the runtime.
  This is the current focus.
- **M2 — LLM-assisted enrichment.** Optionally enrich concept descriptions using
  an LLM, layered on top of the deterministic bundle so the schema-derived facts
  and the generated prose stay clearly separable.
- **M3 — Federation topology.** Detect whether the API is an Apollo Federation
  graph, enumerate its subgraphs, and map entity ownership.
- **M4 — Backend knowledge base.** Describe what operations do under the hood —
  resolver locations, downstream API and datastore calls — as an enriched bundle
  suitable for an AI agent maintaining a complex GraphQL backend.

Milestone 1 is deliberately scoped to the schema-derivable interface, produced by
a deterministic transform. It does not use an LLM at runtime, nor analyze
federation, resolvers, or backend behavior — those are later milestones.

## Specs

The full M1 specification lives in [`docs/northstar-specs/`](docs/northstar-specs/):

- [`GOAL-M1.md`](docs/northstar-specs/GOAL-M1.md) — what M1 delivers (functional requirements).
- [`GOAL-M2.md`](docs/northstar-specs/GOAL-M2.md) — the M2 LLM-enrichment milestone (planned).
- [`SETUP.md`](docs/northstar-specs/SETUP.md) — the tooling and infrastructure required
  to build it.

## Why OKF

OKF is an open, vendor-neutral format published by Google Cloud that represents
knowledge as a directory of Markdown files with YAML frontmatter — each file one
concept, its path its identity, files interlinked as a graph. It's "just files,"
so a bundle ships in any git repo, renders on GitHub, and is read (and written) by
agents without an SDK. GraphQL's introspectable, strongly-typed schema maps
naturally onto that model, and no GraphQL-to-OKF converter exists yet.

## Status & roadmap

Nothing here is usable yet. Follow the milestones above; M1 is being built first.
Installation, usage, and API docs will be added to this README as they become
real.

## License

[MIT](LICENSE) © ayrtonvwf

[okf]: https://github.com/GoogleCloudPlatform/knowledge-catalog
