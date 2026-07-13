# graphql-okf — M1 Setup Specification

**Status:** Draft
**Scope:** Milestone 1 (frontend-only utility)
**Audience:** Anyone (human or agent) bootstrapping or maintaining the repository

This document specifies the tooling, infrastructure, and automation that must be
in place for M1. It is the *how we build it* spec. The *what we build* lives in
the per-milestone `GOAL-M*.md` files alongside it (currently `GOAL-M1.md`).
Neither kind of file should duplicate the other: if a requirement is about the
shape of the delivered software, it belongs in the relevant `GOAL-M*.md`;
if it is about the machinery that produces and guards that software, it belongs
here.

---

## 1. Guiding principles

1. **Small config surface.** Prefer one tool that does a job well over three that
   overlap. Every tool added here is a maintenance liability and a thing a
   contributor must learn.
2. **The pipeline enforces; discipline does not.** Local methodology (Superpowers)
   guides how code gets written, but CI is the objective backstop. A rule that
   is not checked in CI is a suggestion, not a requirement.
3. **Reproducible everywhere.** A clean checkout plus a single install command
   must produce an environment that passes the same checks locally and in CI.
   Node and package-manager versions are pinned, not floating.
4. **The public API is a product.** This is a published library. Its exported
   surface, its type declarations, and its build output are deliverables held to
   a higher standard than internal code.

---

## 2. Runtime and language baseline

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js 24 LTS | Pinned via `.nvmrc` and `engines` in `package.json`. |
| Language | TypeScript, `strict: true` | No implicit `any`; `noUncheckedIndexedAccess` on. |
| Module system | ESM-first | `"type": "module"`. Dual ESM/CJS emitted at build time. |
| Package manager | pnpm | Version pinned via `packageManager` field. |

**Requirements**

- `SETUP-2.1` — The repository MUST pin the Node version in `.nvmrc` and declare a
  compatible `engines.node` range in `package.json`.
- `SETUP-2.2` — The repository MUST pin the pnpm version via the `packageManager`
  field so CI and local installs resolve identically.
- `SETUP-2.3` — TypeScript MUST run in strict mode. The following compiler flags
  are required: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `verbatimModuleSyntax`. `tsc --noEmit` is the authoritative type gate.
- `SETUP-2.4` — A fresh checkout MUST reach a fully working dev environment via a
  single documented install command (`pnpm install`).

---

## 3. Repository layout

The M1 package is a single package. The layout anticipates M2/M3 becoming
separate packages, so it stays clean enough to lift into a workspace later
without disruption, but does NOT introduce a monorepo prematurely.

```
graphql-okf/
├── src/
│   ├── index.ts            # The public API. The ONLY intended entry point.
│   ├── ingest/             # Schema loading (SDL file, introspection endpoint)
│   ├── model/              # Internal concept model + naming scheme
│   ├── emit/               # OKF bundle emitter
│   └── reconcile/          # Idempotent update / diff logic
├── test/                   # Test files mirroring src/ (or colocated *.test.ts)
├── docs/
│   └── northstar-specs/    # SETUP.md + GOAL-M1.md + GOAL-M2.md
├── .github/workflows/      # CI + Claude automation
├── .claude/
│   └── skills/             # Committed Superpowers skills CI agents follow (§9.5)
├── plans/                  # Committed writing-plans output; the issue→@claude hand-off
├── CLAUDE.md               # Project facts + CI impl-workflow pointer (NOT methodology)
├── .nvmrc
├── biome.json
├── tsconfig.json
├── vitest.config.ts
├── tsup.config.ts
├── lefthook.yml
└── package.json
```

**Requirements**

- `SETUP-3.1` — All public exports MUST flow through `src/index.ts`. Nothing
  outside that file is part of the supported API.
- `SETUP-3.2` — The internal concept model and the file-naming scheme (defined in
  `GOAL-M1.md`) MUST live in `src/model/` as the single source of truth; emitter and
  reconciler consume it rather than re-deriving naming rules.
- `SETUP-3.3` — Tests MUST be discoverable by the test runner without per-file
  registration.

---

## 4. Test tooling (TDD substrate)

