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
