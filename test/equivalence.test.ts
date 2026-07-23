import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { IntrospectionQuery } from "graphql";
import { buildClientSchema, buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import { describe, expect, it } from "vitest";
import type { ConceptNode, SchemaIr } from "../src/index.js";
import { readSchema } from "../src/index.js";
import { project } from "../src/model/project.js";
import { INTROSPECTION_OPTIONS } from "../src/source/endpoint.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/kitchen-sink.graphql", import.meta.url));

async function fixtureSdl(): Promise<string> {
  return readFile(FIXTURE, "utf8");
}

function stripAppliedDirectives(ir: SchemaIr): unknown {
  return JSON.parse(JSON.stringify(ir, (key, value) => (key === "appliedDirectives" ? [] : value)));
}

describe("readSchema", () => {
  it("reads an SDL file into an IR", async () => {
    const ir = await readSchema({ kind: "sdl", path: FIXTURE });

    expect(ir.origin).toBe("sdl");
    expect(ir.resource).toBe(FIXTURE);
    expect(ir.concepts.length).toBeGreaterThan(0);
  });

  it("suffixes the reserved and case-folding names from the fixture", async () => {
    const ir = await readSchema({ kind: "sdl", path: FIXTURE });
    const paths = ir.concepts.map((concept: ConceptNode) => concept.path);

    expect(paths).not.toContain("types/objects/index.md");
    expect(paths.some((path) => path.startsWith("types/objects/index-"))).toBe(true);
  });

  it("does not emit the custom root types as objects", async () => {
    const ir = await readSchema({ kind: "sdl", path: FIXTURE });
    const paths = ir.concepts.map((concept: ConceptNode) => concept.path);

    expect(paths).not.toContain("types/objects/RootQuery.md");
    expect(paths).toContain("queries/me.md");
    expect(paths).toContain("mutations/createUser.md");
  });
});

describe("determinism", () => {
  it("produces a deeply equal IR when run twice on the same source", async () => {
    const first = await readSchema({ kind: "sdl", path: FIXTURE });
    const second = await readSchema({ kind: "sdl", path: FIXTURE });

    expect(second).toEqual(first);
  });
});

describe("SDL and introspection equivalence (DOD-G-6)", () => {
  it("agrees on everything but applied directives", async () => {
    const sdl = await fixtureSdl();

    const fromSdl = project({
      schema: buildSchema(sdl),
      resource: "kitchen-sink",
      origin: "sdl",
    });

    const payload = graphqlSync({
      schema: buildSchema(sdl),
      source: getIntrospectionQuery(INTROSPECTION_OPTIONS),
    });
    const introspected = project({
      schema: buildClientSchema(payload.data as unknown as IntrospectionQuery),
      resource: "kitchen-sink",
      origin: "sdl",
    });

    expect(stripAppliedDirectives(introspected)).toEqual(stripAppliedDirectives(fromSdl));
  });

  it("populates applied directives on the SDL path only", async () => {
    const sdl = await fixtureSdl();

    const fromSdl = project({ schema: buildSchema(sdl), resource: "k", origin: "sdl" });
    const payload = graphqlSync({
      schema: buildSchema(sdl),
      source: getIntrospectionQuery(INTROSPECTION_OPTIONS),
    });
    const introspected = project({
      schema: buildClientSchema(payload.data as unknown as IntrospectionQuery),
      resource: "k",
      origin: "introspection",
    });

    const appliedCount = (ir: SchemaIr): number =>
      ir.concepts.reduce((total, concept) => total + concept.appliedDirectives.length, 0);

    expect(appliedCount(fromSdl)).toBeGreaterThan(0);
    expect(appliedCount(introspected)).toBe(0);
  });
});
