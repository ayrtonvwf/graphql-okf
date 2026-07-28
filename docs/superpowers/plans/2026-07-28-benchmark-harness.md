# Benchmark Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `bench/` — an isolated pnpm workspace that measures whether a coding agent given an OKF bundle is more accurate and cheaper than the same agent given a GraphQL MCP server or nothing.

**Architecture:** One generic runner executes a matrix of (scenario × case × trial) cells. Scenarios and cases are declarative data, never scripts, so the three scenarios differ in exactly one variable. Each cell gets a fresh git-initialised workspace; the artifact is the final answer text or a `git diff`. A separate blinded judge pass scores artifacts against weighted rubrics; a third pass aggregates.

**Tech Stack:** TypeScript (ESM, NodeNext, `strict`), Node 24, pnpm workspaces, Vitest, Biome, `@anthropic-ai/claude-agent-sdk` (agent under test), `@anthropic-ai/sdk` + `zod` (judge), `graphql-yoga` + `@graphql-tools/mock` (mock server).

**Spec:** `docs/superpowers/specs/2026-07-28-benchmark-harness-design.md`. **Issue:** [#12](https://github.com/ayrtonvwf/graphql-okf/issues/12).

## Global Constraints

Every task's requirements implicitly include this section.

- **Node.js 24** floor. ESM only — every relative import ends in `.js`.
- **TypeScript `strict: true`**, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `resolveJsonModule`, `module`/`moduleResolution` = `NodeNext`, `target`/`lib` = `ES2023`.
- **Biome formatting:** 2-space indent, line width **100**, double quotes, always semicolons, trailing commas `all`. Run `pnpm run format` before every commit.
- **`bench/` never runs in CI** and is never part of the published package. The root package's determinism guarantee (`M1/GOAL-8.1`, `M1/NG-6`) and coverage thresholds must remain untouched.
- **Pinned model IDs**, exact strings, no date suffixes: agent under test `claude-sonnet-5`; judge `claude-opus-5`.
- **Bundle generation is deterministic:** always pass the fixed timestamp `2026-01-01T00:00:00Z` as `now` so bundle bytes never vary between runs.
- **Agent isolation:** every `query()` call MUST pass `settingSources: []`. Without it the SDK loads user/project/local settings — including this repo's `CLAUDE.md` — into the agent under test, which would contaminate all three scenarios and void the benchmark.
- **The scenario descriptor may influence a run through exactly two members** (`setupWorkspace`, `mcpServers`). Never add a third.
- Package name: `graphql-okf-bench`, `"private": true`.
- Run ID format: `<case>__<scenario>__t<trial>` (e.g. `add-review__okf-bundle__t2`).

---

### Task 1: Workspace scaffolding and root carve-outs

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `bench/package.json`
- Create: `bench/tsconfig.json`
- Create: `bench/vitest.config.ts`
- Create: `bench/src/constants.ts`
- Create: `bench/src/constants.test.ts`
- Create: `bench/.gitignore`
- Modify: `vitest.config.ts`
- Modify: `knip.json`
- Modify: `tsconfig.json`
- Modify: `lefthook.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `bench/src/constants.ts` exporting `AGENT_MODEL: "claude-sonnet-5"`, `JUDGE_MODEL: "claude-opus-5"`, `FIXED_NOW: "2026-01-01T00:00:00Z"`, `SCHEMA_PATH: string` (absolute path to `examples/shop-api/v3.graphql`), `REPO_ROOT: string`, `BENCH_ROOT: string`, `RESULTS_DIR: string`, `CASES_DIR: string`, `FIXTURE_DIR: string`.

- [ ] **Step 1: Create the workspace file**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "."
  - "bench"
```

- [ ] **Step 2: Create `bench/package.json`**

```json
{
  "name": "graphql-okf-bench",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Benchmark harness measuring graphql-okf's effect on agent accuracy and token usage",
  "scripts": {
    "bench": "node --experimental-strip-types src/run.ts",
    "judge": "node --experimental-strip-types src/judge-cli.ts",
    "report": "node --experimental-strip-types src/report-cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@anthropic-ai/sdk": "^0.70.0",
    "@graphql-tools/mock": "^9.0.0",
    "@graphql-tools/schema": "^10.0.0",
    "graphql": "^16.11.0",
    "graphql-okf": "workspace:*",
    "graphql-yoga": "^5.10.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^26.1.1",
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  }
}
```

Note: dependency version ranges are starting points. After `pnpm install`, if a range fails to resolve, use the latest published version and record the resolved version — `bench/pnpm-lock.yaml` entries are the record of what was actually tested.

- [ ] **Step 3: Create `bench/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `bench/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

No coverage thresholds here: the harness's untestable surface (agent and judge API calls) is deliberately uncovered, so a threshold would be theatre.

- [ ] **Step 5: Create `bench/.gitignore`**

```gitignore
results/*/workspace/
results/*/artifact.txt
results/*/artifact.diff
results/*/transcript.jsonl
```

`run.json`, `judge.json`, `manifest.json`, and `summary.md` are deliberately NOT ignored — they are the committed evidence.

- [ ] **Step 6: Write the failing test for constants**

`bench/src/constants.test.ts`:

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_MODEL, FIXED_NOW, JUDGE_MODEL, SCHEMA_PATH } from "./constants.js";

describe("constants", () => {
  it("pins the exact model ids", () => {
    expect(AGENT_MODEL).toBe("claude-sonnet-5");
    expect(JUDGE_MODEL).toBe("claude-opus-5");
  });

  it("pins a fixed timestamp so bundle emission is byte-stable", () => {
    expect(FIXED_NOW).toBe("2026-01-01T00:00:00Z");
  });

  it("points at the shop-api v3 schema that actually exists", () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/constants.test.ts`
Expected: FAIL — `Failed to resolve import "./constants.js"`.

- [ ] **Step 8: Write `bench/src/constants.ts`**

```ts
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The agent under test. Pinned: a floating alias would silently change results. */
export const AGENT_MODEL = "claude-sonnet-5";

/** The grader. Stronger than the agent under test, per the spec. */
export const JUDGE_MODEL = "claude-opus-5";

/**
 * Emission is deterministic, but only if `now` is. A wall-clock timestamp would
 * make every generated bundle differ, defeating the point of generating it fresh.
 */
export const FIXED_NOW = "2026-01-01T00:00:00Z";

const here = dirname(fileURLToPath(import.meta.url));

/** `bench/` itself. */
export const BENCH_ROOT = resolve(here, "..");

/** The graphql-okf repository root. */
export const REPO_ROOT = resolve(BENCH_ROOT, "..");

export const SCHEMA_PATH = join(REPO_ROOT, "examples", "shop-api", "v3.graphql");
export const RESULTS_DIR = join(BENCH_ROOT, "results");
export const CASES_DIR = join(BENCH_ROOT, "cases");
export const FIXTURE_DIR = join(BENCH_ROOT, "fixtures", "shop-client");
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/constants.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 10: Carve `bench/` out of the root Vitest config**

In `vitest.config.ts`, change the `exclude` line to add `bench/**`:

```ts
    exclude: ["**/*.live.test.ts", "node_modules/**", "dist/**", "bench/**"],
```

- [ ] **Step 11: Carve `bench/` out of knip**

Replace `knip.json` with:

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "project": ["src/**/*.ts"],
  "workspaces": {
    ".": {
      "project": ["src/**/*.ts"]
    }
  },
  "ignoreWorkspaces": ["bench"]
}
```

- [ ] **Step 12: Carve `bench/` out of the root tsconfig**

In the root `tsconfig.json`, add an `exclude` key as a sibling of `include`:

```json
  "include": ["src", "test"],
  "exclude": ["bench"]
```

- [ ] **Step 13: Add a bench typecheck to the git hook**

The root `typecheck` script does not cover `bench/`. In `lefthook.yml`, add a third command under `pre-commit.commands`:

```yaml
    typecheck-bench:
      glob: "bench/**/*.ts"
      run: pnpm --filter graphql-okf-bench run typecheck
```

- [ ] **Step 14: Add a convenience script at the root**

In the root `package.json` `scripts`, add:

```json
    "typecheck:bench": "pnpm --filter graphql-okf-bench run typecheck",
```

- [ ] **Step 15: Install and verify the whole gate still passes**

Run: `pnpm install`
Expected: resolves two workspace projects, no errors.

Run: `pnpm run coverage`
Expected: PASS, thresholds met, and NO `bench/**` file appears in the coverage table.

Run: `pnpm run lint && pnpm run typecheck && pnpm run knip && pnpm run typecheck:bench`
Expected: all four exit 0.

- [ ] **Step 16: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json vitest.config.ts knip.json lefthook.yml bench/ && git commit -m "feat(bench): isolated pnpm workspace for the benchmark harness"
```

---

### Task 2: Result file shape and usage normalisation

**Files:**
- Create: `bench/src/result.ts`
- Create: `bench/src/result.test.ts`
- Create: `bench/src/usage.ts`
- Create: `bench/src/usage.test.ts`

**Interfaces:**
- Consumes: `RESULTS_DIR` from `./constants.js`.
- Produces:
  - `usage.ts`: `interface TokenUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; totalTokens: number }`, and `normalizeUsage(raw: unknown): TokenUsage`.
  - `result.ts`: `type RunStatus = "ok" | "error"`; `interface RunResult { runId: string; caseId: string; scenarioId: string; trial: number; status: RunStatus; error?: string; usage?: TokenUsage; costUsd?: number; startedAt: string; durationMs: number; agentModel: string }`; `runDir(runId: string): string`; `writeRunResult(r: RunResult): Promise<void>`; `readRunResult(runId: string): Promise<RunResult>`; `runResultExists(runId: string): Promise<boolean>`; `listRunResults(): Promise<RunResult[]>`; `interface JudgeResult { runId: string; caseId: string; score: number; criteria: CriterionOutcome[]; judgeModel: string }`; `interface CriterionOutcome { id: string; passed: boolean; justification: string }`; `writeJudgeResult`, `readJudgeResult`, `judgeResultExists` with matching signatures.

The Agent SDK's published docs describe the result message's usage in two different shapes. Rather than guess, `normalizeUsage` accepts either and is tested against both; Task 11 adds a probe that confirms which one this SDK version actually emits.

- [ ] **Step 1: Write the failing test for usage normalisation**

`bench/src/usage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeUsage } from "./usage.js";

describe("normalizeUsage", () => {
  it("reads a flat usage object", () => {
    expect(normalizeUsage({ input_tokens: 100, output_tokens: 20 })).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 120,
    });
  });

  it("reads usage nested under a result key", () => {
    expect(
      normalizeUsage({
        result: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 7,
            cache_creation_input_tokens: 3,
          },
        },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 7,
      cacheCreationTokens: 3,
      totalTokens: 25,
    });
  });

  it("counts cache tokens toward the total", () => {
    const usage = normalizeUsage({
      input_tokens: 1,
      output_tokens: 2,
      cache_read_input_tokens: 4,
      cache_creation_input_tokens: 8,
    });
    expect(usage.totalTokens).toBe(15);
  });

  it("treats missing counters as zero rather than NaN", () => {
    expect(normalizeUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
    });
  });

  it("survives a null or non-object payload", () => {
    expect(normalizeUsage(null).totalTokens).toBe(0);
    expect(normalizeUsage("nonsense").totalTokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/usage.test.ts`
Expected: FAIL — `Failed to resolve import "./usage.js"`.

- [ ] **Step 3: Write `bench/src/usage.ts`**

```ts
/** Token counts for one run, normalised away from the SDK's wire shape. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  /** Input + output + both cache counters. What a reader means by "spend". */
  readonly totalTokens: number;
}

const EMPTY: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalTokens: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function count(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The Agent SDK documents the result message's usage in more than one shape
 * (flat, and nested under `result`). Accept either rather than pin to one and
 * silently record zeros if this SDK version disagrees.
 */
export function normalizeUsage(raw: unknown): TokenUsage {
  if (!isRecord(raw)) return EMPTY;

  const nested = isRecord(raw["result"]) ? raw["result"] : undefined;
  const source = isRecord(raw["usage"])
    ? raw["usage"]
    : nested !== undefined && isRecord(nested["usage"])
      ? nested["usage"]
      : raw;

  const inputTokens = count(source, "input_tokens");
  const outputTokens = count(source, "output_tokens");
  const cacheReadTokens = count(source, "cache_read_input_tokens");
  const cacheCreationTokens = count(source, "cache_creation_input_tokens");

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/usage.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for result read/write**

`bench/src/result.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

vi.mock("./constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants.js")>();
  return {
    ...actual,
    get RESULTS_DIR() {
      return dir;
    },
  };
});

const { readJudgeResult, readRunResult, runResultExists, writeJudgeResult, writeRunResult } =
  await import("./result.js");

const sample = {
  runId: "qa__baseline__t1",
  caseId: "qa",
  scenarioId: "baseline",
  trial: 1,
  status: "ok" as const,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 15,
  },
  costUsd: 0.01,
  startedAt: "2026-07-28T10:00:00.000Z",
  durationMs: 1234,
  agentModel: "claude-sonnet-5",
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "okf-bench-result-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("run results", () => {
  it("round-trips a run result", async () => {
    await writeRunResult(sample);
    expect(await readRunResult(sample.runId)).toEqual(sample);
  });

  it("reports existence only after a write", async () => {
    expect(await runResultExists(sample.runId)).toBe(false);
    await writeRunResult(sample);
    expect(await runResultExists(sample.runId)).toBe(true);
  });

  it("writes indented JSON so committed results diff readably", async () => {
    await writeRunResult(sample);
    const text = await readFile(join(dir, sample.runId, "run.json"), "utf8");
    expect(text).toContain('\n  "runId"');
    expect(text.endsWith("\n")).toBe(true);
  });

  it("rejects a malformed result file rather than returning junk", async () => {
    await writeRunResult({ ...sample, runId: "bad__baseline__t1" });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "bad__baseline__t1", "run.json"), "{ not json", "utf8");
    await expect(readRunResult("bad__baseline__t1")).rejects.toThrow(/bad__baseline__t1/);
  });

  it("rejects a result file missing required fields", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(dir, "empty__baseline__t1"), { recursive: true });
    await writeFile(join(dir, "empty__baseline__t1", "run.json"), "{}", "utf8");
    await expect(readRunResult("empty__baseline__t1")).rejects.toThrow(/missing/i);
  });
});

describe("judge results", () => {
  it("round-trips a judge result", async () => {
    const judged = {
      runId: sample.runId,
      caseId: "qa",
      score: 0.75,
      criteria: [{ id: "c1", passed: true, justification: "names addReview" }],
      judgeModel: "claude-opus-5",
    };
    await writeRunResult(sample);
    await writeJudgeResult(judged);
    expect(await readJudgeResult(sample.runId)).toEqual(judged);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/result.test.ts`
Expected: FAIL — `Failed to resolve import "./result.js"`.

- [ ] **Step 7: Write `bench/src/result.ts`**

```ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RESULTS_DIR } from "./constants.js";
import type { TokenUsage } from "./usage.js";

export type RunStatus = "ok" | "error";

/** One executed cell of the matrix. The unit the runner writes and the judge reads. */
export interface RunResult {
  readonly runId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly trial: number;
  readonly status: RunStatus;
  readonly error?: string;
  readonly usage?: TokenUsage;
  readonly costUsd?: number;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly agentModel: string;
}

export interface CriterionOutcome {
  readonly id: string;
  readonly passed: boolean;
  readonly justification: string;
}

/** One graded artifact. Committed — this is the evidence behind any published number. */
export interface JudgeResult {
  readonly runId: string;
  readonly caseId: string;
  /** Weighted pass fraction in [0, 1]. */
  readonly score: number;
  readonly criteria: readonly CriterionOutcome[];
  readonly judgeModel: string;
}

export function runDir(runId: string): string {
  return join(RESULTS_DIR, runId);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string, label: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, "utf8");
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`${label} is not readable JSON: ${(cause as Error).message}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

function require<T>(source: Record<string, unknown>, key: string, label: string): T {
  const value = source[key];
  if (value === undefined) {
    throw new Error(`${label} is missing required field "${key}"`);
  }
  return value as T;
}

export async function writeRunResult(result: RunResult): Promise<void> {
  const dir = runDir(result.runId);
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "run.json"), result);
}

export async function readRunResult(runId: string): Promise<RunResult> {
  const path = join(runDir(runId), "run.json");
  const raw = await readJson(path, runId);
  return {
    runId: require<string>(raw, "runId", runId),
    caseId: require<string>(raw, "caseId", runId),
    scenarioId: require<string>(raw, "scenarioId", runId),
    trial: require<number>(raw, "trial", runId),
    status: require<RunStatus>(raw, "status", runId),
    error: raw["error"] as string | undefined,
    usage: raw["usage"] as TokenUsage | undefined,
    costUsd: raw["costUsd"] as number | undefined,
    startedAt: require<string>(raw, "startedAt", runId),
    durationMs: require<number>(raw, "durationMs", runId),
    agentModel: require<string>(raw, "agentModel", runId),
  };
}

export async function runResultExists(runId: string): Promise<boolean> {
  return exists(join(runDir(runId), "run.json"));
}

export async function listRunResults(): Promise<RunResult[]> {
  let entries: string[];
  try {
    entries = await readdir(RESULTS_DIR);
  } catch {
    return [];
  }
  const results: RunResult[] = [];
  for (const entry of entries.sort()) {
    if (await runResultExists(entry)) {
      results.push(await readRunResult(entry));
    }
  }
  return results;
}

export async function writeJudgeResult(result: JudgeResult): Promise<void> {
  const dir = runDir(result.runId);
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "judge.json"), result);
}