Test-Driven Development is the working method for M1. The tooling must make the
red-green loop fast and must make coverage an enforced gate rather than a report
nobody reads.

| Concern | Choice |
| --- | --- |
| Test runner | Vitest |
| Coverage provider | `@vitest/coverage-v8` |
| Assertion style | Vitest `expect` |

**Requirements**

- `SETUP-4.1` — Vitest MUST be the test runner, configured for native TS + ESM
  with watch mode available for local development.
- `SETUP-4.2` — Coverage MUST be collected via the v8 provider and MUST fail the
  run when below the configured thresholds.
- `SETUP-4.3` — Coverage thresholds for M1 are: **lines ≥ 90%, functions ≥ 90%,
  branches ≥ 85%, statements ≥ 90%.** The reconcile/diff logic is the correctness
  core of M1 and its module-level coverage MUST NOT fall below the global bar.
- `SETUP-4.4` — Tests MUST be deterministic. Any test touching a live endpoint
  MUST be isolated behind a tag/marker and MUST NOT run in the default `test`
  gate; the default gate runs against fixtures only.
- `SETUP-4.5` — A corpus of **fixture GraphQL schemas** (small SDL files plus at
  least one introspection JSON) MUST live in the repo and back the emitter and
  reconciler tests. Golden-file bundles (expected emitter output) are the
  preferred assertion mechanism for emitter tests.

---

## 5. Lint, format, and static quality

| Concern | Primary tool | Supplement |
| --- | --- | --- |
| Lint + format | Biome | `typescript-eslint` for type-aware rules only |
| Dead code / unused exports | knip | — |
| Type check | `tsc --noEmit` | — |

Biome owns lint + format as a single fast tool. Because this is a schema-parsing
library where types carry real semantic weight, a **narrow** type-aware ESLint
layer is permitted on top of Biome for the rules Biome cannot express (e.g.
`no-floating-promises`, exhaustiveness). knip guards the published surface against
unused exports and dead code.

**Requirements**

- `SETUP-5.1` — `biome ci` MUST check both lint and format without writing, and
  MUST fail on any violation.
- `SETUP-5.2` — Formatting MUST be enforced, not advisory. There is one canonical
  format; CI rejects deviations.
- `SETUP-5.3` — If a type-aware ESLint layer is present, it MUST be scoped to
  rules Biome does not cover, to avoid duplicate or conflicting diagnostics.
- `SETUP-5.4` — knip MUST run in CI and flag unused files, dependencies, and
  exports. A finding fails the build unless explicitly whitelisted with a reason.

---

## 6. Build and packaging

The output is a published npm package consumed by API integrators. Build output
is a deliverable.

| Concern | Choice |
| --- | --- |
| Bundler | tsup (or tsdown) |
| Output | Dual ESM + CJS, with `.d.ts` declarations |
| Entry | `src/index.ts` |

**Requirements**

- `SETUP-6.1` — The build MUST emit ESM and CJS outputs plus type declarations.
- `SETUP-6.2` — `package.json` MUST declare correct `exports`, `main`, `module`,
  and `types` fields so both ESM and CJS consumers resolve correctly.
- `SETUP-6.3` — CI MUST run the build and fail if it errors or if declarations
  fail to emit. A broken build is a failed check even when tests pass.
- `SETUP-6.4` — The package MUST ship only build artifacts and essential metadata
  (via `files` allowlist or equivalent); source, tests, and fixtures MUST NOT be
  published.
- `SETUP-6.5` — Package publishing itself is out of scope for the M1 gate but the
  package MUST be *publishable* (a dry-run pack MUST succeed).

---

## 7. Commit hygiene (local pre-commit)

| Concern | Choice |
| --- | --- |
| Git hook manager | lefthook |

**Requirements**

- `SETUP-7.1` — A pre-commit hook MUST run Biome (lint + format) and a type check
  on staged files so that trivial failures are caught before they reach CI.
- `SETUP-7.2` — Hooks MUST be installed automatically on `pnpm install` (via a
  prepare step) so contributors do not have to opt in manually.
- `SETUP-7.3` — Hooks are a convenience, not the enforcement boundary. CI remains
  authoritative; a contributor who bypasses hooks is still stopped by CI.

---

## 8. Continuous integration (the enforcement boundary)

