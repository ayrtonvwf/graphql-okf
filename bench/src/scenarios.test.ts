import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { needsEndpoint, SCENARIOS, scenarioById } from "./scenarios.js";

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

  it("registers one stdio mcp server that introspects the endpoint with mutations allowed", () => {
    const servers = scenarioById("graphql-mcp").mcpServers({
      endpointUrl: "http://127.0.0.1:4000/graphql",
    });
    expect(Object.keys(servers)).toEqual(["graphql"]);
    // mcp-graphql (https://github.com/blurrah/mcp-graphql) is a stdio process,
    // not an HTTP server: it is configured via env vars, not a URL. Mutations
    // are disabled by default, so ALLOW_MUTATIONS must be set explicitly or
    // two of the three benchmark cases could never complete under this scenario.
    expect(servers.graphql?.type).toBe("stdio");
    expect(servers.graphql?.env).toEqual({
      ENDPOINT: "http://127.0.0.1:4000/graphql",
      ALLOW_MUTATIONS: "true",
    });
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