export async function readJudgeResult(runId: string): Promise<JudgeResult> {
  const path = join(runDir(runId), "judge.json");
  const raw = await readJson(path, runId);
  return {
    runId: require<string>(raw, "runId", runId),
    caseId: require<string>(raw, "caseId", runId),
    score: require<number>(raw, "score", runId),
    criteria: require<CriterionOutcome[]>(raw, "criteria", runId),
    judgeModel: require<string>(raw, "judgeModel", runId),
  };
}

export async function judgeResultExists(runId: string): Promise<boolean> {
  return exists(join(runDir(runId), "judge.json"));
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/result.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/src && git commit -m "feat(bench): result file shape and usage normalisation"
```

---

### Task 3: Cases, prompts, and rubrics

**Files:**
- Create: `bench/cases/qa/prompt.md`
- Create: `bench/cases/qa/rubric.json`
- Create: `bench/cases/add-review/prompt.md`
- Create: `bench/cases/add-review/rubric.json`
- Create: `bench/cases/cancel-reason/prompt.md`
- Create: `bench/cases/cancel-reason/rubric.json`
- Create: `bench/src/cases.ts`
- Create: `bench/src/cases.test.ts`

**Interfaces:**
- Consumes: `CASES_DIR` from `./constants.js`.
- Produces: `type CaseId = "qa" | "add-review" | "cancel-reason"`; `type ArtifactKind = "answer" | "diff"`; `interface BenchCase { id: CaseId; artifactKind: ArtifactKind; needsFixture: boolean }`; `interface Criterion { id: string; weight: number; statement: string }`; `interface Rubric { criteria: Criterion[] }`; `CASES: readonly BenchCase[]`; `caseById(id: string): BenchCase`; `loadPrompt(id: CaseId): Promise<string>`; `loadRubric(id: CaseId): Promise<Rubric>`.

- [ ] **Step 1: Write `bench/cases/qa/prompt.md`**

```markdown
Answer the following questions about the GraphQL API this project works against.
Answer all six. Do not write or modify any code.

1. Does cancelling an order require authentication? What about placing one?
2. What fields can I filter products by when listing them?
3. Is there a way to subscribe to a product's price changes?
4. What's required to place an order? Do I need to create a customer record first?
5. How do I specify payment when placing an order?
6. Are there any fields on a customer that a normal signed-in caller cannot read?
```

- [ ] **Step 2: Write `bench/cases/qa/rubric.json`**

```json
{
  "criteria": [
    {
      "id": "no-fabricated-schema-elements",
      "weight": 5,
      "statement": "The answer references no field, argument, type, operation, or directive that does not exist in the schema. Inventing plausible-sounding names is the failure this criterion catches."
    },
    {
      "id": "auth-on-cancel-and-place",
      "weight": 2,
      "statement": "States that BOTH cancelling an order and placing an order require authentication at the CUSTOMER role."
    },
    {
      "id": "product-filter-fields",
      "weight": 2,
      "statement": "Lists the ProductFilter fields: nameContains, minPriceCents, maxPriceCents, inStockOnly, labels, visibleTo. Naming at least five of the six, and no non-existent ones, passes."
    },
    {
      "id": "price-subscription",
      "weight": 2,
      "statement": "States that price changes can be subscribed to via productPriceChanged, which takes no arguments."
    },
    {
      "id": "place-order-requirements",
      "weight": 2,
      "statement": "States that PlaceOrderInput requires productIds, shipTo, and payWith, AND that no customer id is passed — the caller's identity comes from the authenticated CUSTOMER context."
    },
    {
      "id": "payment-oneof",
      "weight": 2,
      "statement": "States that PaymentInput is a @oneOf input requiring exactly one of creditCardToken, payPalToken, or giftCardCode."
    },
    {
      "id": "customer-email-staff-only",
      "weight": 2,
      "statement": "Identifies Customer.email as restricted to the STAFF role."
    }
  ]
}
```

- [ ] **Step 3: Write `bench/cases/add-review/prompt.md`**

```markdown
This project is a small client for a GraphQL shop API.

Add support for product reviews: a customer should be able to submit a review for
a product with a star rating and an optional written body, and the client should
surface the created review.

Follow the conventions already used by the existing feature modules in `src/`.
```

- [ ] **Step 4: Write `bench/cases/add-review/rubric.json`**

```json
{
  "criteria": [
    {
      "id": "no-fabricated-schema-elements",
      "weight": 5,
      "statement": "Every field, argument, type, and operation named in the diff exists in the shop schema. Common fabrications to check for: a `reviewText` or `title` field on Review, a `rating` enum rather than an Int, an `updateReview` or `deleteReview` mutation, a `reviews` argument that does not exist."
    },
    {
      "id": "names-add-review",
      "weight": 3,
      "statement": "The diff calls the mutation by its exact name, addReview."
    },
    {
      "id": "product-id-argument",
      "weight": 2,
      "statement": "Passes productId as the ID! argument identifying the product being reviewed."
    },
    {
      "id": "rating-is-int",
      "weight": 2,
      "statement": "Passes rating as a required integer (Int!) — not a string, not an enum, not a float."
    },
    {
      "id": "body-is-optional",
      "weight": 1,
      "statement": "Treats body as an optional String rather than requiring it."
    },
    {
      "id": "selects-real-review-fields",
      "weight": 2,
      "statement": "The selection set on the addReview result contains only fields that exist on the Review type (id, createdAt, updatedAt, product, author, rating, body)."
    },
    {
      "id": "acknowledges-customer-auth",
      "weight": 1,
      "statement": "The change reflects that addReview requires an authenticated CUSTOMER — for example by routing through the client's existing authenticated request path, or by noting the requirement."
    }
  ]
}
```

- [ ] **Step 5: Write `bench/cases/cancel-reason/prompt.md`**

```markdown
This project is a small client for a GraphQL shop API.

Change the existing cancel-order flow so that a cancellation reason is required:
the client should refuse to submit a cancellation with an empty or missing reason.
After a successful cancellation, surface the server's response to the caller
rather than discarding it.

Follow the conventions already used by the existing feature modules in `src/`.
```

- [ ] **Step 6: Write `bench/cases/cancel-reason/rubric.json`**

```json
{
  "criteria": [
    {
      "id": "no-fabricated-schema-elements",
      "weight": 5,
      "statement": "Every field, argument, type, and operation named in the diff exists in the shop schema. Order in particular has NO cancellationReason and NO cancelledAt field — referencing either is a fabrication."
    },
    {
      "id": "names-cancel-order",
      "weight": 2,
      "statement": "The diff calls the mutation by its exact name, cancelOrder."
    },
    {
      "id": "passes-id-and-reason",
      "weight": 2,
      "statement": "Passes both the order id (ID!) and reason (String) as arguments to cancelOrder."
    },
    {
      "id": "validation-is-client-side",
      "weight": 3,
      "statement": "The non-empty-reason requirement is enforced in the client. The diff must NOT claim or imply that the server requires reason — it is an optional String in the schema. Asserting a server-side requirement is a fabrication and fails this criterion."
    },
    {
      "id": "surfaces-real-order-fields",
      "weight": 2,
      "statement": "The response is surfaced using fields that exist on Order — for example status (an OrderStatus, whose CANCELLED member is the meaningful one here), id, or updatedAt."
    },
    {
      "id": "no-orphaned-callers",
      "weight": 1,
      "statement": "Existing callers of the cancel function are updated consistently with its new signature, so the change is internally coherent."
    }
  ]
}
```

- [ ] **Step 7: Write the failing test for case loading**

`bench/src/cases.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CASES, caseById, loadPrompt, loadRubric } from "./cases.js";

