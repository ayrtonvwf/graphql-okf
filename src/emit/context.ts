import { PRODUCER } from "../version.js";

/** The OKF spec versions this producer can emit. */
export type OkfVersion = "0.1" | "0.2";

const OKF_VERSIONS: readonly OkfVersion[] = ["0.1", "0.2"];

/** v0.2 supersedes v0.1; v0.1 stays reachable for anyone pinned to it. */
export const DEFAULT_OKF_VERSION: OkfVersion = "0.2";

/**
 * Everything a renderer needs beyond the concept itself. One record rather than
 * a growing tail of positionals: M2's provenance fields land here too.
 */
export interface EmitContext {
  readonly okfVersion: OkfVersion;
  readonly timestamp: string;
  readonly producer: string;
}

export function emitContext(okfVersion: OkfVersion, timestamp: string): EmitContext {
  return Object.freeze({ okfVersion, timestamp, producer: PRODUCER });
}

export function isOkfVersion(value: string): value is OkfVersion {
  return (OKF_VERSIONS as readonly string[]).includes(value);
}