A single CI workflow runs on every pull request and on pushes to `main`. Jobs run
in parallel where possible. **These checks — not local discipline — are what
gate merges.**

Required jobs:

1. **lint** — `biome ci` (Node 24 only; runtime-independent)
2. **typecheck** — `tsc --noEmit` (Node 24 only; runtime-independent)
3. **test** — `vitest run --coverage` (fails under thresholds; **matrixed across
   Node 24 and Node 26**)
4. **build** — bundler build + declaration emit (**matrixed across Node 24 and
   Node 26**)
5. **deadcode** — knip (Node 24 only; runtime-independent)

**Requirements**

- `SETUP-8.1` — CI MUST run on `pull_request` and on push to `main`.
- `SETUP-8.2` — All jobs above MUST be configured as **required status checks** on
  the `main` branch protection rule. Where a job is matrixed (§8.6), **every
  expanded per-version check** (e.g. `test (24)`, `test (26)`, `build (24)`,
  `build (26)`) MUST be individually required. The workflow existing is not
  enough; merges MUST be blocked until every required check passes.
- `SETUP-8.3` — CI MUST use the pinned pnpm version and a cached, frozen-lockfile
  install (`pnpm install --frozen-lockfile`) so a drifting lockfile fails rather
  than silently resolving new versions. Runtime-independent jobs use Node 24; the
  Node version for matrixed jobs is supplied by the matrix (§8.6).
- `SETUP-8.4` — `main` MUST require at least one approving review and MUST forbid
  direct pushes; all changes land via PR.
- `SETUP-8.5` — CI MUST run on the commits Claude pushes (see §10.4). A PR whose
  checks did not run MUST NOT be mergeable.
- `SETUP-8.6` — The **test** and **build** jobs MUST run as a matrix across
  **Node 24 and Node 26**, with `fail-fast: false` so both versions always report
  independently. Node 24 is the supported floor (§2); Node 26 verifies forward
  compatibility ahead of its LTS promotion. **Both versions are required status
  checks** — a regression on either engine blocks merge. Runtime-independent jobs
  (lint, typecheck, deadcode) run once, on Node 24, and MUST NOT be matrixed.

---

## 9. Development methodology (Superpowers)

Superpowers (`obra/superpowers`) is the methodology engine. It owns the per-task
discipline: brainstorm → git worktree → plan → subagent-driven development with
TDD inside → fresh-agent code review → finish. Its TDD skill enforces
red-green-refactor with far more rigor than a prose instruction would survive over
a long context.

Superpowers is used in **two contexts** that split along its own workflow seam:

- **Locally (the "define" half).** Brainstorming and `writing-plans` are
  interactive and human-in-the-loop — brainstorming refuses to write code until a
  design is accepted, and `writing-plans` emits a plan file of bite-sized tasks
  with exact file paths and per-task verification steps. This is done on the
  contributor's machine.
- **In CI (the "implement" half).** Once a plan is committed, an issue tagged
  `@claude` / `@claude-opus` (§10) hands the plan to the action, which executes it
  task-by-task under the TDD skill.

The crucial mechanical difference: locally, a SessionStart hook injects the
Superpowers bootstrap so skills load automatically. **CI has no such hook.** For
the CI agent to follow the same methodology, the skills must be present in the
checkout and explicitly referenced — see `SETUP-9.5`/`SETUP-9.6`.

**Requirements**

- `SETUP-9.1` — Superpowers MUST be installed in each contributor's Claude Code
  harness via the official marketplace for local use. This is how the "define"
  half (brainstorming, planning) runs.
- `SETUP-9.2` — Methodology (how to write code: TDD cadence, brainstorming,
  review) MUST NOT be duplicated into `CLAUDE.md` as *rules*. Superpowers owns
  methodology; `CLAUDE.md` owns project facts (stack, naming scheme, thresholds,
  entry points) plus a thin *pointer* to the relevant skills for CI runs
  (`SETUP-9.6`) — not a restatement of their contents.
- `SETUP-9.3` — For M1, Superpowers' `writing-plans` output IS the task
  decomposition. A separate task-management system (e.g. Task Master) is NOT
  required for M1 and SHOULD be deferred until M2 splits the repository.
