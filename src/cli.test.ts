import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main, parseArgs } from "./cli.js";
import type { GraphqlOkfError } from "./errors.js";
import * as indexModule from "./index.js";

describe("parseArgs", () => {
  it("treats an http(s) argument as an endpoint source", () => {
    expect(parseArgs(["https://api.test/graphql", "--out", "bundle"])).toEqual({
      source: { kind: "endpoint", url: "https://api.test/graphql" },
      outDir: "bundle",
    });
  });

  it("treats any other argument as an SDL path", () => {
    expect(parseArgs(["./schema.graphql", "--out", "bundle"])).toEqual({
      source: { kind: "sdl", path: "./schema.graphql" },
      outDir: "bundle",
    });
  });

  it("rejects a missing --out", () => {
    const code = (() => {
      try {
        parseArgs(["./schema.graphql"]);
      } catch (error) {
        return (error as GraphqlOkfError).code;
      }
      return "no-error";
    })();
    expect(code).toBe("CLI_USAGE");
  });

  it("parses --now and --resource", () => {
    expect(
      parseArgs([
        "./schema.graphql",
        "--out",
        "bundle",
        "--now",
        "2026-01-15T09:00:00.000Z",
        "--resource",
        "https://shop.example/graphql",
      ]),
    ).toEqual({
      source: { kind: "sdl", path: "./schema.graphql" },
      outDir: "bundle",
      now: "2026-01-15T09:00:00.000Z",
      resource: "https://shop.example/graphql",
    });
  });

  it("rejects a --now with no value", () => {
    const code = (() => {
      try {
        parseArgs(["./schema.graphql", "--out", "bundle", "--now"]);
      } catch (error) {
        return (error as GraphqlOkfError).code;
      }
      return "no-error";
    })();
    expect(code).toBe("CLI_USAGE");
  });
});

describe("main", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("writes a bundle and leaves exitCode untouched on success", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-cli-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await main([sdlPath, "--out", outDir]);

    expect(process.exitCode).toBeUndefined();
    const index = await readFile(join(outDir, "index.md"), "utf8");
    expect(index).toContain("# API interface");
  });

  it("prints the message and sets exitCode=1 when an Error is thrown", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main([]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Usage: graphql-okf <sdl-path-or-endpoint-url> --out <dir> [--now <iso-8601>] [--resource <url-or-id>]",
    );
  });

  it("stringifies a non-Error failure and sets exitCode=1", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(indexModule, "syncOkfBundle").mockRejectedValueOnce("boom");

    await main(["./schema.graphql", "--out", "bundle"]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("boom");
  });

  it("forwards --now to the bundle it writes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-cli-now-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await main([sdlPath, "--out", outDir, "--now", "2026-01-15T09:00:00.000Z"]);

    expect(await readFile(join(outDir, "queries/hello.md"), "utf8")).toContain(
      "timestamp: 2026-01-15T09:00:00.000Z",
    );
  });
});
