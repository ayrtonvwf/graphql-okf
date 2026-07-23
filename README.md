# graphql-okf

Generate and maintain an [Open Knowledge Format (OKF)][okf] bundle from a GraphQL
API's schema.

> **Status: pre-alpha, but generation works.** The published package is still a
> `0.0.0` placeholder under the `next` tag. One-shot bundle generation — from an
> SDL file or a live introspection endpoint, via a library call or the CLI — is
> implemented and tested end to end (see [Usage](#usage) and
> [Examples](#examples) below). Reconciling an existing bundle against an
> evolved schema (keeping it up to date across re-runs) is not implemented yet;
> see [Status & roadmap](#status--roadmap).

## What it does

`graphql-okf` reads a GraphQL API's public interface — from an SDL file or a live
introspection endpoint — and produces a conformant OKF bundle describing it: a
directory of cross-linked Markdown files with YAML frontmatter that any human or
AI agent can read without special tooling.

Eventually it won't just generate once. It will **keep the bundle up to date**:
re-running against an evolved schema will reconcile the existing bundle — adding
new concepts, updating changed ones, marking removed ones, preserving any
human-authored notes, and recording the change in a log — so the bundle stays a
faithful, versioned map of the interface over time. Today, generation is
one-shot: `graphql-okf` refuses to write into a non-empty output directory
rather than overwrite or merge, and reconciliation is planned but not yet built.

Milestone 1 is **fully deterministic**: the bundle is a mechanical function of the
schema, with no LLM involved at runtime, so the same source always produces the
same output (aside from the generation timestamp recorded in each file's
frontmatter).

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

The specifications live in [`docs/northstar-specs/`](docs/northstar-specs/):

- [`GOAL-M1.md`](docs/northstar-specs/GOAL-M1.md) — what M1 delivers (functional requirements). The current focus.
- [`GOAL-M2.md`](docs/northstar-specs/GOAL-M2.md) — the M2 LLM-enrichment milestone (planned).
- [`SETUP.md`](docs/northstar-specs/SETUP.md) — the tooling and infrastructure required
  to build it.

## Developing

The runtime and package manager are pinned (Node `>=24`, see `.nvmrc`; pnpm, see
the `packageManager` field), so a clean checkout only needs:

```sh
pnpm install
```

This also installs the git pre-commit hook (lint + typecheck on staged files).

Each CI check can be run the same way locally:

| Check | Command |
| --- | --- |
| Lint + format check | `pnpm run lint` |
| Auto-format | `pnpm run format` |
| Type check | `pnpm run typecheck` |
| Tests (fast, no coverage) | `pnpm test` (watch: `pnpm run test:watch`) |
| Tests + coverage (the enforced gate) | `pnpm run coverage` |
| Dead code / unused exports | `pnpm run knip` |
| Build (dual ESM/CJS + `.d.ts`, plus the CLI bundle) | `pnpm run build` |

See [`docs/northstar-specs/SETUP.md`](docs/northstar-specs/SETUP.md) for the
full tooling spec these commands implement.

## Why OKF

OKF is an open, vendor-neutral format published by Google Cloud that represents
knowledge as a directory of Markdown files with YAML frontmatter — each file one
concept, its path its identity, files interlinked as a graph. It's "just files,"
so a bundle ships in any git repo, renders on GitHub, and is read (and written) by
agents without an SDK. GraphQL's introspectable, strongly-typed schema maps
naturally onto that model, and no GraphQL-to-OKF converter exists yet.

## Usage

### CLI

```sh
graphql-okf <sdl-path-or-endpoint-url> --out <dir>
```

The source is detected automatically: an `http://`/`https://` argument is
queried live via introspection; anything else is read as a local SDL file
path. `--out` must be a directory that doesn't exist yet or is empty —
`graphql-okf` writes a fresh bundle and never overwrites existing files.

```sh
# From a live endpoint (introspection)
graphql-okf https://countries.trevorblades.com/graphql --out okf/countries-api

# From a local SDL file
graphql-okf ./schema.graphql --out okf/my-api
```

### Library

```ts
import { createOkfBundle } from "graphql-okf";

await createOkfBundle({
  source: { kind: "endpoint", url: "https://countries.trevorblades.com/graphql" },
  // or: { kind: "sdl", path: "./schema.graphql" }
  outDir: "okf/countries-api",
});
```

## Examples

Two bundles generated with the current build are checked into this repo /
documented here:

- [`okf/countries-api/`](okf/countries-api/) — the full generated bundle for
  the small, public [Countries GraphQL API][countries-api], committed as a
  real, browsable example. Start at
  [`okf/countries-api/index.md`](okf/countries-api/index.md).
- `okf/gitlab-api/` — generated from GitLab's public GraphQL API
  (`https://gitlab.com/api/graphql`). At ~5,000 files and ~21 MB, it's too
  large to check into this repo, so it's gitignored here; reproduce it
  locally with:

  ```sh
  graphql-okf https://gitlab.com/api/graphql --out okf/gitlab-api
  ```

Both were generated with the exact CLI invocations shown in [Usage](#usage)
above, against each API's live introspection endpoint.

## Status & roadmap

M1 ("frontend-only utility", see [Milestones](#milestones)) is split into four
sub-projects; the first two are done, the other two are not started:

- ✅ **Concept model & naming scheme** — projects a GraphQL schema into an
  in-memory IR with the deterministic file path for every concept baked in.
- ✅ **Emitter** — turns that IR into the OKF bundle on disk (what's
  documented in [Usage](#usage) above): per-concept Markdown files with
  frontmatter, cross-links, and directory indexes, plus the CLI.
- ⬜ **Reconciler** — re-running against an evolved schema updates an
  existing bundle in place (add/update/remove concepts, preserve
  human-authored edits, record a change log) instead of only writing into an
  empty directory.
- ⬜ **Delivery surface** — the rest of the CLI/library surface: request
  headers for authenticated introspection, config files, `--force`/overwrite
  semantics, archiving previous bundle versions.

Follow the [milestones](#milestones) above for what comes after M1.

## License

[MIT](LICENSE) © ayrtonvwf

[okf]: https://github.com/GoogleCloudPlatform/knowledge-catalog
[countries-api]: https://github.com/trevorblades/countries