- `SETUP-9.4` — The distinction MUST be respected: Superpowers *guides* authoring
  (locally and in CI); CI's §8 pipeline *enforces* outcomes. In an autonomous CI
  run there is no human watching the red-green loop, so the coverage thresholds
  (`SETUP-4.3`) — not the skill — are the guarantee that tests exist and pass. The
  skill shapes how the agent works; the gate decides mergeability.
- `SETUP-9.5` — **Skills committed to the repo.** To make the methodology
  available to CI agents (which have no marketplace install and no SessionStart
  hook), the Superpowers skills that the CI workflow depends on — at minimum
  `test-driven-development` and the plan-execution skill — MUST be committed into
  the repository (e.g. under `.claude/skills/`) and version-controlled, so they
  are present in the action's checkout. Local contributors may still use their
  marketplace install; the committed copy is what CI reads.
- `SETUP-9.6` — **Explicit CI reference.** Because CI does not auto-inject the
  bootstrap, `CLAUDE.md` MUST contain an implementation-workflow section
  instructing the agent, when asked to implement a committed plan, to load and
  follow the committed `test-driven-development` and plan-execution skills, work
  one task at a time, and run each task's verification step. This pointer is the
  CI substitute for the local SessionStart hook.
- `SETUP-9.7` — **The plan is the hand-off artifact.** The issue→`@claude` loop
  MUST reference a committed plan file (from local `writing-plans`) rather than
  re-deriving the design in CI. Brainstorming and planning are human-in-the-loop
  and are NOT performed by the CI agent; CI executes an already-approved plan.

---

## 10. Agent automation on GitHub (@claude)

The official `anthropics/claude-code-action@v1` provides asynchronous agent help
on issues and PRs. v1 auto-detects mode, so no `mode:` input is set. The live
workflow lives at `.github/workflows/` and is the source of truth; this section
records the invariants it MUST uphold.

The workflow runs **two parallel jobs distinguished by trigger phrase**, so the
author can pick a model per request:

- **`@claude` → `claude-sonnet-5`** — the default, for routine implementation and
  review.
- **`@claude-opus` → `claude-opus-4-8`** — for harder, multi-file or
  higher-reasoning work.

Both jobs share an identical tool allowlist and post-run backstop; they differ
only in trigger phrase and `--model`.

**Requirements**

- `SETUP-10.1` — The action MUST be pinned to `@v1` (or a specific SHA) and
  authenticated via a `CLAUDE_CODE_OAUTH_TOKEN` stored as a repository secret. The
  token MUST NEVER appear in workflow files or logs.
- `SETUP-10.2` — Workflow permissions MUST be the minimal working set:
  `contents: write`, `pull-requests: write`, `issues: write`, `id-token: write`,
  `actions: read` (the last so Claude can read CI results on PRs).
- `SETUP-10.3` — **Author gate (owner-only).** Every job's `if:` MUST require
  `github.actor == github.repository_owner` in addition to the trigger-phrase
  check, so only the repo owner can spend tokens. `github.actor` is the account
  that triggered the event and cannot be spoofed in a comment body. This gate is
  stricter than a bot-loop guard and also prevents `claude[bot]` from
  re-triggering itself.
- `SETUP-10.4` — **Trigger-phrase separation.** Because `@claude-opus` contains
  the substring `@claude`, the Sonnet job's gate MUST explicitly exclude
  `@claude-opus` on every event surface (comment body, review body, issue body,
  issue title), or both jobs would fire on an Opus mention. Each job MUST also
  pass its own `trigger_phrase` to the action (`@claude` / `@claude-opus`), since
  the action re-checks the body separately from the job `if:` and defaults to
  `@claude`.
- `SETUP-10.5` — **Model selection.** The action has no `model:` input; the model
  MUST be passed through `claude_args` as `--model`, or it is silently ignored and
  the default runs. Sonnet 5 for `@claude`, Opus 4.8 for `@claude-opus`.
- `SETUP-10.6` — **Pre-installed toolchain.** Each job MUST check out the repo,
  set up pnpm + Node (from `.nvmrc`), run `pnpm install --frozen-lockfile`, and
  put `node_modules/.bin` on `PATH` *before* invoking the action, so Claude can
  validate and fix its own changes offline. Without this, every agent PR ships
  unvalidated and relies solely on the §8 checks.
