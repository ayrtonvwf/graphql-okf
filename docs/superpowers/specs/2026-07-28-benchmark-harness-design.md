# Benchmark harness — design

Resolves [issue #12](https://github.com/ayrtonvwf/graphql-okf/issues/12).

Issue #12 specified a methodology and deferred the harness to "separate future
work". This document is that work: an implementable design for the harness, its
fixture, its cases, and its grading. Where it departs from #12, the departure is
called out and justified.

## Goal

Produce defensible numbers for the claim that `graphql-okf` makes a coding agent
more accurate and cheaper to run against a GraphQL API it wasn't trained on.

The measurement is a 3×3×3 matrix — three scenarios (`okf-bundle`,
`graphql-mcp`, `baseline`) × three test cases × three trials = 27 agent runs —
scored for accuracy by an LLM judge against checked-in rubrics, and for token
consumption from the Agent SDK's usage stats.

The benchmark's credibility rests on one property: **across scenarios, exactly
one variable moves.** Same model, same system prompt, same tools, same prompts,
same fixture, same grading. Only the context available to the agent differs.
Most of the decisions below exist to enforce that property structurally rather
than by discipline.

## Decisions

| Question | Decision |
| --- | --- |
| Relationship to the shipped package | `bench/` is a separate, private pnpm workspace package |
| What backs `graphql-mcp` | Mock GraphQL server (`graphql-yoga`) + off-the-shelf GraphQL MCP |
| How context is delivered | Identical tool loop; scenarios differ only in workspace contents and registered MCP servers |
| Fixture typing | Untyped transport, narrow local types only — no codegen, no SDL copy |
| Agent verification affordance | No Bash; edit-only |
| Judge input | Blinded, final artifact only |
| Rubric shape | Weighted pass/fail criteria checklist |
| Orchestration | Resumable, one result file per cell |
| Committed results | Summary + judge scores + manifest; transcripts and diffs gitignored |
| Runner structure | One generic runner over declarative scenario/case descriptors |

Departures from #12, deliberately: #12 describes "a Claude Agent SDK script per
scenario". Three sibling scripts each constructing an agent session will drift,
and drift between them is indistinguishable from a real finding — a stray
sentence in one scenario's system prompt silently becomes the result. The runner
is therefore shared code, and scenarios are data with a narrow declared surface.

---

## 1. Repository integration

`bench/` is its own workspace package, `graphql-okf-bench`, marked
`private: true`. A new root `pnpm-workspace.yaml` declares `.` and `bench`.

It depends on `graphql-okf` via `workspace:*`, so the bundle under test is
always produced by the working tree rather than a stale publish.

This isolation is not cosmetic. `CLAUDE.md` binds the shipped package to full
determinism (`M1/GOAL-8.1`, `M1/NG-6`) and to enforced coverage thresholds. A
benchmark is nondeterministic, costs money per invocation, and *is* a runtime
LLM call. Keeping it in a separate package means the shipped package's
guarantees need no carve-outs and its dependency tree stays clean.

Consequent changes to the root package:

- `vitest.config.ts` — exclude `bench/**` from test discovery and coverage.
- `knip.json` — exclude `bench/**` (its deps are entry points knip won't infer).
- `tsconfig.json` — exclude `bench/**` from the root project; `bench` gets its own.
- Biome continues to lint and format `bench/` under the existing root config.

The benchmark never runs in CI. It is invoked manually, with an API key.

## 2. Layout

```
bench/
  package.json           # own deps: agent SDK, graphql-yoga, the GraphQL MCP
  tsconfig.json
  src/
    run.ts               # CLI entry: parses filters, drives the matrix
    matrix.ts            # cartesian product + skip-if-result-exists logic
    runner.ts            # executes ONE cell: workspace -> agent -> artifact + usage
    workspace.ts         # clean dir per run, fixture copy, bundle generation, git init
    server.ts            # mock GraphQL server lifecycle
    scenarios.ts         # the three scenario descriptors (data)
    cases.ts             # the three case descriptors (data)
    judge.ts             # blinded grading pass over completed runs
    aggregate.ts         # judge scores -> summary table
    result.ts            # result file shape + read/write
  fixtures/shop-client/  # checked-in sample client, never mutated in place
  cases/
    qa/{prompt.md,rubric.json}
    add-review/{prompt.md,rubric.json}
    cancel-reason/{prompt.md,rubric.json}
  results/               # run artifacts; mostly gitignored (§8)
```

Boundaries that carry weight:

- `runner.ts` does not know which scenario or case it is running. It consumes
  descriptors. There is no `if (scenario === 'okf-bundle')` anywhere in it.
- `judge.ts` does not import `scenarios.ts`. Blinding is structural: the judge
  module has no access to the scenario vocabulary at all.
- `result.ts` is the single definition of the on-disk shape, shared by runner,
  judge, and aggregator, so a schema change cannot half-land.

## 3. Scenarios

A scenario descriptor is deliberately narrow:

```ts
interface Scenario {
  id: "okf-bundle" | "graphql-mcp" | "baseline";
  setupWorkspace(dir: string, ctx: RunContext): Promise<void>;
  mcpServers(ctx: RunContext): McpServerConfig[];
}
```

Those two members are the *only* way a scenario may influence a run. The type
has no field for system-prompt text, model, tool list, or turn limit, so a
future edit cannot smuggle a second variable in without an obvious type change.

| Scenario | `setupWorkspace` | `mcpServers` |
| --- | --- | --- |
| `okf-bundle` | Generates the OKF bundle from `examples/shop-api/v3.graphql` into `<dir>/okf/shop-api/` by calling the library | none |
| `graphql-mcp` | nothing | one entry, pointed at the mock server's endpoint |
| `baseline` | nothing | none |

The bundle is **generated**, not copied from the committed `okf/shop-api/`.
Emission is deterministic, so the bytes are identical — but generating means the
benchmark always measures the current emitter rather than a snapshot someone
forgot to regenerate.

### 3.1 Agent configuration

Identical for every run, defined once in `runner.ts`:

- Model: `claude-sonnet-5`, pinned by exact ID in a config constant.
- System prompt: one shared string. It states that the agent is working in the
  given directory and should complete the task; it names no scenario, no bundle,
  no tool, and no schema.
- Tools: `Read`, `Glob`, `Grep`, `Edit`, `Write`. **No Bash.**
- A fixed max-turns cap, shared across scenarios.

No Bash because the fixture is untyped (§4), so a typecheck would not catch
schema errors anyway — command execution would add cost and variance without
adding signal.

### 3.2 No human in the loop

#12 notes the baseline agent "may ask clarifying questions". There is nobody to
answer. The session runs to completion and whatever it produces is the artifact.
An agent that responds with questions instead of an answer is graded as-is
against the rubric. That is the honest result for a scenario with no ground
truth, not a harness failure.

### 3.3 Mock server

`graphql-yoga` serving `examples/shop-api/v3.graphql`, with resolvers from
`@graphql-tools/mock`. Started once per invocation on an ephemeral port, and
only when the scheduled matrix actually contains a `graphql-mcp` cell. Torn down
in a `finally`.

Nothing in the benchmark asserts on response *values* — grading looks at which
operations and shapes the agent used. The mocks only need to make introspection
and execution succeed.

The specific GraphQL MCP product is an implementation-time choice, per #12. It
is pinned by name and exact version in `bench/package.json` and recorded in the
run manifest (§8). Requirement: it must serve a live endpoint by introspection,
not an SDL file, so the scenario reflects how such a server is really deployed.

## 4. Fixture

`bench/fixtures/shop-client/` — a small TypeScript/Node client, no UI. It calls
`products`, `product`, `placeOrder`, and `cancelOrder`. It deliberately does not
call `addReview` or `reviewPosted`.

**It must not leak the schema.** The fixture is the one artifact every scenario
can read, including `baseline`. If it contained generated types or an SDL copy,
`baseline` would get ground truth for free and the comparison would collapse.

Therefore:

- A single thin `request(query, variables)` transport helper returning `unknown`.
- No `graphql-codegen`, no `.graphql` schema file, no full type mirror.
- Each feature module declares only the narrow local shape it personally
  consumes — e.g. `{ id: string; name: string; price: { amountCents: number } }`.

`baseline` can therefore infer the calling *style* but learns nothing about the
parts of the schema the fixture doesn't already use. `addReview`'s existence and
`cancelOrder`'s return shape stay genuinely unknown.

The fixture is checked in once and never mutated in place: each run copies it
into a fresh workspace, so a botched run cannot poison the next.

## 5. Workspace lifecycle

Per cell, `workspace.ts`:

1. Creates `bench/results/<runId>/workspace/`.
2. For cases 2 and 3, copies `fixtures/shop-client/` into it. Case 1 gets an
   empty directory.
3. Runs the scenario's `setupWorkspace`.
4. Runs `git init` and commits the pristine state.

Step 4 makes the coding-case artifact a plain `git diff` — no bespoke tree
comparison. The bundle directory is excluded from that diff, so a scenario
marker cannot ride along into the judge's input.

`runId` is `<case>__<scenario>__t<trial>`, e.g. `add-review__okf-bundle__t2`.

## 6. Cases

A case is a directory holding `prompt.md` (verbatim, identical across all three
scenarios) and `rubric.json`. `cases.ts` points at them and declares the
artifact kind.

```ts
interface Case {
  id: "qa" | "add-review" | "cancel-reason";
  artifactKind: "answer" | "diff";
  needsFixture: boolean;
}
```

### 6.1 `qa` — answer questions about the API

Six questions, each with an unambiguous answer in `v3.graphql` and a plausible
way to be wrong. No code is written.

| Question | Ground truth |
| --- | --- |
| Does cancelling an order require authentication? What about placing one? | Both carry `@auth(requires: CUSTOMER)` |
| What fields can I filter products by? | `ProductFilter`: `nameContains`, `minPriceCents`, `maxPriceCents`, `inStockOnly`, `labels`, `visibleTo` |
| Is there a way to subscribe to a product's price changes? | Yes — `productPriceChanged: Product!`, no arguments, no auth directive |
| What's required to place an order? Do I need a customer record first? | `PlaceOrderInput` = `productIds`, `shipTo`, `payWith`. No customer argument; identity comes from the CUSTOMER auth context |
| How do I specify payment? | `PaymentInput` is `@oneOf` — exactly one of `creditCardToken`, `payPalToken`, `giftCardCode` |
| Are there Customer fields a normal caller can't read? | `email` is `@auth(requires: STAFF)` |

### 6.2 `add-review` — add a feature using an unused operation

Prompt: implement product reviews in the client — submit a review with a rating
and body.

Rubric criteria: names `addReview`; passes `productId: ID!`; passes
`rating: Int!` as an integer (not a string, not an enum); treats `body` as
optional; selects only fields that exist on `Review`; accounts for
`@auth(requires: CUSTOMER)`.

Built to catch invention: `reviewText`, a `title` field, a `rating` enum, an
`updateReview` sibling.

### 6.3 `cancel-reason` — change an existing feature

Prompt: the cancel-order flow should require a non-empty cancellation reason and
surface the server's response.

Two deliberate traps:

1. `reason` is an **optional** `String` server-side. The non-empty requirement is
   therefore client-side validation. An agent that reports a server-side
   requirement is fabricating.
2. `cancelOrder` returns `Order!`, and `Order` has **no** `cancellationReason`
   and no `cancelledAt` field. Surfacing the response means `status` (whose
   `OrderStatus` enum includes `CANCELLED`), `id`, `updatedAt`.

### 6.4 Rubric format

```json
{
  "criteria": [
    { "id": "names-add-review", "weight": 2,
      "statement": "The diff calls the addReview mutation by that exact name." },
    { "id": "no-fabricated-schema-elements", "weight": 5,
      "statement": "No field, argument, type, or operation is referenced that does not exist in the schema." }
  ]
}
```

Every rubric carries a heavily weighted `no-fabricated-schema-elements`
criterion. Hallucination is the failure this tool exists to prevent, and it
should dominate the score.

Rubrics are authored once, from the schema, as part of implementation, and
reviewed by a human before the first scored run.

## 7. Judging and metrics

**Artifact.** For `qa`, the final assistant message text. For the coding cases,
the unified diff from §5.

**Blinding.** `judge.ts` receives `rubric.json` and the artifact, and nothing
else — no scenario name, no transcript, no record of whether a bundle was
present. Before grading, obvious scenario markers are scrubbed (paths under
`okf/`, MCP tool-call names) and run order is shuffled.

The limit, stated plainly: for `qa`, an answer that says "according to the
bundle" leaks despite scrubbing. Structural blinding plus scrubbing removes the
*systematic* bias where a judge consistently knows which output came from our
tool; it does not guarantee zero leakage. Reported results must not claim more.

**Judge.** Pinned `claude-opus-5`. One call per artifact, structured JSON out:
`{ id, passed, justification }` per criterion. Judge variance is a documented
limitation of this first pass, not something a second grading pass fixes cheaply.

**Score.** `Σ(weight × passed) / Σ(weight)`, in `[0, 1]`.

**Tokens.** Input, output, cache-read, and cache-creation counts taken from the
Agent SDK's usage stats, plus their total.

**Aggregation per cell (scenario × case, 3 trials):** median accuracy, mean
total tokens. Median for accuracy because with n=3 it resists a single
degenerate run; mean for tokens because total spend is what a reader cares about.

## 8. Results on disk

```
bench/results/
  manifest.json                        # committed
  summary.md                           # committed
  <case>__<scenario>__t<n>/
    run.json                           # committed
    judge.json                         # committed
    artifact.txt | artifact.diff       # gitignored
    transcript.jsonl                   # gitignored
    workspace/                         # gitignored
```

`manifest.json` records exact model IDs, the MCP product and version, the
`graphql-okf` commit under test, and the run date — so any published number is
traceable to the configuration that produced it.

Transcripts, artifacts, and workspaces are gitignored: large, noisy, and
regenerable. Scores and the summary are small, diffable, and are the evidence
for anything claimed in the README.

## 9. Invocation and failure handling

Three separate resumable commands, so a grading tweak does not re-run agents:

```
pnpm --filter graphql-okf-bench run bench [--scenario x] [--case y] [--trials n] [--force]
pnpm --filter graphql-okf-bench run judge [--force]
pnpm --filter graphql-okf-bench run report
```

`bench` skips any cell whose `run.json` already exists unless `--force` is
passed, so a crash or Ctrl-C loses at most one run. `judge` likewise skips
artifacts that already have a `judge.json`.

`ANTHROPIC_API_KEY` is checked before the first run starts, so a missing key
fails in a second rather than mid-matrix. The runner prints the scheduled cell
count up front and a running token tally as it goes.

A cell that throws writes `run.json` with `status: "error"` and the error
message; the matrix continues. Errored cells are listed in the summary and
**excluded from aggregates** — never silently counted as zero, which would read
as a model failure rather than a harness failure.

Runs execute sequentially. Parallelism would be faster but adds rate-limit
retries, interleaved logs, and concurrent load on the mock server — variance a
benchmark that needs to be trustworthy should not buy for wall-clock time.

## 10. Testing

The harness's own Vitest tests, run under the bench workspace and not the root
gate, cover the pure parts with no network:

- `matrix.ts` — cartesian expansion, filter application, skip-if-exists logic.
- Rubric scoring math — weighted fractions, all-pass, all-fail, zero-weight guard.
- Scrubbing — known markers removed, surrounding text intact.
- `aggregate.ts` — median/mean, errored cells excluded.
- `result.ts` — round-trip read/write, malformed file rejected.

Agent and judge calls are not tested. They are the thing being measured; a mock
of them would assert only that the mock was called.

## Out of scope

- Other example schemas and other models — natural follow-ups once this first
  pass has numbers.
- Any change to `graphql-okf`'s own source, CLI, or emitted bundle format.
- Publishing results to the README — a separate decision once numbers exist and
  have been reviewed.
