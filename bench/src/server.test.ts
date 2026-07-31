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
    const fields = (body.data as { __type: { fields: { name: string }[] } }).__type.fields.map(
      (f) => f.name,
    );
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
