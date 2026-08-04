# graphql-okf

![graphql-okf project banner](https://raw.githubusercontent.com/ayrtonvwf/graphql-okf/main/docs/images/README_project_banner.png)

## 💡 What is `graphql-okf`?

`graphql-okf` is an automated tool that turns a GraphQL blueprint into a Google's OKF compliant bundle of Markdown documentation that **AI agents** can easily read.

Even better: whenever your API changes, running `graphql-okf` automatically updates the documentation **without overwriting your custom notes**, while keeping a log of what changed between versions so you AI agent don't get lost in time.

## Project Status

> **Status: pre-alpha, but generation and updates work.** The package is
> published as `0.1.0` under the `next` tag. Bundle generation — from an SDL
> file or a live introspection endpoint, via a library call or the CLI — and
> reconciling an existing bundle against an evolved schema are both
> implemented and tested end to end (see [Usage](#usage) and
> [Examples](#examples) below). See [Status & roadmap](#status--roadmap) for
> what's left.

## How it works

`graphql-okf` reads a GraphQL API's public interface — from an SDL file or a live
introspection endpoint — and produces a conformant OKF bundle describing it: a
directory of cross-linked Markdown files with YAML frontmatter that any human or
AI agent can read without special tooling.

It doesn't just generate once — it **keeps the bundle up to date**: re-running
against an evolved schema reconciles the existing bundle — adding new
concepts, updating changed ones, marking removed ones, preserving any
human-authored notes, and recording the change in a log — so the bundle stays
a faithful, versioned map of the interface over time. See
[Updating a bundle](#updating-a-bundle) for the details.

Milestone 1 is **fully deterministic**: the bundle is a mechanical function of the
schema, with no LLM involved at runtime, so the same source always produces the
same output (aside from the generation timestamp recorded in each file's
frontmatter).

The first beneficiary is anyone integrating against the API who wants an accurate,
agent-readable map of what it exposes and how its types relate.

### Built-in scalars and spec directives

The bundle describes *your* schema, not GraphQL itself. The five built-in scalars
(`Boolean`, `Float`, `ID`, `Int`, `String`) and the five spec directives
(`@deprecated`, `@include`, `@oneOf`, `@skip`, `@specifiedBy`) therefore get no
concept files, and references to them render as plain code — `` `ID!` `` rather
than a link. Their meaning comes from the GraphQL specification, which every
consumer of the bundle already has; a page restating it is bytes an agent pays
for and a link inviting a turn spent re-reading what it knew.

Everything schema-specific is unaffected: custom scalars keep their files
(including their `@specifiedBy` URL), custom directives keep theirs, and an
*applied* spec directive still appears — `PaymentInput` renders
``Directives: `@oneOf`.`` — because which types carry it is a fact about your
schema. `OKF §6.1` and this project's `GOAL-7.3` both allow the omission provided
the convention is consistent and documented; the bundle's own root `index.md`
states it too, so an agent traversing the tree reads it before it can notice
anything missing.

### Signatures in index files

An index row for an operation or a directive carries its full GraphQL SDL
signature as the link text:

    * [`products(filter: ProductFilter, first: Int = 20): [Product!]!`](/queries/products.md) - Lists products, most recently created first.

so "what does this take, and what does it return?" is answered by the directory
listing rather than by opening the file. Type names inside a signature are not
links — a Markdown code span cannot contain one, and linking each would roughly
double the row; each names a concept file listed in `/types/index.md`. Each index
that carries signatures says so in a note above its list.

### The generated region

Every file graphql-okf owns is split by two markers:

    <!-- graphql-okf:generated:start -->
    ...regenerated from the schema on every run...
    <!-- graphql-okf:generated:end -->
    ...yours, preserved forever...

Everything between the markers is rewritten on each run — edit it and your edit
is gone next sync. Everything below the end marker is human-authored and is
never touched (`GOAL-8.3`), which is where notes, ownership, and links to
internal docs belong.

Bundles written before this rule was hoisted out of the files repeated it as an
HTML comment in every file. Running a current release strips that comment from
files whose human region is otherwise empty, and leaves it alone in any file a
human has written in.

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
path. `--out` is a directory: if it doesn't exist yet or is empty,
`graphql-okf` writes a fresh bundle; if it already holds a bundle
`graphql-okf` generated, running the same command again **reconciles** it
against the current schema instead of overwriting it — see
[Updating a bundle](#updating-a-bundle).

```sh
# From a live endpoint (introspection)
graphql-okf https://countries.trevorblades.com/graphql --out okf/countries-api

# From a local SDL file
graphql-okf ./schema.graphql --out okf/my-api

# Re-run the exact same command any time the schema changes — it updates
# the existing bundle in place.
graphql-okf https://countries.trevorblades.com/graphql --out okf/countries-api
```

Two optional flags make a run reproducible, which matters when the bundle is
committed to git:

- `--now <iso-8601>` pins the timestamp written to new and changed concepts
  instead of using the wall clock.
- `--resource <url-or-id>` sets the bundle-wide origin, recorded as the
  `resource` field on the root `index.md`. Each concept's own `resource`
  field is derived from it as `<origin>#<Anchor>` (see
  `src/emit/render/resource.ts`). Without `--resource`, an SDL source records
  a `file:` URL for its own path (via `pathToFileURL`), which differs between
  machines.
- `--okf-version <0.1|0.2>` selects the OKF spec version to emit. Defaults to
  `0.2`. v0.2 records provenance as `generated: {by, at}`; v0.1 recorded it as a
  flat `timestamp`. Pass `0.1` only if you have a consumer pinned to it.

```sh
graphql-okf examples/shop-api/v1.graphql \
  --out okf/shop-api \
  --now 2026-01-15T09:00:00.000Z \
  --resource https://shop.example/graphql
```

### Library

```ts
import { syncOkfBundle } from "graphql-okf";

await syncOkfBundle({
  source: { kind: "endpoint", url: "https://countries.trevorblades.com/graphql" },
  // or: { kind: "sdl", path: "./schema.graphql" }
  outDir: "okf/countries-api",
});
```

`syncOkfBundle` is the single entry point for both creating and updating a
bundle: it creates one from scratch when `outDir` is missing or empty, and
reconciles an existing one otherwise.

## Updating a bundle

A bundle produced by `graphql-okf` is **safe to re-run against**. Point the
same CLI invocation (or `syncOkfBundle` call) at an evolved schema and the
existing bundle is reconciled in place rather than overwritten:

- **Human edits below the marker are preserved.** Each concept file has a
  generated region bounded by `graphql-okf:generated:start` /
  `graphql-okf:generated:end` markers. Anything you write **below** the
  `graphql-okf:generated:end` marker is left untouched across re-runs.
  Edits made **inside** the generated region are not preserved — that region
  is a mechanical function of the schema and is rewritten on every run.
- **Removed elements are tombstoned, not deleted.** If a type, field, or
  operation disappears from the schema, its file is kept and marked
  `status: removed` in its frontmatter (with a `removedAt` timestamp and a
  note in the body) rather than being deleted. If the element reappears in a
  later schema, the tombstone is cleared and the file is restored.
- **Every change is logged.** `log.md` at the root of the bundle records
  every concept added, changed, or removed on each run, so the bundle's
  history is auditable without relying on git blame.
- **Unknown frontmatter keys are preserved.** Any YAML frontmatter key that
  isn't one `graphql-okf` itself writes (for example, a human-added
  `owner: platform-team` note) survives reconciliation unchanged. This does
  *not* apply to non-root `index.md` files: OKF §6 requires non-root indexes
  to carry no frontmatter at all, so any frontmatter block a human adds to one
  is removed on the next run — this is intentional, not a bug.
- Re-running against an **unchanged** schema is a no-op: byte-identical
  files, no `log.md` entry — this is the determinism guarantee M1 requires
  (see [`GOAL-M1.md`](docs/northstar-specs/GOAL-M1.md)).

#### Migrating a v0.1 bundle

A v0.2 run against a bundle written by an older release migrates it in place:
each concept's `timestamp` becomes `generated: {by, at}`, keeping the original
timestamp as `at` so provenance survives, and the root `index.md` starts
declaring `okf_version: "0.2"`. Human-authored frontmatter keys and prose are
untouched. The run records a single line in `log.md`:

    **Migrated**

    * OKF bundle format 0.1 → 0.2 (`timestamp` → `generated`) across 43 concepts.

A bundle written before this convention has its built-in concept files removed on
the next run — deleted outright rather than marked removed, since a tombstone is
larger than the page it replaces. A file you have written into is never deleted:
it keeps your text and is marked removed like any other retired concept. The run
records the count:

    **Migrated**

    * Built-in scalars and spec directives: 10 concepts no longer emitted (GOAL-7.3).

Migration is idempotent and resumable — a re-run is a byte-identical no-op, and
an interrupted run is finished by the next one. The reverse is refused:
`--okf-version 0.1` against a v0.2 bundle errors rather than silently discarding
v0.2-only fields.

## Examples

Three bundles generated with the current build are checked into this repo /
documented here:

- [`okf/countries-api/`](okf/countries-api/) — the full generated bundle for
  the small, public [Countries GraphQL API][countries-api], committed as a
  real, browsable example. Start at
  [`okf/countries-api/index.md`](okf/countries-api/index.md).
- [`okf/shop-api/`](okf/shop-api/) — a bundle for the example shop API in
  [`examples/shop-api/`](examples/shop-api/), generated by running the tool
  against three successive versions of that schema. Start at
  [`okf/shop-api/log.md`](okf/shop-api/log.md) to see what each version changed,
  then browse from [`okf/shop-api/index.md`](okf/shop-api/index.md). Unlike the
  Countries bundle it needs no network access, so `pnpm test` reproduces it
  exactly.
- `okf/gitlab-api/` — generated from GitLab's public GraphQL API
  (`https://gitlab.com/api/graphql`). At ~5,000 files and ~21 MB, it's too
  large to check into this repo, so it's gitignored here; reproduce it
  locally with:

  ```sh
  graphql-okf https://gitlab.com/api/graphql --out okf/gitlab-api
  ```

Links inside these samples are **bundle-root-absolute** (`/types/Product.md`),
following OKF §6.1's recommendation. GitHub's file browser resolves a leading `/`
against the repository root, so cross-links in these samples will not resolve
when clicked on github.com. Clone the repo, or point a tool at the bundle
directory, to follow them.

Countries and GitLab were generated with the exact CLI invocations shown in
[Usage](#usage) above, against each API's live introspection endpoint;
shop-api was generated from the local SDL files in
[`examples/shop-api/`](examples/shop-api/) using the `--now`/`--resource`
invocation shown in [CLI usage](#cli).

## Status & roadmap

M1 ("frontend-only utility", see [Milestones](#milestones)) is split into four
sub-projects; the first three are done, the last is in progress:

- ✅ **Concept model & naming scheme** — projects a GraphQL schema into an
  in-memory IR with the deterministic file path for every concept baked in.
- ✅ **Emitter** — turns that IR into the OKF bundle on disk (what's
  documented in [Usage](#usage) above): per-concept Markdown files with
  frontmatter, cross-links, and directory indexes, plus the CLI.
- ✅ **Reconciler** — re-running against an evolved schema updates an
  existing bundle in place (add/update/remove concepts, preserve
  human-authored edits, record a change log) instead of only writing into an
  empty directory. See [Updating a bundle](#updating-a-bundle).
- 🚧 **Delivery surface** — the rest of the CLI/library surface. The
  reproducibility flags (`--now`, `--resource`, see [CLI usage](#cli)) and the
  `--okf-version` flag (v0.1/v0.2 selection and in-place migration, see
  [Migrating a v0.1 bundle](#migrating-a-v01-bundle)) are done; still
  outstanding are request headers for authenticated
  introspection, config files, and running as a scheduled/CI job that opens a
  diff when the upstream schema changes. Archive/tarball output is *not*
  planned — it's an explicit non-goal (`NG-7`).

Follow the [milestones](#milestones) above for what comes after M1.

## License

[MIT](LICENSE) © ayrtonvwf

[okf]: https://github.com/GoogleCloudPlatform/knowledge-catalog
[countries-api]: https://github.com/trevorblades/countries
