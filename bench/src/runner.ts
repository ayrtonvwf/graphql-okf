import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildQueryOptions } from "./agent-config.ts";
import { caseById, loadPrompt } from "./cases.ts";
import { AGENT_MODEL } from "./constants.ts";
import type { Cell } from "./matrix.ts";
import { type RunResult, runDir, writeRunResult } from "./result.ts";
import type { RunContext, Scenario } from "./scenarios.ts";
import { normalizeUsage } from "./usage.ts";
import { captureDiff, cleanupWorkspace, commitPristine, prepareWorkspace } from "./workspace.ts";

export function textOf(message: unknown): string {
  // The SDK's assistant message wraps the Anthropic Messages API response
  // under `.message`; the block array lives at `.message.content`, not at
  // the top level of the SDK envelope. An older SDK version put the block
  // array directly at the top level (`.content`); fall back to that shape so
  // a future SDK regression degrades to "might work" rather than "silently
  // empty" artifact.txt output (see task-11 review — this exact regression
  // has already happened once).
  if (message === null || typeof message !== "object") return "";
  const envelope = message as { message?: { content?: unknown }; content?: unknown };
  const content = envelope.message?.content ?? envelope.content;
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
export async function runCell(cell: Cell, scenario: Scenario, ctx: RunContext): Promise<RunResult> {
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

  let cwd: string | undefined;
  try {
    cwd = await prepareWorkspace(cell.runId, benchCase.needsFixture);
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
  } finally {
    // Runs after the artifact, transcript, and run result are already
    // persisted to results/<runId>/ in every branch above — cleanup must
    // never risk losing evidence.
    if (cwd !== undefined) {
      await cleanupWorkspace(cwd);
    }
  }
}