describe("cases", () => {
  it("declares exactly the three specified cases", () => {
    expect(CASES.map((c) => c.id)).toEqual(["qa", "add-review", "cancel-reason"]);
  });

  it("marks qa as an answer case needing no fixture", () => {
    const qa = caseById("qa");
    expect(qa.artifactKind).toBe("answer");
    expect(qa.needsFixture).toBe(false);
  });

  it("marks both coding cases as diff cases needing the fixture", () => {
    for (const id of ["add-review", "cancel-reason"]) {
      const c = caseById(id);
      expect(c.artifactKind).toBe("diff");
      expect(c.needsFixture).toBe(true);
    }
  });

  it("rejects an unknown case id", () => {
    expect(() => caseById("nope")).toThrow(/unknown case/i);
  });

  it("loads a non-empty prompt for every case", async () => {
    for (const c of CASES) {
      expect((await loadPrompt(c.id)).trim().length).toBeGreaterThan(0);
    }
  });

  it("loads a rubric with positive weights and unique ids for every case", async () => {
    for (const c of CASES) {
      const rubric = await loadRubric(c.id);
      expect(rubric.criteria.length).toBeGreaterThan(0);
      const ids = rubric.criteria.map((crit) => crit.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const crit of rubric.criteria) {
        expect(crit.weight).toBeGreaterThan(0);
        expect(crit.statement.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every case a heavily weighted no-fabrication criterion", async () => {
    for (const c of CASES) {
      const rubric = await loadRubric(c.id);
      const fabrication = rubric.criteria.find((crit) => crit.id === "no-fabricated-schema-elements");
      expect(fabrication, `${c.id} must guard against fabrication`).toBeDefined();
      const others = rubric.criteria.filter((crit) => crit.id !== "no-fabricated-schema-elements");
      for (const other of others) {
        expect(fabrication?.weight).toBeGreaterThanOrEqual(other.weight);
      }
    }
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/cases.test.ts`
Expected: FAIL — `Failed to resolve import "./cases.js"`.

- [ ] **Step 9: Write `bench/src/cases.ts`**

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CASES_DIR } from "./constants.js";

export type CaseId = "qa" | "add-review" | "cancel-reason";

/** What the judge grades: the final answer text, or the workspace diff. */
export type ArtifactKind = "answer" | "diff";

export interface BenchCase {
  readonly id: CaseId;
  readonly artifactKind: ArtifactKind;
  /** Whether the workspace is seeded with a copy of the sample client. */
  readonly needsFixture: boolean;
}

export interface Criterion {
  readonly id: string;
  readonly weight: number;
  readonly statement: string;
}

export interface Rubric {
  readonly criteria: readonly Criterion[];
}

export const CASES: readonly BenchCase[] = Object.freeze([
  { id: "qa", artifactKind: "answer", needsFixture: false },
  { id: "add-review", artifactKind: "diff", needsFixture: true },
  { id: "cancel-reason", artifactKind: "diff", needsFixture: true },
]);

export function caseById(id: string): BenchCase {
  const found = CASES.find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`Unknown case "${id}". Known cases: ${CASES.map((c) => c.id).join(", ")}`);
  }
  return found;
}

export async function loadPrompt(id: CaseId): Promise<string> {
  return readFile(join(CASES_DIR, id, "prompt.md"), "utf8");
}

export async function loadRubric(id: CaseId): Promise<Rubric> {
  const text = await readFile(join(CASES_DIR, id, "rubric.json"), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { criteria?: unknown }).criteria)
  ) {
    throw new Error(`Rubric for case "${id}" has no criteria array`);
  }
  return parsed as Rubric;
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/cases.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 11: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/cases bench/src && git commit -m "feat(bench): case prompts, weighted rubrics, and case loading"
```

---

### Task 4: Matrix expansion, filtering, and skip logic

**Files:**
- Create: `bench/src/matrix.ts`
- Create: `bench/src/matrix.test.ts`

**Interfaces:**
- Consumes: `CASES`, `caseById` from `./cases.js`.
- Produces: `interface Cell { runId: string; caseId: CaseId; scenarioId: ScenarioId; trial: number }`; `type ScenarioId = "okf-bundle" | "graphql-mcp" | "baseline"`; `SCENARIO_IDS: readonly ScenarioId[]`; `interface MatrixFilters { scenario?: string; case?: string; trials?: number }`; `buildMatrix(filters: MatrixFilters): Cell[]`; `filterPending(cells: Cell[], done: (runId: string) => Promise<boolean>, force: boolean): Promise<Cell[]>`; `formatRunId(caseId: string, scenarioId: string, trial: number): string`.

`ScenarioId` lives here rather than in `scenarios.ts` so `matrix.ts` stays free of the scenario implementations — the matrix needs the names, not the behaviour.

- [ ] **Step 1: Write the failing test**

`bench/src/matrix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildMatrix, filterPending, formatRunId, SCENARIO_IDS } from "./matrix.js";

describe("formatRunId", () => {
  it("builds the documented run id shape", () => {
    expect(formatRunId("add-review", "okf-bundle", 2)).toBe("add-review__okf-bundle__t2");
  });
});

describe("buildMatrix", () => {
  it("produces 27 cells for the full first pass", () => {
    expect(buildMatrix({}).length).toBe(27);
  });

  it("covers every scenario and case combination exactly three times", () => {
    const cells = buildMatrix({});
    for (const scenarioId of SCENARIO_IDS) {
      for (const caseId of ["qa", "add-review", "cancel-reason"]) {
        const matching = cells.filter((c) => c.scenarioId === scenarioId && c.caseId === caseId);
        expect(matching.map((c) => c.trial)).toEqual([1, 2, 3]);
      }
    }
  });

  it("emits unique run ids", () => {
    const ids = buildMatrix({}).map((c) => c.runId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filters by scenario", () => {
    const cells = buildMatrix({ scenario: "baseline" });
    expect(cells.length).toBe(9);
    expect(cells.every((c) => c.scenarioId === "baseline")).toBe(true);
  });

  it("filters by case", () => {
    const cells = buildMatrix({ case: "qa" });
    expect(cells.length).toBe(3);
    expect(cells.every((c) => c.caseId === "qa")).toBe(true);
  });

  it("honours a reduced trial count", () => {
    expect(buildMatrix({ trials: 1 }).length).toBe(9);
  });

  it("combines filters", () => {
    const cells = buildMatrix({ scenario: "okf-bundle", case: "add-review", trials: 2 });
    expect(cells.map((c) => c.runId)).toEqual([
      "add-review__okf-bundle__t1",
      "add-review__okf-bundle__t2",
    ]);
  });

  it("rejects an unknown scenario", () => {
    expect(() => buildMatrix({ scenario: "nope" })).toThrow(/unknown scenario/i);
  });

  it("rejects an unknown case", () => {
    expect(() => buildMatrix({ case: "nope" })).toThrow(/unknown case/i);
  });

  it("rejects a non-positive trial count", () => {
    expect(() => buildMatrix({ trials: 0 })).toThrow(/trials/i);
  });
});

describe("filterPending", () => {
  const cells = buildMatrix({ case: "qa", scenario: "baseline" });

  it("drops cells whose result already exists", async () => {
    const done = async (runId: string) => runId.endsWith("t1");
    const pending = await filterPending(cells, done, false);
    expect(pending.map((c) => c.trial)).toEqual([2, 3]);
  });

  it("keeps every cell when forced", async () => {
    const pending = await filterPending(cells, async () => true, true);
    expect(pending.length).toBe(3);
  });

  it("keeps every cell when nothing is done", async () => {
    const pending = await filterPending(cells, async () => false, false);
    expect(pending.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/matrix.test.ts`
Expected: FAIL — `Failed to resolve import "./matrix.js"`.

- [ ] **Step 3: Write `bench/src/matrix.ts`**

```ts
import { type CaseId, CASES, caseById } from "./cases.js";

export type ScenarioId = "okf-bundle" | "graphql-mcp" | "baseline";

export const SCENARIO_IDS: readonly ScenarioId[] = Object.freeze([
  "okf-bundle",
  "graphql-mcp",
  "baseline",
]);

/** The spec's first pass: three trials per (scenario × case). */
export const DEFAULT_TRIALS = 3;

/** One executable unit of the matrix. */
export interface Cell {
  readonly runId: string;
  readonly caseId: CaseId;
  readonly scenarioId: ScenarioId;
  readonly trial: number;
}

export interface MatrixFilters {
  readonly scenario?: string;
  readonly case?: string;
  readonly trials?: number;
}

export function formatRunId(caseId: string, scenarioId: string, trial: number): string {
  return `${caseId}__${scenarioId}__t${trial}`;
}

function resolveScenarios(filter: string | undefined): readonly ScenarioId[] {
  if (filter === undefined) return SCENARIO_IDS;
  const found = SCENARIO_IDS.find((id) => id === filter);
  if (found === undefined) {
    throw new Error(`Unknown scenario "${filter}". Known scenarios: ${SCENARIO_IDS.join(", ")}`);
  }
  return [found];
}

export function buildMatrix(filters: MatrixFilters): Cell[] {
  const scenarios = resolveScenarios(filters.scenario);
  const cases = filters.case === undefined ? CASES : [caseById(filters.case)];
  const trials = filters.trials ?? DEFAULT_TRIALS;
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error(`trials must be a positive integer, got ${String(filters.trials)}`);
  }

  const cells: Cell[] = [];
  for (const benchCase of cases) {
    for (const scenarioId of scenarios) {
      for (let trial = 1; trial <= trials; trial += 1) {
        cells.push({
          runId: formatRunId(benchCase.id, scenarioId, trial),
          caseId: benchCase.id,
          scenarioId,
          trial,
        });
      }
    }
  }
  return cells;
}

/**
 * Resumability: a cell whose result file already exists is skipped, so a crash
 * or Ctrl-C costs at most one run's spend rather than the whole matrix.
 */
export async function filterPending(
  cells: readonly Cell[],
  done: (runId: string) => Promise<boolean>,
  force: boolean,
): Promise<Cell[]> {
  if (force) return [...cells];
  const pending: Cell[] = [];
  for (const cell of cells) {
    if (!(await done(cell.runId))) pending.push(cell);
  }
  return pending;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/matrix.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/src && git commit -m "feat(bench): matrix expansion, filtering, and resumable skip logic"
```

---

### Task 5: Scoring and scrubbing

**Files:**
- Create: `bench/src/scoring.ts`
- Create: `bench/src/scoring.test.ts`
- Create: `bench/src/scrub.ts`
- Create: `bench/src/scrub.test.ts`

**Interfaces:**
- Consumes: `Rubric`, `Criterion` from `./cases.js`; `CriterionOutcome` from `./result.js`.
- Produces: `scoreRubric(rubric: Rubric, outcomes: readonly CriterionOutcome[]): number`; `scrubArtifact(text: string): string`.

- [ ] **Step 1: Write the failing test for scoring**

`bench/src/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Rubric } from "./cases.js";
import { scoreRubric } from "./scoring.js";

const rubric: Rubric = {
  criteria: [
    { id: "a", weight: 3, statement: "A" },
    { id: "b", weight: 1, statement: "B" },
  ],
};

describe("scoreRubric", () => {
  it("returns 1 when every criterion passes", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: true, justification: "" },
        { id: "b", passed: true, justification: "" },
      ]),
    ).toBe(1);
  });

  it("returns 0 when every criterion fails", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: false, justification: "" },
        { id: "b", passed: false, justification: "" },
      ]),
    ).toBe(0);
  });

  it("weights criteria rather than counting them", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: true, justification: "" },
        { id: "b", passed: false, justification: "" },
      ]),
    ).toBe(0.75);
  });

  it("treats a criterion the judge omitted as failed", () => {
    expect(scoreRubric(rubric, [{ id: "a", passed: true, justification: "" }])).toBe(0.75);
  });

  it("ignores outcomes for criteria the rubric does not define", () => {
    expect(
      scoreRubric(rubric, [
        { id: "a", passed: true, justification: "" },
        { id: "b", passed: true, justification: "" },
        { id: "ghost", passed: true, justification: "" },
      ]),
    ).toBe(1);
  });

  it("throws on a zero-weight rubric rather than dividing by zero", () => {
    expect(() => scoreRubric({ criteria: [] }, [])).toThrow(/weight/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/scoring.test.ts`
Expected: FAIL — `Failed to resolve import "./scoring.js"`.

- [ ] **Step 3: Write `bench/src/scoring.ts`**

```ts
import type { Rubric } from "./cases.js";
import type { CriterionOutcome } from "./result.js";

/**
 * Weighted pass fraction. A criterion the judge failed to report counts as
 * failed: silently dropping it would inflate the score of a judge that lost
 * track of the rubric.
 */
export function scoreRubric(rubric: Rubric, outcomes: readonly CriterionOutcome[]): number {
  const passedIds = new Set(outcomes.filter((o) => o.passed).map((o) => o.id));

  let earned = 0;
  let total = 0;
  for (const criterion of rubric.criteria) {
    total += criterion.weight;
    if (passedIds.has(criterion.id)) earned += criterion.weight;
  }

  if (total <= 0) {
    throw new Error("Rubric has no positive total weight; cannot score it");
  }
  return earned / total;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/scoring.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing test for scrubbing**

`bench/src/scrub.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scrubArtifact } from "./scrub.js";

describe("scrubArtifact", () => {
  it("redacts bundle file paths", () => {
    expect(scrubArtifact("I read okf/shop-api/mutations/addReview.md for this.")).toBe(
      "I read [redacted] for this.",
    );
  });

  it("redacts a leading-slash bundle path", () => {
    expect(scrubArtifact("see /okf/shop-api/index.md")).toBe("see [redacted]");
  });

  it("redacts mcp tool call names", () => {
    expect(scrubArtifact("Calling mcp__graphql__introspect now")).toBe("Calling [redacted] now");
  });

  it("leaves ordinary schema talk untouched", () => {
    const text = "addReview takes productId: ID! and rating: Int!";
    expect(scrubArtifact(text)).toBe(text);
  });

  it("does not mangle the word bundle in prose", () => {
    const text = "The response bundles several fields together.";
    expect(scrubArtifact(text)).toBe(text);
  });

  it("redacts every occurrence, not just the first", () => {
    expect(scrubArtifact("okf/shop-api/a.md and okf/shop-api/b.md")).toBe(
      "[redacted] and [redacted]",
    );
  });

  it("returns an empty string unchanged", () => {
    expect(scrubArtifact("")).toBe("");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/scrub.test.ts`
Expected: FAIL — `Failed to resolve import "./scrub.js"`.

- [ ] **Step 7: Write `bench/src/scrub.ts`**

```ts
const REDACTED = "[redacted]";

/**
 * Structural blinding is the real defence — the judge module never imports the
 * scenario vocabulary. These patterns remove the markers that would otherwise
 * ride along inside the artifact itself.
 *
 * Deliberately narrow. Aggressive redaction would mangle legitimate schema talk
 * and change what the judge is grading. Note the residual limit documented in
 * the spec: prose like "according to the bundle" still leaks.
 */
const PATTERNS: readonly RegExp[] = [
  /\/?okf\/[\w.\-/]+/g,
  /mcp__[\w-]+__[\w-]+/g,
];

export function scrubArtifact(text: string): string {
  let out = text;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/scrub.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/src && git commit -m "feat(bench): weighted rubric scoring and artifact scrubbing"
```

---

### Task 6: Aggregation and summary rendering

**Files:**
- Create: `bench/src/aggregate.ts`
- Create: `bench/src/aggregate.test.ts`

**Interfaces:**
- Consumes: `RunResult`, `JudgeResult` from `./result.js`; `SCENARIO_IDS`, `ScenarioId` from `./matrix.js`; `CASES`, `CaseId` from `./cases.js`.
- Produces: `median(values: readonly number[]): number`; `mean(values: readonly number[]): number`; `interface CellSummary { caseId: CaseId; scenarioId: ScenarioId; trials: number; erroredTrials: number; medianAccuracy: number | null; meanTotalTokens: number | null }`; `aggregate(runs: readonly RunResult[], judgements: readonly JudgeResult[]): CellSummary[]`; `renderSummary(summaries: readonly CellSummary[], manifest: Record<string, string>): string`.

- [ ] **Step 1: Write the failing test**

`bench/src/aggregate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregate, mean, median, renderSummary } from "./aggregate.js";
import type { JudgeResult, RunResult } from "./result.js";

function run(overrides: Partial<RunResult> & Pick<RunResult, "runId">): RunResult {
  return {
    caseId: "qa",
    scenarioId: "baseline",
    trial: 1,
    status: "ok",
    usage: {
      inputTokens: 100,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 100,
    },
    startedAt: "2026-07-28T00:00:00.000Z",
    durationMs: 1,
    agentModel: "claude-sonnet-5",
    ...overrides,
  };
}

function judged(runId: string, score: number): JudgeResult {
  return { runId, caseId: "qa", score, criteria: [], judgeModel: "claude-opus-5" };
}

describe("median", () => {
  it("returns the middle value of an odd-length set", () => {
    expect(median([0.2, 0.9, 0.5])).toBe(0.5);
  });

  it("averages the two middle values of an even-length set", () => {
    expect(median([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(0.5);
  });

  it("handles a single value", () => {
    expect(median([0.42])).toBe(0.42);
  });

  it("throws on an empty set", () => {
    expect(() => median([])).toThrow(/empty/i);
  });
});

describe("mean", () => {
  it("averages", () => {
    expect(mean([100, 200, 300])).toBe(200);
  });

  it("throws on an empty set", () => {
    expect(() => mean([])).toThrow(/empty/i);
  });
});

describe("aggregate", () => {
  it("reports the median accuracy and mean tokens for a cell", () => {
    const runs = [
      run({ runId: "qa__baseline__t1", trial: 1 }),
      run({
        runId: "qa__baseline__t2",
        trial: 2,
        usage: {
          inputTokens: 300,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 300,
        },
      }),
      run({
        runId: "qa__baseline__t3",
        trial: 3,
        usage: {
          inputTokens: 200,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 200,
        },
      }),
    ];
    const judgements = [
      judged("qa__baseline__t1", 0.2),
      judged("qa__baseline__t2", 0.9),
      judged("qa__baseline__t3", 0.5),
    ];

    const cell = aggregate(runs, judgements).find(
      (s) => s.caseId === "qa" && s.scenarioId === "baseline",
    );
    expect(cell?.medianAccuracy).toBe(0.5);
    expect(cell?.meanTotalTokens).toBe(200);
    expect(cell?.trials).toBe(3);
    expect(cell?.erroredTrials).toBe(0);
  });

  it("excludes errored runs from aggregates instead of scoring them zero", () => {
    const runs = [
      run({ runId: "qa__baseline__t1", trial: 1 }),
      run({ runId: "qa__baseline__t2", trial: 2, status: "error", error: "boom", usage: undefined }),
    ];
    const judgements = [judged("qa__baseline__t1", 1)];

    const cell = aggregate(runs, judgements).find(
      (s) => s.caseId === "qa" && s.scenarioId === "baseline",
    );
    expect(cell?.medianAccuracy).toBe(1);
    expect(cell?.trials).toBe(1);
    expect(cell?.erroredTrials).toBe(1);
  });

  it("reports null accuracy for a cell whose runs are unjudged", () => {
    const cell = aggregate([run({ runId: "qa__baseline__t1" })], []).find(
      (s) => s.caseId === "qa" && s.scenarioId === "baseline",
    );
    expect(cell?.medianAccuracy).toBeNull();
    expect(cell?.meanTotalTokens).toBe(100);
  });

  it("reports nulls for a cell with no runs at all", () => {
    const cell = aggregate([], []).find(
      (s) => s.caseId === "add-review" && s.scenarioId === "okf-bundle",
    );
    expect(cell?.medianAccuracy).toBeNull();
    expect(cell?.meanTotalTokens).toBeNull();
    expect(cell?.trials).toBe(0);
  });

  it("covers all nine cells", () => {
    expect(aggregate([], []).length).toBe(9);
  });
});

describe("renderSummary", () => {
  it("renders a markdown table including the manifest", () => {
    const md = renderSummary(aggregate([], []), { agentModel: "claude-sonnet-5" });
    expect(md).toContain("# Benchmark results");
    expect(md).toContain("claude-sonnet-5");
    expect(md).toContain("| okf-bundle |");
    expect(md).toContain("n/a");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/aggregate.test.ts`
Expected: FAIL — `Failed to resolve import "./aggregate.js"`.

- [ ] **Step 3: Write `bench/src/aggregate.ts`**

```ts
import { type CaseId, CASES } from "./cases.js";
import { type ScenarioId, SCENARIO_IDS } from "./matrix.js";
import type { JudgeResult, RunResult } from "./result.js";

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot take the median of an empty set");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot take the mean of an empty set");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface CellSummary {
  readonly caseId: CaseId;
  readonly scenarioId: ScenarioId;
  /** Successful trials only. */
  readonly trials: number;
  readonly erroredTrials: number;
  /** Median across successful, judged trials; null when there are none. */
  readonly medianAccuracy: number | null;
  /** Mean across successful trials; null when there are none. */
  readonly meanTotalTokens: number | null;
}

/**
 * Errored cells are excluded, never counted as zero: a harness failure recorded
 * as a zero score reads as a model failure and would quietly bias the result.
 */
export function aggregate(
  runs: readonly RunResult[],
  judgements: readonly JudgeResult[],
): CellSummary[] {
  const scoreByRunId = new Map(judgements.map((j) => [j.runId, j.score]));
  const summaries: CellSummary[] = [];

  for (const benchCase of CASES) {
    for (const scenarioId of SCENARIO_IDS) {
      const cellRuns = runs.filter(
        (r) => r.caseId === benchCase.id && r.scenarioId === scenarioId,
      );
      const ok = cellRuns.filter((r) => r.status === "ok");
      const scores = ok
        .map((r) => scoreByRunId.get(r.runId))
        .filter((s): s is number => s !== undefined);
      const tokens = ok
        .map((r) => r.usage?.totalTokens)
        .filter((t): t is number => t !== undefined);

      summaries.push({
        caseId: benchCase.id,
        scenarioId,
        trials: ok.length,
        erroredTrials: cellRuns.length - ok.length,
        medianAccuracy: scores.length > 0 ? median(scores) : null,
        meanTotalTokens: tokens.length > 0 ? mean(tokens) : null,
      });
    }
  }
  return summaries;
}

function accuracyCell(summary: CellSummary): string {
  return summary.medianAccuracy === null ? "n/a" : summary.medianAccuracy.toFixed(2);
}

function tokenCell(summary: CellSummary): string {
  return summary.meanTotalTokens === null ? "n/a" : Math.round(summary.meanTotalTokens).toLocaleString("en-US");
}

export function renderSummary(
  summaries: readonly CellSummary[],
  manifest: Record<string, string>,
): string {
  const lines: string[] = ["# Benchmark results", ""];

  lines.push("| Field | Value |", "| --- | --- |");
  for (const [key, value] of Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push("");

  lines.push(
    "Accuracy is the median weighted-rubric score across successful trials; tokens are the mean total per run. Errored trials are excluded from both.",
    "",
  );

  for (const benchCase of CASES) {
    lines.push(`## ${benchCase.id}`, "");
    lines.push(
      "| Scenario | Median accuracy | Mean tokens | Trials | Errored |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const scenarioId of SCENARIO_IDS) {
      const summary = summaries.find(
        (s) => s.caseId === benchCase.id && s.scenarioId === scenarioId,
      );
      if (summary === undefined) continue;
      lines.push(
        `| ${scenarioId} | ${accuracyCell(summary)} | ${tokenCell(summary)} | ${summary.trials} | ${summary.erroredTrials} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/aggregate.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/src && git commit -m "feat(bench): cell aggregation and summary rendering"
```

---

### Task 7: The sample shop-api client fixture

**Files:**
- Create: `bench/fixtures/shop-client/package.json`
- Create: `bench/fixtures/shop-client/tsconfig.json`
- Create: `bench/fixtures/shop-client/README.md`
- Create: `bench/fixtures/shop-client/src/client.ts`
- Create: `bench/fixtures/shop-client/src/products.ts`
- Create: `bench/fixtures/shop-client/src/orders.ts`
- Create: `bench/fixtures/shop-client/src/index.ts`
- Create: `bench/src/fixture.test.ts`

**Interfaces:**
- Consumes: `FIXTURE_DIR` from `./constants.js`.
- Produces: no TypeScript exports into the harness. The fixture is data. `bench/src/fixture.test.ts` guards the no-leak property.

**This fixture must not leak the schema.** `baseline` can read it, so generated types, an SDL copy, or a full type mirror would hand it ground truth for free and void the comparison. Untyped transport, narrow local shapes only. The test in this task enforces that mechanically.

- [ ] **Step 1: Write `bench/fixtures/shop-client/package.json`**

```json
{
  "name": "shop-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "A small client for the shop GraphQL API",
  "scripts": {
    "start": "node --experimental-strip-types src/index.ts"
  }
}
```

- [ ] **Step 2: Write `bench/fixtures/shop-client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `bench/fixtures/shop-client/src/client.ts`**

```ts
const ENDPOINT = process.env.SHOP_API_URL ?? "https://shop.example.test/graphql";

export interface RequestOptions {
  /** Sends the caller's session token. Required by operations that need a signed-in customer. */
  readonly authenticated?: boolean;
}

/**
 * Sends an operation to the shop API and hands back the raw `data` payload.
 *
 * Deliberately untyped: each feature module declares the narrow shape it uses.
 */
export async function request(
  query: string,
  variables: Record<string, unknown> = {},
  options: RequestOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.authenticated === true) {
    const token = process.env.SHOP_API_TOKEN;
    if (token === undefined) {
      throw new Error("SHOP_API_TOKEN is required for authenticated operations");
    }
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shop API responded ${response.status}`);
  }

  const payload = (await response.json()) as { data?: unknown; errors?: { message: string }[] };
  if (payload.errors !== undefined && payload.errors.length > 0) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }
  return payload.data;
}
```

- [ ] **Step 4: Write `bench/fixtures/shop-client/src/products.ts`**

```ts
import { request } from "./client.js";

export interface ProductSummary {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
  readonly inStock: boolean;
}

const LIST_PRODUCTS = `
  query ListProducts($first: Int) {
    products(first: $first) {
      id
      name
      inStock
      price { amountCents }
    }
  }
`;

const GET_PRODUCT = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      name
      description
      inStock
      price { amountCents }
    }
  }
`;

interface RawProduct {
  id: string;
  name: string;
  description?: string | null;
  inStock: boolean;
  price: { amountCents: number };
}

function toSummary(raw: RawProduct): ProductSummary {
  return {
    id: raw.id,
    name: raw.name,
    priceCents: raw.price.amountCents,
    inStock: raw.inStock,
  };
}

export async function listProducts(first = 20): Promise<ProductSummary[]> {
  const data = (await request(LIST_PRODUCTS, { first })) as { products: RawProduct[] };
  return data.products.map(toSummary);
}

export async function getProduct(id: string): Promise<ProductSummary | null> {
  const data = (await request(GET_PRODUCT, { id })) as { product: RawProduct | null };
  return data.product === null ? null : toSummary(data.product);
}
```

- [ ] **Step 5: Write `bench/fixtures/shop-client/src/orders.ts`**

```ts
import { request } from "./client.js";

export interface OrderSummary {
  readonly id: string;
  readonly status: string;
  readonly totalCents: number;
}

export interface ShippingAddress {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly postalCode: string;
  readonly country: string;
}

const PLACE_ORDER = `
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input) {
      id
      status
      total { amountCents }
    }
  }
`;

const CANCEL_ORDER = `
  mutation CancelOrder($id: ID!) {
    cancelOrder(id: $id) {
      id
    }
  }
`;

interface RawOrder {
  id: string;
  status: string;
  total: { amountCents: number };
}

export async function placeOrder(
  productIds: string[],
  shipTo: ShippingAddress,
  cardToken: string,
): Promise<OrderSummary> {
  const data = (await request(
    PLACE_ORDER,
    { input: { productIds, shipTo, payWith: { creditCardToken: cardToken } } },
    { authenticated: true },
  )) as { placeOrder: RawOrder };

  return {
    id: data.placeOrder.id,
    status: data.placeOrder.status,
    totalCents: data.placeOrder.total.amountCents,
  };
}

/** Cancels an order the customer no longer wants. */
export async function cancelOrder(orderId: string): Promise<void> {
  await request(CANCEL_ORDER, { id: orderId }, { authenticated: true });
}
```

Note the shape of `cancelOrder`: it passes no reason and discards the response. That is exactly what case 3 asks the agent to change.

- [ ] **Step 6: Write `bench/fixtures/shop-client/src/index.ts`**

```ts
import { cancelOrder, placeOrder } from "./orders.js";
import { getProduct, listProducts } from "./products.js";

async function main(): Promise<void> {
  const products = await listProducts(5);
  for (const product of products) {
    console.log(`${product.name} — ${(product.priceCents / 100).toFixed(2)}`);
  }

  const first = products[0];
  if (first === undefined) {
    console.log("No products available.");
    return;
  }

  const detail = await getProduct(first.id);
  console.log(`Selected: ${detail?.name ?? "unknown"}`);

  const order = await placeOrder(
    [first.id],
    {
      line1: "1 Test Street",
      city: "Porto Alegre",
      postalCode: "90000-000",
      country: "BR",
    },
    "tok_test",
  );
  console.log(`Placed order ${order.id} (${order.status})`);

  await cancelOrder(order.id);
  console.log("Order cancelled.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Write `bench/fixtures/shop-client/README.md`**

```markdown
# shop-client

A small Node client for the shop GraphQL API.

## Layout

- `src/client.ts` — the HTTP transport. One `request()` helper; set
  `authenticated: true` for operations that need a signed-in customer.
- `src/products.ts` — browsing the catalogue.
- `src/orders.ts` — placing and cancelling orders.
- `src/index.ts` — a demo run tying the above together.

## Configuration

- `SHOP_API_URL` — the GraphQL endpoint.
- `SHOP_API_TOKEN` — the customer session token, required for authenticated operations.

## Running

```bash
npm start
```
```

- [ ] **Step 8: Write the failing no-leak test**

`bench/src/fixture.test.ts`:

```ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_DIR } from "./constants.js";

async function fixtureFiles(dir: string = FIXTURE_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await fixtureFiles(full)));
    else files.push(full);
  }
  return files;
}

describe("the fixture must not leak the schema", () => {
  it("ships no SDL file", async () => {
    const files = await fixtureFiles();
    expect(files.filter((f) => f.endsWith(".graphql") || f.endsWith(".gql"))).toEqual([]);
  });

  it("does not depend on graphql-codegen or the graphql package", async () => {
    const manifest = await readFile(join(FIXTURE_DIR, "package.json"), "utf8");
    expect(manifest).not.toMatch(/codegen/i);
    expect(manifest).not.toMatch(/"graphql"/);
  });

  it("never mentions the operations the coding cases must discover", async () => {
    const files = await fixtureFiles();
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, `${file} leaks addReview`).not.toMatch(/addReview/);
      expect(text, `${file} leaks reviewPosted`).not.toMatch(/reviewPosted/);
    }
  });

  it("does not reveal the cancelOrder reason argument", async () => {
    const orders = await readFile(join(FIXTURE_DIR, "src", "orders.ts"), "utf8");
    expect(orders).toMatch(/cancelOrder/);
    expect(orders).not.toMatch(/reason/i);
  });

  it("keeps the transport return type opaque", async () => {
    const client = await readFile(join(FIXTURE_DIR, "src", "client.ts"), "utf8");
    expect(client).toMatch(/Promise<unknown>/);
  });

  it("actually uses the operations the cases build on", async () => {
    const products = await readFile(join(FIXTURE_DIR, "src", "products.ts"), "utf8");
    const orders = await readFile(join(FIXTURE_DIR, "src", "orders.ts"), "utf8");
    expect(products).toMatch(/products\(/);
    expect(products).toMatch(/product\(/);
    expect(orders).toMatch(/placeOrder\(/);
  });
});
```

- [ ] **Step 9: Run the test to verify it passes**

Unlike the other tasks the fixture files are written first, because the test asserts properties *of* them. Run it now and confirm it passes:

Run: `pnpm --filter graphql-okf-bench exec vitest run src/fixture.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 10: Verify the guard actually bites**

Temporarily append the line `// addReview exists too` to `bench/fixtures/shop-client/src/orders.ts`.

Run: `pnpm --filter graphql-okf-bench exec vitest run src/fixture.test.ts`
Expected: FAIL on "never mentions the operations the coding cases must discover".

Remove the temporary line and re-run.
Expected: PASS, 6 tests.

- [ ] **Step 11: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/fixtures bench/src && git commit -m "feat(bench): untyped shop-client fixture with schema-leak guards"
```

---

### Task 8: Workspace lifecycle

**Files:**
- Create: `bench/src/workspace.ts`
- Create: `bench/src/workspace.test.ts`

**Interfaces:**
- Consumes: `FIXTURE_DIR`, `FIXED_NOW`, `SCHEMA_PATH` from `./constants.js`; `runDir` from `./result.js`; `syncOkfBundle` from `graphql-okf`.
- Produces: `prepareWorkspace(runId: string, needsFixture: boolean): Promise<string>` (returns the workspace path); `generateBundle(workspaceDir: string): Promise<void>`; `commitPristine(workspaceDir: string): Promise<void>`; `captureDiff(workspaceDir: string): Promise<string>`.

- [ ] **Step 1: Write the failing test**

`bench/src/workspace.test.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const run = promisify(execFile);
let dir: string;

vi.mock("./constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants.js")>();
  return {
    ...actual,
    get RESULTS_DIR() {
      return dir;
    },
  };
});

const { captureDiff, commitPristine, generateBundle, prepareWorkspace } = await import(
  "./workspace.js"
);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "okf-bench-ws-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("prepareWorkspace", () => {
  it("creates an empty workspace when the case needs no fixture", async () => {
    const ws = await prepareWorkspace("qa__baseline__t1", false);
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(ws)).toEqual([]);
  });

  it("copies the fixture when the case needs it", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    expect(await readFile(join(ws, "src", "orders.ts"), "utf8")).toMatch(/cancelOrder/);
  });

  it("starts from a clean copy even if a previous run left files behind", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    await writeFile(join(ws, "STALE.md"), "leftover", "utf8");
    const again = await prepareWorkspace("add-review__baseline__t1", true);
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(again)).not.toContain("STALE.md");
  });
});

describe("generateBundle", () => {
  it("emits the bundle into okf/shop-api inside the workspace", async () => {
    const ws = await prepareWorkspace("qa__okf-bundle__t1", false);
    await generateBundle(ws);
    expect(await readFile(join(ws, "okf", "shop-api", "index.md"), "utf8")).toContain("okf_version");
    expect(
      await readFile(join(ws, "okf", "shop-api", "mutations", "addReview.md"), "utf8"),
    ).toMatch(/addReview/);
  });

  it("is byte-identical across runs", async () => {
    const a = await prepareWorkspace("qa__okf-bundle__t1", false);
    await generateBundle(a);
    const b = await prepareWorkspace("qa__okf-bundle__t2", false);
    await generateBundle(b);
    const path = join("okf", "shop-api", "mutations", "addReview.md");
    expect(await readFile(join(a, path), "utf8")).toBe(await readFile(join(b, path), "utf8"));
  });
});

describe("commitPristine and captureDiff", () => {
  it("reports no diff when nothing changed", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    await commitPristine(ws);
    expect(await captureDiff(ws)).toBe("");
  });

  it("captures an edit to a tracked file", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    await commitPristine(ws);
    await writeFile(join(ws, "src", "reviews.ts"), "export const x = 1;\n", "utf8");
    const diff = await captureDiff(ws);
    expect(diff).toMatch(/src\/reviews\.ts/);
    expect(diff).toMatch(/export const x = 1;/);
  });

  it("excludes the generated bundle from the diff", async () => {
    const ws = await prepareWorkspace("add-review__okf-bundle__t1", true);
    await generateBundle(ws);
    await commitPristine(ws);
    await writeFile(join(ws, "okf", "shop-api", "SCRIBBLE.md"), "agent scribble\n", "utf8");
    expect(await captureDiff(ws)).toBe("");
  });

  it("commits with a harness identity rather than depending on global git config", async () => {
    const ws = await prepareWorkspace("qa__baseline__t1", false);
    await writeFile(join(ws, "a.txt"), "a\n", "utf8");
    await commitPristine(ws);
    const { stdout } = await run("git", ["-C", ws, "log", "-1", "--format=%an <%ae>"]);
    expect(stdout.trim()).toBe("graphql-okf bench <bench@graphql-okf.invalid>");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/workspace.test.ts`
Expected: FAIL — `Failed to resolve import "./workspace.js"`.

- [ ] **Step 3: Write `bench/src/workspace.ts`**

```ts
import { execFile } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { syncOkfBundle } from "graphql-okf";
import { FIXED_NOW, FIXTURE_DIR, SCHEMA_PATH } from "./constants.js";
import { runDir } from "./result.js";

const exec = promisify(execFile);

/** Where the bundle lands inside a workspace, and what the diff excludes. */
const BUNDLE_DIR = "okf";

const GIT_IDENTITY = [
  "-c",
  "user.name=graphql-okf bench",
  "-c",
  "user.email=bench@graphql-okf.invalid",
];

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...GIT_IDENTITY, ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

export function workspaceDir(runId: string): string {
  return join(runDir(runId), "workspace");
}

/**
 * A fresh directory per cell, always rebuilt from scratch: a botched run must
 * not be able to poison the next one.
 */
export async function prepareWorkspace(runId: string, needsFixture: boolean): Promise<string> {
  const dir = workspaceDir(runId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  if (needsFixture) {
    await cp(FIXTURE_DIR, dir, { recursive: true });
  }
  return dir;
}

/**
 * Emitted fresh rather than copied from the committed `okf/shop-api/`. Emission
 * is deterministic given a fixed `now`, so the bytes match — but generating
 * means the benchmark measures the current emitter, not a stale snapshot.
 */
export async function generateBundle(dir: string): Promise<void> {
  await syncOkfBundle({
    source: { kind: "sdl", path: SCHEMA_PATH },
    outDir: join(dir, BUNDLE_DIR, "shop-api"),
    now: FIXED_NOW,
    resource: "shop-api",
  });
}

/**
 * Snapshots the starting state so the coding artifact is a plain `git diff`.
 * The bundle is gitignored, so a scenario marker cannot ride along into the
 * judge's input — and the agent editing it cannot masquerade as a code change.
 */
export async function commitPristine(dir: string): Promise<void> {
  await writeFile(join(dir, ".gitignore"), `${BUNDLE_DIR}/\n`, "utf8");
  await git(dir, ["init", "--quiet"]);
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "--quiet", "--allow-empty", "-m", "pristine"]);
}

/** Everything the agent changed, including files it created. */
export async function captureDiff(dir: string): Promise<string> {
  await git(dir, ["add", "-A"]);
  return git(dir, ["diff", "--cached"]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/workspace.test.ts`
Expected: PASS, 9 tests.

If the bundle assertions fail on exact filenames, inspect the committed reference bundle at `okf/shop-api/` and correct the expected paths — the naming scheme in `src/model/naming.ts` is the source of truth.

- [ ] **Step 5: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/src && git commit -m "feat(bench): per-run workspace lifecycle with git-diff artifacts"
```

---

### Task 9: Mock GraphQL server

**Files:**
- Create: `bench/src/server.ts`
- Create: `bench/src/server.test.ts`

**Interfaces:**
- Consumes: `SCHEMA_PATH` from `./constants.js`.
- Produces: `interface MockServer { url: string; stop(): Promise<void> }`; `startMockServer(): Promise<MockServer>`.

- [ ] **Step 1: Write the failing test**

`bench/src/server.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MockServer, startMockServer } from "./server.js";

let server: MockServer;

beforeAll(async () => {
  server = await startMockServer();
}, 30_000);

afterAll(async () => {
  await server?.stop();
});

async function graphql(query: string): Promise<Record<string, unknown>> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as Record<string, unknown>;
}

describe("mock server", () => {
  it("listens on an ephemeral port", () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/graphql$/);
  });

  it("answers introspection", async () => {
    const body = await graphql("{ __schema { queryType { name } } }");
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({ __schema: { queryType: { name: "Query" } } });
  });

  it("exposes the mutation the coding cases need to discover", async () => {
    const body = await graphql(`{
      __type(name: "Mutation") { fields { name args { name type { kind name ofType { name } } } } }
    }`);
    const fields = (
      body.data as { __type: { fields: { name: string }[] } }
    ).__type.fields.map((f) => f.name);
    expect(fields).toContain("addReview");
    expect(fields).toContain("cancelOrder");
  });

  it("reports cancelOrder's reason argument as nullable", async () => {
    const body = await graphql(`{
      __type(name: "Mutation") {
        fields { name args { name type { kind name } } }
      }
    }`);
    const mutation = (
      body.data as {
        __type: { fields: { name: string; args: { name: string; type: { kind: string } }[] }[] };
      }
    ).__type.fields.find((f) => f.name === "cancelOrder");
    const reason = mutation?.args.find((a) => a.name === "reason");
    expect(reason?.type.kind).toBe("SCALAR");
  });

  it("executes a query with mocked data", async () => {
    const body = await graphql("{ products(first: 2) { id name } }");
    expect(body.errors).toBeUndefined();
    expect(Array.isArray((body.data as { products: unknown[] }).products)).toBe(true);
  });

  it("stops cleanly and refuses further connections", async () => {
    const temp = await startMockServer();
    const url = temp.url;
    await temp.stop();
    await expect(fetch(url, { method: "POST" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/server.test.ts`
Expected: FAIL — `Failed to resolve import "./server.js"`.

- [ ] **Step 3: Write `bench/src/server.ts`**

```ts
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { addMocksToSchema } from "@graphql-tools/mock";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createYoga } from "graphql-yoga";
import { SCHEMA_PATH } from "./constants.js";

export interface MockServer {
  /** The GraphQL endpoint an MCP server should be pointed at. */
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Serves the shop schema over HTTP so the graphql-mcp scenario reflects how such
 * a server is really deployed: introspection against a live endpoint.
 *
 * Nothing in the benchmark asserts on response *values* — grading looks at which
 * operations and shapes the agent used — so generic mocks are sufficient.
 */
export async function startMockServer(): Promise<MockServer> {
  const typeDefs = await readFile(SCHEMA_PATH, "utf8");
  const schema = addMocksToSchema({ schema: makeExecutableSchema({ typeDefs }) });

  const yoga = createYoga({ schema, graphqlEndpoint: "/graphql", logging: false });
  const server = createServer(yoga);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Mock server did not bind to a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/graphql`,
    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}
```

If `makeExecutableSchema` rejects the SDL because the schema declares directives it does not implement (`@auth`, `@tag`), the schema still builds — directive *definitions* are part of the SDL and are preserved. Confirm via the introspection test; if it fails, the fix is to keep the definitions and supply no resolvers, not to strip them from the schema (the directives are load-bearing for cases 1 and 2).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/server.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/src && git commit -m "feat(bench): mock GraphQL server backing the graphql-mcp scenario"
```

---

### Task 10: Scenario descriptors

**Files:**
- Create: `bench/src/scenarios.ts`
- Create: `bench/src/scenarios.test.ts`

**Interfaces:**
- Consumes: `generateBundle` from `./workspace.js`; `ScenarioId` from `./matrix.js`.
- Produces: `interface RunContext { endpointUrl?: string }`; `interface Scenario { id: ScenarioId; setupWorkspace(dir: string, ctx: RunContext): Promise<void>; mcpServers(ctx: RunContext): Record<string, McpServerEntry> }`; `type McpServerEntry = { type: "http"; url: string }`; `SCENARIOS: readonly Scenario[]`; `scenarioById(id: string): Scenario`; `needsEndpoint(scenarioIds: readonly ScenarioId[]): boolean`.

The `Scenario` interface has exactly two members beyond `id`. Adding a third — a system-prompt override, a model override, a tool-list override — would introduce a second variable and void the benchmark. Do not extend it.

**Choosing the MCP product.** Issue #12 leaves this to implementation time. Requirement: it must serve a live endpoint by introspection, not an SDL file. Pick one, add it to `bench/package.json` pinned to an exact version, and record the choice in `manifest.json` (Task 12). The `MCP_SERVER_PACKAGE` / `MCP_SERVER_VERSION` constants below are the single place the choice is recorded — update both when you pick.

- [ ] **Step 1: Write the failing test**

`bench/src/scenarios.test.ts`:

```ts
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCENARIOS, needsEndpoint, scenarioById } from "./scenarios.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "okf-bench-scenario-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scenarios", () => {
  it("declares exactly the three specified scenarios", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["okf-bundle", "graphql-mcp", "baseline"]);
  });

  it("rejects an unknown scenario id", () => {
    expect(() => scenarioById("nope")).toThrow(/unknown scenario/i);
  });

  it("exposes exactly the two permitted members, so only one variable can move", () => {
    for (const scenario of SCENARIOS) {
      expect(Object.keys(scenario).sort()).toEqual(["id", "mcpServers", "setupWorkspace"]);
    }
  });
});

describe("okf-bundle", () => {
  it("puts the bundle in the workspace and registers no mcp server", async () => {
    const scenario = scenarioById("okf-bundle");
    await scenario.setupWorkspace(dir, {});
    expect(await readdir(join(dir, "okf", "shop-api"))).toContain("index.md");
    expect(scenario.mcpServers({})).toEqual({});
  });
});

describe("graphql-mcp", () => {
  it("adds nothing to the workspace", async () => {
    const scenario = scenarioById("graphql-mcp");
    await scenario.setupWorkspace(dir, { endpointUrl: "http://127.0.0.1:1/graphql" });
    expect(await readdir(dir)).toEqual([]);
  });

  it("registers one http mcp server pointed at the endpoint", () => {
    const servers = scenarioById("graphql-mcp").mcpServers({
      endpointUrl: "http://127.0.0.1:4000/graphql",
    });
    expect(Object.keys(servers)).toEqual(["graphql"]);
    expect(servers.graphql?.type).toBe("http");
  });

  it("fails loudly when no endpoint was provided", () => {
    expect(() => scenarioById("graphql-mcp").mcpServers({})).toThrow(/endpoint/i);
  });
});

describe("baseline", () => {
  it("adds nothing at all", async () => {
    const scenario = scenarioById("baseline");
    await scenario.setupWorkspace(dir, {});
    expect(await readdir(dir)).toEqual([]);
    expect(scenario.mcpServers({})).toEqual({});
  });
});

describe("needsEndpoint", () => {
  it("is true only when a graphql-mcp cell is scheduled", () => {
    expect(needsEndpoint(["graphql-mcp"])).toBe(true);
    expect(needsEndpoint(["baseline", "graphql-mcp"])).toBe(true);
    expect(needsEndpoint(["baseline", "okf-bundle"])).toBe(false);
    expect(needsEndpoint([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/scenarios.test.ts`
Expected: FAIL — `Failed to resolve import "./scenarios.js"`.

- [ ] **Step 3: Write `bench/src/scenarios.ts`**

```ts
import type { ScenarioId } from "./matrix.js";
import { generateBundle } from "./workspace.js";

/**
 * The GraphQL MCP product under test. Recorded in the run manifest so any
 * published number is traceable to the server that produced it.
 *
 * Requirement: it must introspect a live endpoint, not load an SDL file.
 */
export const MCP_SERVER_PACKAGE = "REPLACE_ME_AT_IMPLEMENTATION_TIME";
export const MCP_SERVER_VERSION = "REPLACE_ME_AT_IMPLEMENTATION_TIME";

/** The name the server is registered under; tools become `mcp__graphql__*`. */
export const MCP_SERVER_NAME = "graphql";

export type McpServerEntry = { readonly type: "http"; readonly url: string };

/** Per-invocation facts a scenario may consult. */
export interface RunContext {
  /** The mock server's endpoint. Present whenever a graphql-mcp cell is scheduled. */
  readonly endpointUrl?: string;
}

/**
 * A scenario may influence a run through exactly these two members. There is
 * deliberately no field for system prompt, model, tools, or turn limit: those
 * are shared by every scenario, which is what makes the comparison honest.
 */
export interface Scenario {
  readonly id: ScenarioId;
  setupWorkspace(dir: string, ctx: RunContext): Promise<void>;
  mcpServers(ctx: RunContext): Record<string, McpServerEntry>;
}

async function noSetup(): Promise<void> {
  // Intentionally empty: this scenario contributes nothing to the workspace.
}

function noServers(): Record<string, McpServerEntry> {
  return {};
}

export const SCENARIOS: readonly Scenario[] = Object.freeze([
  {
    id: "okf-bundle",
    async setupWorkspace(dir: string): Promise<void> {
      await generateBundle(dir);
    },
    mcpServers: noServers,
  },
  {
    id: "graphql-mcp",
    setupWorkspace: noSetup,
    mcpServers(ctx: RunContext): Record<string, McpServerEntry> {
      if (ctx.endpointUrl === undefined) {
        throw new Error("graphql-mcp needs an endpoint URL; the mock server was not started");
      }
      return { [MCP_SERVER_NAME]: { type: "http", url: ctx.endpointUrl } };
    },
  },
  {
    id: "baseline",
    setupWorkspace: noSetup,
    mcpServers: noServers,
  },
]);

export function scenarioById(id: string): Scenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(
      `Unknown scenario "${id}". Known scenarios: ${SCENARIOS.map((s) => s.id).join(", ")}`,
    );
  }
  return found;
}

/** The mock server is started only when the scheduled matrix actually needs it. */
export function needsEndpoint(scenarioIds: readonly ScenarioId[]): boolean {
  return scenarioIds.includes("graphql-mcp");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/scenarios.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Pick the MCP product**

Choose a GraphQL MCP server that introspects a live HTTP endpoint. Add it to `bench/package.json` `dependencies` pinned to an exact version, then replace both `REPLACE_ME_AT_IMPLEMENTATION_TIME` constants with the package name and the exact resolved version.

Run: `pnpm install`
Expected: resolves, no errors.

Verify no placeholder survives:

Run: `grep -R "REPLACE_ME_AT_IMPLEMENTATION_TIME" bench/ ; test $? -eq 1`
Expected: exit 0 (grep found nothing).

If the chosen server is a stdio process rather than an HTTP endpoint, widen `McpServerEntry` to a union including `{ command: string; args: string[]; env?: Record<string, string> }` and have `graphql-mcp` return that shape with the endpoint passed as an argument or env var. Update the `graphql-mcp` test accordingly. Do not add members to `Scenario`.

- [ ] **Step 6: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/ && git commit -m "feat(bench): declarative scenario descriptors"
```

---

### Task 11: The runner

**Files:**
- Create: `bench/src/agent-config.ts`
- Create: `bench/src/agent-config.test.ts`
- Create: `bench/src/runner.ts`
- Create: `bench/src/probe.ts`

**Interfaces:**
- Consumes: `AGENT_MODEL` from `./constants.js`; `Cell` from `./matrix.js`; `Scenario`, `RunContext` from `./scenarios.js`; `caseById`, `loadPrompt` from `./cases.js`; `prepareWorkspace`, `generateBundle`, `commitPristine`, `captureDiff` from `./workspace.js`; `normalizeUsage` from `./usage.js`; `writeRunResult`, `runDir` from `./result.js`.
- Produces: `SHARED_SYSTEM_PROMPT: string`; `SHARED_TOOLS: readonly string[]`; `MAX_TURNS: number`; `buildQueryOptions(args): QueryOptions`; `runCell(cell: Cell, scenario: Scenario, ctx: RunContext): Promise<RunResult>`.

`runner.ts` must contain no `if (scenario.id === ...)` and no `if (caseId === ...)` beyond dispatching on the case's declared `artifactKind`. It consumes descriptors.

- [ ] **Step 1: Write the failing test for the shared agent config**

`bench/src/agent-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQueryOptions, MAX_TURNS, SHARED_SYSTEM_PROMPT, SHARED_TOOLS } from "./agent-config.js";
import { scenarioById } from "./scenarios.js";

describe("shared system prompt", () => {
  it("names no scenario, tool, bundle, or schema", () => {
    const lowered = SHARED_SYSTEM_PROMPT.toLowerCase();
    for (const marker of ["okf", "bundle", "mcp", "introspect", "graphql", "schema", "baseline"]) {
      expect(lowered, `system prompt must not mention "${marker}"`).not.toContain(marker);
    }
  });

  it("is non-empty", () => {
    expect(SHARED_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });
});

describe("shared tools", () => {
  it("grants edit capability but never command execution", () => {
    expect([...SHARED_TOOLS].sort()).toEqual(["Edit", "Glob", "Grep", "Read", "Write"]);
    expect(SHARED_TOOLS).not.toContain("Bash");
  });
});

describe("buildQueryOptions", () => {
  const base = { cwd: "/tmp/ws", scenario: scenarioById("baseline"), ctx: {} };

  it("pins the agent model", () => {
    expect(buildQueryOptions(base).model).toBe("claude-sonnet-5");
  });

  it("disables filesystem settings so no CLAUDE.md leaks into the agent", () => {
    expect(buildQueryOptions(base).settingSources).toEqual([]);
  });

  it("uses the shared prompt, tools, and turn cap for every scenario", () => {
    for (const id of ["okf-bundle", "graphql-mcp", "baseline"]) {
      const ctx = id === "graphql-mcp" ? { endpointUrl: "http://127.0.0.1:1/graphql" } : {};
      const options = buildQueryOptions({ cwd: "/tmp/ws", scenario: scenarioById(id), ctx });
      expect(options.systemPrompt).toBe(SHARED_SYSTEM_PROMPT);
      expect(options.tools).toEqual([...SHARED_TOOLS]);
      expect(options.maxTurns).toBe(MAX_TURNS);
      expect(options.model).toBe("claude-sonnet-5");
    }
  });

  it("differs between scenarios only in mcpServers and allowedTools", () => {
    const baseline = buildQueryOptions(base);
    const mcp = buildQueryOptions({
      cwd: "/tmp/ws",
      scenario: scenarioById("graphql-mcp"),
      ctx: { endpointUrl: "http://127.0.0.1:4000/graphql" },
    });

    const differing = Object.keys(baseline).filter(
      (key) =>
        JSON.stringify((baseline as Record<string, unknown>)[key]) !==
        JSON.stringify((mcp as Record<string, unknown>)[key]),
    );
    expect(differing.sort()).toEqual(["allowedTools", "mcpServers"]);
  });

  it("allows the registered mcp server's tools", () => {
    const options = buildQueryOptions({
      cwd: "/tmp/ws",
      scenario: scenarioById("graphql-mcp"),
      ctx: { endpointUrl: "http://127.0.0.1:4000/graphql" },
    });
    expect(options.allowedTools).toContain("mcp__graphql__*");
  });

  it("sets the workspace as the working directory", () => {
    expect(buildQueryOptions({ ...base, cwd: "/tmp/other" }).cwd).toBe("/tmp/other");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/agent-config.test.ts`
Expected: FAIL — `Failed to resolve import "./agent-config.js"`.

- [ ] **Step 3: Write `bench/src/agent-config.ts`**

```ts
import { AGENT_MODEL } from "./constants.js";
import { MCP_SERVER_NAME, type McpServerEntry, type RunContext, type Scenario } from "./scenarios.js";

/**
 * One prompt for all three scenarios. It must not hint at what context exists:
 * naming a bundle, a tool, or even "GraphQL" would move a second variable.
 */
export const SHARED_SYSTEM_PROMPT = [
  "You are a software engineer working in the given directory.",
  "Complete the user's task using the files and tools available to you.",
  "Do not ask clarifying questions; there is nobody available to answer them.",
].join(" ");

/** No Bash: the fixture is untyped, so command execution buys variance, not signal. */
export const SHARED_TOOLS: readonly string[] = Object.freeze([
  "Read",
  "Glob",
  "Grep",
  "Edit",
  "Write",
]);

export const MAX_TURNS = 40;

export interface QueryOptions {
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: string[];
  readonly allowedTools: string[];
  readonly maxTurns: number;
  readonly cwd: string;
  readonly permissionMode: "bypassPermissions";
  readonly settingSources: never[];
  readonly mcpServers: Record<string, McpServerEntry>;
}

export interface BuildQueryOptionsArgs {
  readonly cwd: string;
  readonly scenario: Scenario;
  readonly ctx: RunContext;
}

/**
 * The single place a run's agent configuration is built. Every field except
 * `mcpServers` and the MCP entry in `allowedTools` is identical across
 * scenarios — that is the property the benchmark rests on.
 */
export function buildQueryOptions({ cwd, scenario, ctx }: BuildQueryOptionsArgs): QueryOptions {
  const mcpServers = scenario.mcpServers(ctx);
  const allowedTools = [...SHARED_TOOLS];
  if (Object.keys(mcpServers).length > 0) {
    allowedTools.push(`mcp__${MCP_SERVER_NAME}__*`);
  }

  return {
    model: AGENT_MODEL,
    systemPrompt: SHARED_SYSTEM_PROMPT,
    tools: [...SHARED_TOOLS],
    allowedTools,
    maxTurns: MAX_TURNS,
    cwd,
    permissionMode: "bypassPermissions",
    // Without this the SDK loads user/project/local settings — including this
    // repo's CLAUDE.md — into the agent under test, contaminating every run.
    settingSources: [],
    mcpServers,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/agent-config.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the probe script**

The Agent SDK's docs describe the result message's usage in more than one shape. Confirm which one this installed version emits before trusting recorded token counts.

`bench/src/probe.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildQueryOptions } from "./agent-config.js";
import { scenarioById } from "./scenarios.js";
import { normalizeUsage } from "./usage.js";

/**
 * One trivial run, printing the raw terminal message. Use it to confirm the
 * SDK's result-message shape before trusting recorded token counts.
 */
async function main(): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "okf-bench-probe-"));
  const options = buildQueryOptions({ cwd, scenario: scenarioById("baseline"), ctx: {} });

  for await (const message of query({ prompt: "Reply with the single word: ok", options })) {
    if (message.type === "result") {
      console.log("--- raw result message ---");
      console.log(JSON.stringify(message, null, 2));
      console.log("--- normalised usage ---");
      console.log(JSON.stringify(normalizeUsage(message), null, 2));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Run the probe and reconcile**

Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY pnpm --filter graphql-okf-bench exec node --experimental-strip-types src/probe.ts`
Expected: prints a result message, then a normalised usage object with **non-zero** `inputTokens` and `outputTokens`.

If the normalised usage is all zeros, the SDK's actual shape matches neither documented form. Read the printed raw message, add a case for the real shape to `normalizeUsage`, add a test for it in `usage.test.ts` using the observed payload, and re-run. Do not proceed with zeros — silently recording zero tokens would make the benchmark's central cost claim meaningless.

Also note from the printed message whether the final assistant text is reachable from the result message; if it is not, the runner (next step) must accumulate it from `assistant` messages, which is what it does below.

- [ ] **Step 7: Write `bench/src/runner.ts`**

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildQueryOptions } from "./agent-config.js";
import { AGENT_MODEL } from "./constants.js";
import { caseById, loadPrompt } from "./cases.js";
import type { Cell } from "./matrix.js";
import { type RunResult, runDir, writeRunResult } from "./result.js";
import type { RunContext, Scenario } from "./scenarios.js";
import { normalizeUsage } from "./usage.js";
import { captureDiff, commitPristine, prepareWorkspace } from "./workspace.js";

function textOf(message: unknown): string {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

/**
 * Executes ONE cell. Knows nothing about which scenario or case it is running —
 * it consumes descriptors, which is what keeps the three scenarios identical
 * everywhere except the two members a Scenario is allowed to contribute.
 */
export async function runCell(
  cell: Cell,
  scenario: Scenario,
  ctx: RunContext,
): Promise<RunResult> {
  const benchCase = caseById(cell.caseId);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const base = {
    runId: cell.runId,
    caseId: cell.caseId,
    scenarioId: cell.scenarioId,
    trial: cell.trial,
    startedAt,
    agentModel: AGENT_MODEL,
  };

  try {
    const cwd = await prepareWorkspace(cell.runId, benchCase.needsFixture);
    await scenario.setupWorkspace(cwd, ctx);
    await commitPristine(cwd);

    const prompt = await loadPrompt(cell.caseId);
    const options = buildQueryOptions({ cwd, scenario, ctx });

    const transcript: unknown[] = [];
    const assistantText: string[] = [];
    let usage = normalizeUsage(null);
    let costUsd: number | undefined;

    for await (const message of query({ prompt, options })) {
      transcript.push(message);
      if (message.type === "assistant") {
        const text = textOf(message);
        if (text !== "") assistantText.push(text);
      }
      if (message.type === "result") {
        usage = normalizeUsage(message);
        const raw = message as { total_cost_usd?: number; result?: { total_cost_usd?: number } };
        costUsd = raw.total_cost_usd ?? raw.result?.total_cost_usd;
      }
    }

    const dir = runDir(cell.runId);
    await writeFile(
      join(dir, "transcript.jsonl"),
      `${transcript.map((m) => JSON.stringify(m)).join("\n")}\n`,
      "utf8",
    );

    if (benchCase.artifactKind === "answer") {
      await writeFile(join(dir, "artifact.txt"), `${assistantText.join("\n\n")}\n`, "utf8");
    } else {
      await writeFile(join(dir, "artifact.diff"), await captureDiff(cwd), "utf8");
    }

    const result: RunResult = {
      ...base,
      status: "ok",
      usage,
      costUsd,
      durationMs: Date.now() - startedMs,
    };
    await writeRunResult(result);
    return result;
  } catch (error) {
    // Recorded, never rethrown: one bad cell must not cost the rest of the matrix.
    const result: RunResult = {
      ...base,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedMs,
    };
    await writeRunResult(result);
    return result;
  }
}
```

- [ ] **Step 8: Verify the runner end-to-end on one cheap cell**

Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY pnpm --filter graphql-okf-bench exec node --experimental-strip-types -e "import('./src/runner.ts').then(async(m)=>{const {scenarioById}=await import('./src/scenarios.ts');console.log(await m.runCell({runId:'qa__baseline__t1',caseId:'qa',scenarioId:'baseline',trial:1},scenarioById('baseline'),{}))})"`
Expected: `status: "ok"`, non-zero `usage.totalTokens`, and `bench/results/qa__baseline__t1/artifact.txt` containing an answer.

Confirm the answer is genuinely uninformed (baseline has no schema) — a confident, correct answer here would mean context is leaking from somewhere and must be tracked down before any real run.

Then delete the scratch result: `rm -rf bench/results/qa__baseline__t1`

- [ ] **Step 9: Format, typecheck, commit**

```bash
pnpm run format && pnpm run typecheck:bench && git add bench/src && git commit -m "feat(bench): shared agent config and per-cell runner"
```

---

### Task 12: The three CLIs

**Files:**
- Create: `bench/src/judge.ts`
- Create: `bench/src/run.ts`
- Create: `bench/src/judge-cli.ts`
- Create: `bench/src/report-cli.ts`
- Create: `bench/src/manifest.ts`
- Create: `bench/src/manifest.test.ts`

**Interfaces:**
- Consumes: everything built so far.
- Produces: `judgeArtifact(caseId: CaseId, artifact: string): Promise<CriterionOutcome[]>`; `buildManifest(): Promise<Record<string, string>>`; three executable entry points.

`judge.ts` must not import `scenarios.ts`. That absence is the structural half of blinding — enforced by a test below.

- [ ] **Step 1: Write the failing manifest test**

`bench/src/manifest.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "./manifest.js";
import { BENCH_ROOT } from "./constants.js";

describe("buildManifest", () => {
  it("records the pinned models", async () => {
    const manifest = await buildManifest();
    expect(manifest.agentModel).toBe("claude-sonnet-5");
    expect(manifest.judgeModel).toBe("claude-opus-5");
  });

  it("records the graphql-okf commit under test", async () => {
    const manifest = await buildManifest();
    expect(manifest.graphqlOkfCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("records the mcp product and version", async () => {
    const manifest = await buildManifest();
    expect(manifest.mcpServerPackage).not.toMatch(/REPLACE_ME/);
    expect(manifest.mcpServerVersion).not.toMatch(/REPLACE_ME/);
  });

  it("records a run date", async () => {
    expect(Number.isNaN(Date.parse((await buildManifest()).runDate ?? ""))).toBe(false);
  });
});

describe("judge blinding", () => {
  it("does not import the scenario vocabulary", async () => {
    const source = await readFile(join(BENCH_ROOT, "src", "judge.ts"), "utf8");
    expect(source).not.toMatch(/scenarios\.js/);
    expect(source).not.toMatch(/okf-bundle|graphql-mcp|baseline/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/manifest.test.ts`
Expected: FAIL — `Failed to resolve import "./manifest.js"`.

- [ ] **Step 3: Write `bench/src/manifest.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AGENT_MODEL, JUDGE_MODEL, REPO_ROOT } from "./constants.js";
import { MCP_SERVER_PACKAGE, MCP_SERVER_VERSION } from "./scenarios.js";

const exec = promisify(execFile);

/**
 * Everything needed to trace a published number back to the configuration that
 * produced it. Committed alongside the summary.
 */
export async function buildManifest(): Promise<Record<string, string>> {
  const { stdout } = await exec("git", ["-C", REPO_ROOT, "rev-parse", "HEAD"]);
  return {
    agentModel: AGENT_MODEL,
    judgeModel: JUDGE_MODEL,
    graphqlOkfCommit: stdout.trim(),
    mcpServerPackage: MCP_SERVER_PACKAGE,
    mcpServerVersion: MCP_SERVER_VERSION,
    runDate: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/manifest.test.ts`
Expected: PASS, 5 tests (the blinding test passes trivially until `judge.ts` exists; it is re-run in step 6).

- [ ] **Step 5: Write `bench/src/judge.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { type CaseId, loadRubric } from "./cases.js";
import { JUDGE_MODEL } from "./constants.js";
import type { CriterionOutcome } from "./result.js";
import { scrubArtifact } from "./scrub.js";

const OutcomesSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      justification: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "You are grading a software engineering artifact against a fixed rubric.",
  "Judge each criterion independently and literally: mark it passed only if the artifact",
  "satisfies exactly what the criterion states. Do not reward effort, style, or intent.",
  "Return one entry for every criterion id in the rubric, and no others.",
  "Give a one-sentence justification for each, quoting the artifact where useful.",
].join(" ");

/**
 * Grades one artifact. Receives the rubric and the artifact and nothing else —
 * no scenario name, no transcript, no record of what context the agent had.
 */
export async function judgeArtifact(
  caseId: CaseId,
  artifact: string,
): Promise<CriterionOutcome[]> {
  const rubric = await loadRubric(caseId);
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(OutcomesSchema) },
    messages: [
      {
        role: "user",
        content: [
          "<rubric>",
          JSON.stringify(rubric, null, 2),
          "</rubric>",
          "",
          "<artifact>",
          scrubArtifact(artifact),
          "</artifact>",
        ].join("\n"),
      },
    ],
  });

  const parsed = response.parsed_output;
  if (parsed === null || parsed === undefined) {
    throw new Error(`Judge returned no parseable output for case "${caseId}"`);
  }
  return parsed.criteria;
}
```

- [ ] **Step 6: Re-run the manifest test to confirm blinding holds**

Run: `pnpm --filter graphql-okf-bench exec vitest run src/manifest.test.ts`
Expected: PASS, 5 tests — including "does not import the scenario vocabulary" now that `judge.ts` exists.

- [ ] **Step 7: Write `bench/src/run.ts`**

```ts
import { parseArgs } from "node:util";
import { buildMatrix, type Cell, filterPending, type ScenarioId } from "./matrix.js";
import { runResultExists } from "./result.js";
import { runCell } from "./runner.js";
import { needsEndpoint, type RunContext, scenarioById } from "./scenarios.js";
import { type MockServer, startMockServer } from "./server.js";

function parse(): { cells: Cell[]; force: boolean } {
  const { values } = parseArgs({
    options: {
      scenario: { type: "string" },
      case: { type: "string" },
      trials: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  const cells = buildMatrix({
    scenario: values.scenario,
    case: values.case,
    trials: values.trials === undefined ? undefined : Number(values.trials),
  });
  return { cells, force: values.force === true };
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY === undefined) {
    throw new Error("ANTHROPIC_API_KEY is not set; refusing to start a paid run");
  }

  const { cells, force } = parse();
  const pending = await filterPending(cells, runResultExists, force);
  console.log(`${cells.length} cells scheduled, ${pending.length} to run.`);
  if (pending.length === 0) return;

  const scenarioIds = [...new Set(pending.map((c) => c.scenarioId))] as ScenarioId[];
  let server: MockServer | undefined;
  if (needsEndpoint(scenarioIds)) {
    server = await startMockServer();
    console.log(`Mock GraphQL server on ${server.url}`);
  }
  const ctx: RunContext = { endpointUrl: server?.url };

  let totalTokens = 0;
  let errored = 0;
  try {
    for (const [index, cell] of pending.entries()) {
      process.stdout.write(`[${index + 1}/${pending.length}] ${cell.runId} ... `);
      const result = await runCell(cell, scenarioById(cell.scenarioId), ctx);
      if (result.status === "ok") {
        totalTokens += result.usage?.totalTokens ?? 0;
        console.log(`ok (${result.usage?.totalTokens ?? 0} tokens, ${result.durationMs}ms)`);
      } else {
        errored += 1;
        console.log(`ERROR: ${result.error ?? "unknown"}`);
      }
    }
  } finally {
    await server?.stop();
  }

  console.log(`\nDone. ${totalTokens} tokens across ${pending.length} runs, ${errored} errored.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 8: Write `bench/src/judge-cli.ts`**

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { caseById } from "./cases.js";
import { JUDGE_MODEL } from "./constants.js";
import { judgeArtifact } from "./judge.js";
import { scoreRubric } from "./scoring.js";
import { loadRubric } from "./cases.js";
import { judgeResultExists, listRunResults, runDir, writeJudgeResult } from "./result.js";

/** Fisher-Yates. Run order is shuffled so grading cannot drift with matrix order. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY === undefined) {
    throw new Error("ANTHROPIC_API_KEY is not set; refusing to start a paid judging pass");
  }

  const { values } = parseArgs({ options: { force: { type: "boolean", default: false } } });
  const force = values.force === true;

  const runs = (await listRunResults()).filter((r) => r.status === "ok");
  const pending: typeof runs = [];
  for (const run of runs) {
    if (force || !(await judgeResultExists(run.runId))) pending.push(run);
  }

  console.log(`${runs.length} successful runs, ${pending.length} to judge.`);

  for (const [index, run] of shuffle(pending).entries()) {
    const benchCase = caseById(run.caseId);
    const filename = benchCase.artifactKind === "answer" ? "artifact.txt" : "artifact.diff";
    process.stdout.write(`[${index + 1}/${pending.length}] ${run.runId} ... `);
    try {
      const artifact = await readFile(join(runDir(run.runId), filename), "utf8");
      const criteria = await judgeArtifact(benchCase.id, artifact);
      const score = scoreRubric(await loadRubric(benchCase.id), criteria);
      await writeJudgeResult({
        runId: run.runId,
        caseId: benchCase.id,
        score,
        criteria,
        judgeModel: JUDGE_MODEL,
      });
      console.log(`scored ${score.toFixed(2)}`);
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 9: Write `bench/src/report-cli.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { aggregate, renderSummary } from "./aggregate.js";
import { RESULTS_DIR } from "./constants.js";
import { buildManifest } from "./manifest.js";
import { judgeResultExists, listRunResults, readJudgeResult } from "./result.js";

async function main(): Promise<void> {
  const runs = await listRunResults();
  const judgements = [];
  for (const run of runs) {
    if (await judgeResultExists(run.runId)) {
      judgements.push(await readJudgeResult(run.runId));
    }
  }

  const manifest = await buildManifest();
  const summaries = aggregate(runs, judgements);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    join(RESULTS_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  const summary = renderSummary(summaries, manifest);
  await writeFile(join(RESULTS_DIR, "summary.md"), summary, "utf8");

  console.log(summary);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 10: Verify the full pipeline on a one-cell slice**

Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY pnpm --filter graphql-okf-bench run bench -- --case qa --scenario baseline --trials 1`
Expected: `1 cells scheduled, 1 to run.` then `ok (N tokens, …)` with N > 0.

Run the same command again.
Expected: `1 cells scheduled, 0 to run.` — resumability works.

Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY pnpm --filter graphql-okf-bench run judge`
Expected: `scored 0.xx` for the one run.

Run: `pnpm --filter graphql-okf-bench run report`
Expected: prints a markdown table; `bench/results/summary.md` and `bench/results/manifest.json` exist; the eight cells with no runs show `n/a`.

- [ ] **Step 11: Verify the mcp scenario connects**

Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY MCP_CONNECTION_NONBLOCKING=0 pnpm --filter graphql-okf-bench run bench -- --case qa --scenario graphql-mcp --trials 1`
Expected: prints the mock server URL, then `ok`. Inspect `bench/results/qa__graphql-mcp__t1/transcript.jsonl` and confirm at least one `mcp__graphql__*` tool call appears.

If no MCP tool is called, check the `system`/`init` message in the transcript for the server's status. `failed` or `needs-auth` means the server is misconfigured; `pending` at init is normal, which is why `MCP_CONNECTION_NONBLOCKING=0` is set here — keep it set for real runs so the tool is available on turn one in every trial.

Then clear the scratch results: `rm -rf bench/results/qa__baseline__t1 bench/results/qa__graphql-mcp__t1 bench/results/summary.md bench/results/manifest.json`

- [ ] **Step 12: Format, typecheck, full test run, commit**

```bash
pnpm run format && pnpm run typecheck:bench && pnpm --filter graphql-okf-bench run test && git add bench/src && git commit -m "feat(bench): bench, judge, and report entry points"
```

---

### Task 13: Documentation and final gate

**Files:**
- Create: `bench/README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write `bench/README.md`**

````markdown
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

```bash
export ANTHROPIC_API_KEY=...
export MCP_CONNECTION_NONBLOCKING=0   # MCP tools available on turn one

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
````

- [ ] **Step 2: Add a `bench/` note to `CLAUDE.md`**

In `CLAUDE.md`, immediately after the "Stack" section, insert:

```markdown
## The benchmark workspace

`bench/` is a **separate, private pnpm workspace** (`graphql-okf-bench`) holding the
benchmark harness from issue #12. It is deliberately excluded from the root
package's Vitest, coverage, knip, and tsconfig, and **never runs in CI** — it makes
paid, nondeterministic model calls, which the shipped package must never do.
Nothing in `bench/` is part of the published package or subject to `M1/GOAL-8.1`.
See `bench/README.md`.
```

- [ ] **Step 3: Run the complete gate**

Run: `pnpm install --frozen-lockfile`
Expected: exit 0.

Run: `pnpm run coverage`
Expected: PASS, thresholds met, no `bench/**` file in the coverage report.

Run: `pnpm run lint`
Expected: exit 0.

Run: `pnpm run typecheck && pnpm run typecheck:bench`
Expected: both exit 0.

Run: `pnpm run knip`
Expected: exit 0.

Run: `pnpm run build`
Expected: exit 0, `dist/` contains only the library — no bench output.

Run: `pnpm --filter graphql-okf-bench run test`
Expected: all suites pass.

- [ ] **Step 4: Confirm the shipped package is untouched**

Run: `pnpm pack --pack-destination /tmp && tar -tzf /tmp/graphql-okf-*.tgz | grep -c bench ; test $? -eq 1`
Expected: exit 0 (grep found no `bench` entries in the tarball).

Then: `rm -f /tmp/graphql-okf-*.tgz`

- [ ] **Step 5: Commit**

```bash
git add bench/README.md CLAUDE.md && git commit -m "docs(bench): benchmark README and CLAUDE.md workspace note"
```

---

## Self-Review

**Spec coverage.** §1 repo integration → Task 1. §2 layout → Tasks 1–12 (every file in the spec's tree is created; `run.ts` is split into three entry points, `judge-cli.ts` and `report-cli.ts`, because §9 specifies three separate resumable commands). §3 scenarios → Task 10; §3.1 agent config → Task 11; §3.2 no human in the loop → the shared system prompt's "there is nobody available to answer them"; §3.3 mock server → Task 9. §4 fixture → Task 7. §5 workspace lifecycle → Task 8. §6 cases and rubrics → Task 3. §7 judging and metrics → Tasks 5, 6, 12. §8 results on disk → Tasks 1 (gitignore), 2, 12. §9 invocation and failure handling → Task 12. §10 testing → the test file in every task.

**Deviations from the spec, both deliberate.** The spec's tree shows a single `run.ts`; three entry points are needed to deliver §9's three commands. The spec does not mention `agent-config.ts`, `scrub.ts`, `scoring.ts`, `manifest.ts`, or `probe.ts`; these split pure, testable logic out of the modules that make network calls, which is what makes §10's "no network" test list achievable.

**Known-uncertain, handled rather than guessed.** The Agent SDK's result-message shape is documented inconsistently; `normalizeUsage` accepts both documented forms, is tested against both, and Task 11 Step 6 requires an observed non-zero probe before proceeding. The GraphQL MCP product is an implementation-time choice per the issue; Task 10 Step 5 forces the placeholder constants to be replaced and includes a fallback if the chosen server is stdio rather than HTTP.

**Type consistency.** `TokenUsage` (usage.ts) is consumed by `RunResult` (result.ts) and `aggregate.ts`. `CriterionOutcome` is defined once in `result.ts` and consumed by `scoring.ts` and `judge.ts`. `CaseId`/`ArtifactKind`/`Rubric`/`Criterion` are defined in `cases.ts`; `ScenarioId` in `matrix.ts` (not `scenarios.ts`, so the matrix stays free of scenario implementations); `Scenario`/`RunContext`/`McpServerEntry`/`MCP_SERVER_NAME` in `scenarios.ts`. `runDir` is defined in `result.ts` and reused by `workspace.ts` and both CLIs. `buildMatrix`/`filterPending`/`formatRunId` signatures match their call sites in `run.ts`.