- `SETUP-10.7` — **Tool allowlist.** `claude_args` MUST pass an `--allowedTools`
  list covering the project's real toolchain (install, the `format`/`lint`/
  `typecheck`/`build`/`coverage`/`test` pnpm scripts, the `biome` binary the
  pre-commit hook invokes, `lefthook`, `mkdir`/`mv`, and the `gh pr` verbs), using
  `:*` prefix wildcards so both bare and argument forms match. The two jobs'
  allowlists MUST be kept identical.
- `SETUP-10.8` — **CI-side format backstop.** Because the lefthook pre-commit hook
  runs Biome inside Claude's sandboxed Bash tool — where its fixers can silently
  no-op for lack of an approver — each job MUST end with a non-sandboxed step that
  runs the formatter (`pnpm run format`), and if anything changed, commits and
  pushes a fixup as `claude[bot]`. This step MUST be skipped on the default branch
  so a mention on `main` or an issue can never auto-push.
- `SETUP-10.9` — Because CI does not fire on commits authored by the default
  Actions user, agent commits MUST be pushed such that the §8 checks run on the
  resulting PR (the backstop step in §10.8 pushes via a token that re-triggers
  CI). A green pipeline on agent work is non-negotiable.
- `SETUP-10.10` — Fork PRs MUST NOT expose secrets. The default `pull_request`
  behavior (no secret access from forks) MUST be preserved; `pull_request_target`
  MUST NOT be used to run untrusted fork code. (The owner-only gate in §10.3
  already blocks non-owner triggers regardless.)
- `SETUP-10.11` — Cost discipline: every mention is a full billed agent run, so
  requests SHOULD be batched into one comment. The owner-only gate (§10.3) is the
  primary spend control.

---

## 11. Repository documents

**Requirements**

- `SETUP-11.1` — `CLAUDE.md` at the repo root MUST state project facts: stack,
  the OKF concept-model naming scheme, coverage thresholds, the single public
  entry point, and any conventions an agent needs. It MUST NOT restate TDD/SDD
  methodology (owned by Superpowers), but it MUST include the thin
  implementation-workflow pointer required by `SETUP-9.6` (telling a CI agent to
  load and follow the committed skills when executing a plan).
- `SETUP-11.2` — `README.md` MUST document install, the single dev-environment
  command, how to run each CI check locally, and the build command.
- `SETUP-11.3` — The northstar spec files (`SETUP.md` plus the per-milestone
  `GOAL-M*.md`) MUST be committed under `docs/northstar-specs/` and kept in sync
  with reality; when the setup changes, `SETUP.md` changes in the same PR, and
  when a milestone's requirements change, that milestone's `GOAL-M*.md` changes
  in the same PR.

---

## 12. Definition of done (setup)

M1 setup is complete when all of the following hold:

- `DOD-S-1` — A fresh clone reaches a working dev environment with one install
  command, using pinned Node and pnpm.
- `DOD-S-2` — `pnpm test` runs Vitest with coverage and enforces the §4.3
  thresholds against the fixture corpus.
- `DOD-S-3` — `biome ci`, `tsc --noEmit`, the build, and knip all run clean
  locally and in CI.
- `DOD-S-4` — CI runs all five jobs on PRs and on `main`, with **test** and
  **build** matrixed across Node 24 and Node 26; every expanded check (including
  both engines) is a required status check; `main` forbids direct pushes and
  requires one review.
- `DOD-S-5` — Pre-commit hooks install automatically and run lint + typecheck on
  staged files.
- `DOD-S-6` — Both agent jobs (`@claude` → Sonnet 5, `@claude-opus` → Opus 4.8)
  are present, minimally permissioned, owner-gated with correct trigger-phrase
  separation, pre-install the toolchain with an identical allowlist, run the
  default-branch-skipped format backstop, and CI fires on the commits they push.
- `DOD-S-7` — The package builds to dual ESM/CJS with declarations and passes a
  publish dry-run.
- `DOD-S-8` — `CLAUDE.md`, `README.md`, and both M1 spec files are committed and
  accurate.
