import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphqlOkfError } from "../errors.js";
import { loadFromSdl } from "./sdl.js";

async function writeSdl(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "graphql-okf-"));
  const path = join(dir, "schema.graphql");
  await writeFile(path, contents, "utf8");
  return path;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as GraphqlOkfError).code;
  }
  throw new Error("expected the promise to reject");
}

describe("loadFromSdl", () => {
  it("builds a schema and reports its origin", async () => {
    const path = await writeSdl("type Query { hello: String }");

    const loaded = await loadFromSdl(path);

    expect(loaded.origin).toBe("sdl");
    expect(loaded.resource).toBe(path);
    expect(loaded.schema.getQueryType()?.name).toBe("Query");
  });

  it("reports a missing file as SOURCE_NOT_FOUND", async () => {
    await expect(codeOf(loadFromSdl("/definitely/missing.graphql"))).resolves.toBe(
      "SOURCE_NOT_FOUND",
    );
  });

  it("reports a directory as SOURCE_UNREADABLE", async () => {
    const dir = await mkdtemp(join(tmpdir(), "graphql-okf-"));

    await expect(codeOf(loadFromSdl(dir))).resolves.toBe("SOURCE_UNREADABLE");
  });

  it("reports a syntax error as SDL_PARSE_ERROR", async () => {
    const path = await writeSdl("type Query {");

    await expect(codeOf(loadFromSdl(path))).resolves.toBe("SDL_PARSE_ERROR");
  });

  it("reports a schema without a query root as SCHEMA_INVALID", async () => {
    const path = await writeSdl("type Thing { name: String }");

    await expect(codeOf(loadFromSdl(path))).resolves.toBe("SCHEMA_INVALID");
  });

  it("names the offending file in the message", async () => {
    const path = await writeSdl("type Query {");

    await expect(loadFromSdl(path)).rejects.toThrow(path);
  });
});
