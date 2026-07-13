# CLAUDE.md

Project facts and conventions for agents working in this repository. This file is
**not** a methodology document — how to write code (TDD cadence, brainstorming,
review) is owned by the Superpowers skills. This file states what the project *is*
and points CI agents at the skills they must follow.

## What this is

`graphql-okf` reads a GraphQL schema (SDL file or live introspection) and produces
— and keeps up to date — a conformant Open Knowledge Format (OKF) bundle
describing the API's interface. The full requirements live in
`docs/northstar-specs/GOAL-M1.md` (and `GOAL-M2.md` for the next milestone); the
tooling and process live in `docs/northstar-specs/SETUP.md`. When in doubt, those
specs win over this file.

- npm package name: **`graphql-okf`**. CLI command: **`graphql-okf`**.
- Milestone 1 is **fully deterministic** — no LLM at runtime. The same schema MUST
  always produce the same bundle. Do not add runtime model calls, non-deterministic
  ordering, or timestamp churn (see `M1/GOAL-8.1`, `M1/NG-6`).

## Stack

- Node.js **24** (floor; `engines.node` is `>=24`). CI also tests on **26**.
- TypeScript, `strict: true`, ESM-first. Package manager: **pnpm** (pinned).
- Test runner: **Vitest** (+ v8 coverage). Lint + format: **Biome** (with a narrow
  type-aware ESLint layer only where Biome can't express a rule). Dead code:
  **knip**. Build: **tsup** (dual ESM/CJS + declarations). Git hooks: **lefthook**.

## Key conventions

- **Single public entry point:** everything exported flows through `src/index.ts`.
  Nothing outside it is part of the supported API.
- **Naming scheme is the single source of truth.** The mapping from a schema
  element to a concept file path lives in `src/model/` and is consumed by both the
  emitter and the reconciler. Never re-derive paths independently (see `M1/GOAL-4.5`).
- **Determinism is load-bearing.** Re-running against an unchanged schema is a
  no-op: byte-identical paths, no content changes, no `log.md` entry.
- **Coverage thresholds are enforced, not aspirational:** lines ≥ 90%, functions
  ≥ 90%, branches ≥ 85%, statements ≥ 90%. A PR under threshold does not merge.

## Running checks locally

- Install: `pnpm install --frozen-lockfile`
- Test (fast, no coverage): `pnpm test` (watch: `pnpm run test:watch`)
- Test + coverage (the enforced gate): `pnpm run coverage`
- Lint + format check: `pnpm run lint`
- Auto-format: `pnpm run format`
- Type check: `pnpm run typecheck`
- Build: `pnpm run build`
- Dead-code check: `pnpm run knip` (or as configured)

CI runs all of these; **test** and **build** run on both Node 24 and 26. Every
expanded check is a required status check.

## Implementation workflow (for CI agents executing a plan)

Locally, the Superpowers SessionStart hook loads the skills automatically. **CI has
no such hook**, so when you are asked (e.g. via an issue tagged `@claude` or
`@claude-opus`) to implement work in this repository, follow this explicitly:

1. **The plan is the source of truth.** The issue will reference a committed plan
   file under `plans/`. Read it. Do **not** re-brainstorm or redesign — the design
   was already approved by a human locally. If no plan is referenced or the plan is
   unclear, stop and ask in a comment rather than improvising a design.
2. **Load and follow the committed skills** under `.claude/skills/`, at minimum:
   - `test-driven-development` — write a failing test first, watch it fail, write
     the minimal code to pass, then move on. Do not write implementation before
     its test. Do not backfill tests after the fact.
   - the plan-execution skill — work through the plan **one task at a time**, and
     run each task's stated verification step before moving to the next.
3. **Respect determinism (`M1/GOAL-8.1`, `M1/NG-6`).** No runtime LLM calls, no
   nondeterministic iteration order, no wall-clock-dependent output beyond the
   ISO-8601 timestamps the spec defines.
4. **Validate before opening the PR.** Run `pnpm run coverage`, `pnpm run lint`,
   `pnpm run typecheck`, and `pnpm run build`. The coverage thresholds above are
   the real gate — a plan-following PR with thin tests will still be blocked.
5. **Open a PR** referencing the issue and the plan file. Keep changes scoped to
   the plan; if you discover the plan is wrong, say so in the PR rather than
   silently expanding scope.

The skill guides *how* you work; the CI pipeline (`docs/northstar-specs/SETUP.md`
§8) decides whether the result can merge. When those two ever seem to conflict,
the pipeline's objective checks win.
