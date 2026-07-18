import { loadFromEndpoint } from "./endpoint.js";
import { loadFromSdl } from "./sdl.js";
import type { LoadedSchema, SourceSpec } from "./types.js";

export type { FetchLike, LoadedSchema, SourceSpec } from "./types.js";

export async function loadSchema(spec: SourceSpec): Promise<LoadedSchema> {
  if (spec.kind === "sdl") {
    return loadFromSdl(spec.path);
  }
  return loadFromEndpoint(spec.url, { headers: spec.headers, fetch: spec.fetch });
}
