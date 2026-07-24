import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphqlOkfError } from "./errors.js";
import { syncOkfBundle } from "./index.js";

const SDL = '"An ISO country." type Country { code: ID! } type Query { countries: [Country!]! }';

async function workspaceWithSdl(sdl: string = SDL): Promise<{ sdlPath: string; outDir: string }> {
  const workspace = await mkdtemp(join(tmpdir(), "okf-e2e-"));
  const sdlPath = join(workspace, "schema.graphql");
  await writeFile(sdlPath, sdl);
  return { sdlPath, outDir: join(workspace, "bundle") };
}

describe("syncOkfBundle", () => {
  it("creates a bundle in a fresh directory and reports what it added", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-07-24T09:00:00.000Z",
    });

    expect(result.created).toBe(true);
    expect(result.added).toContain("types/objects/Country.md");
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(await readFile(join(outDir, "types/objects/Country.md"), "utf8")).toContain(
      "type: object",
    );
  });

  it("writes an initial log.md listing every concept as added", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();

    await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-07-24T09:00:00.000Z",
    });

    const log = await readFile(join(outDir, "log.md"), "utf8");
    expect(log).toContain("## 2026-07-24T09:00:00.000Z");
    expect(log).toContain("**Added**");
    expect(log).toContain("- [`Country`](types/objects/Country.md)");
  });

  it("refuses a non-empty directory that is not a bundle", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "notes.txt"), "not a bundle\n");

    let code = "no-error";
    try {
      await syncOkfBundle({ source: { kind: "sdl", path: sdlPath }, outDir });
    } catch (error) {
      code = (error as GraphqlOkfError).code;
    }

    expect(code).toBe("NOT_A_BUNDLE");
  });

  it("reports created: false when reconciling an existing bundle", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl();
    await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-07-24T09:00:00.000Z",
    });

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-08-01T00:00:00.000Z",
    });

    expect(result.created).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.unchanged).toBeGreaterThan(0);
  });

  it("defaults the timestamp to the current wall-clock time when `now` is omitted", async () => {
    const { sdlPath, outDir } = await workspaceWithSdl("type Query { hello: String }");

    await syncOkfBundle({ source: { kind: "sdl", path: sdlPath }, outDir });

    const hello = await readFile(join(outDir, "queries/hello.md"), "utf8");
    expect(hello.match(/^timestamp: (.+)$/m)?.[1]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

describe("the resource option", () => {
  it("overrides the resource recorded in concept frontmatter", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-resource-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      resource: "https://shop.example/graphql",
    });

    const concept = await readFile(join(outDir, "queries/hello.md"), "utf8");
    expect(concept).toContain('resource: "https://shop.example/graphql"');
    expect(concept).not.toContain(workspace);
  });

  it("falls back to the source path when omitted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-resource-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await syncOkfBundle({ source: { kind: "sdl", path: sdlPath }, outDir });

    expect(await readFile(join(outDir, "queries/hello.md"), "utf8")).toContain(
      `resource: "${sdlPath}"`,
    );
  });
});

describe("the now option", () => {
  it("rejects a value that is not a parseable timestamp", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-now-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");

    const code = await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir: join(workspace, "bundle"),
      now: "yesterday",
    }).then(
      () => "no-error",
      (error: GraphqlOkfError) => error.code,
    );

    expect(code).toBe("INVALID_TIMESTAMP");
  });

  it("normalizes an accepted value to a canonical ISO-8601 string", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-now-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-01-15T09:00:00Z",
    });

    expect(await readFile(join(outDir, "queries/hello.md"), "utf8")).toContain(
      "timestamp: 2026-01-15T09:00:00.000Z",
    );
  });
});
