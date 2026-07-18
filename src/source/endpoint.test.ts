import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { GraphqlOkfError } from "../errors.js";
import { INTROSPECTION_OPTIONS, loadFromEndpoint } from "./endpoint.js";
import type { FetchLike } from "./types.js";

function introspectionPayload(sdl: string): unknown {
  const schema = buildSchema(sdl);
  return graphqlSync({ schema, source: getIntrospectionQuery(INTROSPECTION_OPTIONS) });
}

function respondWith(payload: unknown, init?: { status?: number }): FetchLike {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as GraphqlOkfError).code;
  }
  throw new Error("expected the promise to reject");
}

describe("loadFromEndpoint", () => {
  it("builds a schema from an introspection response", async () => {
    const fetch = respondWith(introspectionPayload("type Query { hello: String }"));

    const loaded = await loadFromEndpoint("https://api.example.com/graphql", { fetch });

    expect(loaded.origin).toBe("introspection");
    expect(loaded.resource).toBe("https://api.example.com/graphql");
    expect(loaded.schema.getQueryType()?.name).toBe("Query");
  });

  it("POSTs the introspection query with the supplied headers", async () => {
    const fetch = respondWith(introspectionPayload("type Query { hello: String }"));

    await loadFromEndpoint("https://api.example.com/graphql", {
      fetch,
      headers: { authorization: "Bearer token" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer token",
    });
    expect(String(init?.body)).toContain("IntrospectionQuery");
  });

  it("reports a network failure as ENDPOINT_UNREACHABLE", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };

    await expect(
      codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch })),
    ).resolves.toBe("ENDPOINT_UNREACHABLE");
  });

  it("reports a non-2xx response as ENDPOINT_HTTP_ERROR including the status", async () => {
    const fetch = respondWith({}, { status: 503 });

    await expect(loadFromEndpoint("https://api.example.com/graphql", { fetch })).rejects.toThrow(
      "503",
    );
  });

  it("reports a non-JSON body as ENDPOINT_INVALID_RESPONSE", async () => {
    const fetch: FetchLike = async () => new Response("<html>nope</html>", { status: 200 });

    await expect(
      codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch })),
    ).resolves.toBe("ENDPOINT_INVALID_RESPONSE");
  });

  it("reports a payload without __schema as ENDPOINT_INVALID_RESPONSE", async () => {
    const fetch = respondWith({ data: { something: "else" } });

    await expect(
      codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch })),
    ).resolves.toBe("ENDPOINT_INVALID_RESPONSE");
  });

  it("recognises a disabled-introspection error", async () => {
    const fetch = respondWith({
      errors: [{ message: "GraphQL introspection is not allowed by this server" }],
    });

    await expect(
      codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch })),
    ).resolves.toBe("INTROSPECTION_DISABLED");
  });

  it("reports other GraphQL errors as ENDPOINT_INVALID_RESPONSE", async () => {
    const fetch = respondWith({ errors: [{ message: "rate limited" }] });

    await expect(
      codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch })),
    ).resolves.toBe("ENDPOINT_INVALID_RESPONSE");
  });
});
