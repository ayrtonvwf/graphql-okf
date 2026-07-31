import { CASES, type CaseId, caseById } from "./cases.js";

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
