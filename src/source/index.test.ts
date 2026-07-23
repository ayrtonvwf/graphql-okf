import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import { describe, expect, it } from "vitest";
import { INTROSPECTION_OPTIONS } from "./endpoint.js";
import { loadSchema } from "./index.js";
import type { FetchLike } from "./types.js";

describe("loadSchema", () => {
  it("dispatches an sdl spec to the file loader", async () => {
    const dir = await mkdtemp(join(tmpdir(), "graphql-okf-"));
    const path = join(dir, "schema.graphql");
    await writeFile(path, "type Query { hello: String }", "utf8");

    const loaded = await loadSchema({ kind: "sdl", path });

    expect(loaded.origin).toBe("sdl");
  });

  it("dispatches an endpoint spec to the introspection loader", async () => {
    const payload = graphqlSync({
      schema: buildSchema("type Query { hello: String }"),
      source: getIntrospectionQuery(INTROSPECTION_OPTIONS),
    });
    const fetch: FetchLike = async () => new Response(JSON.stringify(payload), { status: 200 });

    const loaded = await loadSchema({ kind: "endpoint", url: "https://x.test/graphql", fetch });

    expect(loaded.origin).toBe("introspection");
  });
});
