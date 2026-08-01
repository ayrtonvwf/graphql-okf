# graphql-okf benchmark

Measures whether a coding agent given an OKF bundle is more accurate and cheaper
than the same agent given a GraphQL MCP server, or nothing at all.

Design: [`docs/superpowers/specs/2026-07-28-benchmark-harness-design.md`](../docs/superpowers/specs/2026-07-28-benchmark-harness-design.md).
Issue: [#12](https://github.com/ayrtonvwf/graphql-okf/issues/12).

## What it measures

Three scenarios × three cases × three trials = 27 agent runs.

| Scenario | What the agent gets |
| --- | --- |
| `okf-bundle` | The OKF bundle, generated fresh into its working directory |
| `graphql-mcp` | A GraphQL MCP server pointed at a mock endpoint serving the same schema |
| `baseline` | Nothing |

Everything else is identical: same pinned model, same system prompt, same tools,
same prompts, same fixture, same grading. That single-variable property is what
the numbers rest on — see `src/scenarios.ts`, whose `Scenario` type deliberately
has no field for anything else.

## Running it

Costs real money. Never runs in CI.

The `bench` and `judge` scripts run with `--env-file-if-exists=.env`, so create
`bench/.env` (copy `bench/.env.example`) with your `ANTHROPIC_API_KEY` and
`MCP_CONNECTION_NONBLOCKING` instead of exporting them manually.

```bash
pnpm --filter graphql-okf-bench run bench      # execute the matrix
pnpm --filter graphql-okf-bench run judge      # grade the artifacts
pnpm --filter graphql-okf-bench run report     # aggregate into summary.md
```

Each command is resumable: `bench` skips cells that already have a `run.json`,
`judge` skips artifacts that already have a `judge.json`. Pass `--force` to redo.
`bench` also takes `--scenario`, `--case`, and `--trials` for a partial matrix.

## Results

Committed: `results/summary.md`, `results/manifest.json`, and every `judge.json` —
small, diffable, and the evidence behind any published number. Gitignored:
transcripts, artifacts, and workspaces.

Errored cells are listed in the summary and excluded from aggregates, never
counted as zero.

## Known limits

- **Blinding is structural but not total.** The judge never sees the scenario and
  cannot import the scenario vocabulary, and obvious markers are scrubbed. A `qa`
  answer that says "according to the bundle" still leaks. This removes systematic
  bias; it does not guarantee none.
- **One judging pass per artifact.** Judge variance is unmeasured.
- **n=3.** Enough to resist a single degenerate run, not enough for a confidence
  interval.

## Tests

```bash
pnpm --filter graphql-okf-bench run test
```

Covers the pure parts only — matrix expansion, scoring, scrubbing, aggregation,
result round-trips, workspace lifecycle, the mock server, and the fixture's
no-leak guards. Agent and judge calls are untested by design: they are the thing
being measured.
