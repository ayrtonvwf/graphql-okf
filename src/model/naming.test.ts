import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DIRECTORY_BY_KIND, elementId, resolvePaths } from "./naming.js";

describe("DIRECTORY_BY_KIND", () => {
  it("maps every concept kind to its documented directory", () => {
    expect(DIRECTORY_BY_KIND).toEqual({
      object: "types/objects",
      interface: "types/interfaces",
      union: "types/unions",
      enum: "types/enums",
      input: "types/inputs",
      scalar: "types/scalars",
      query: "queries",
      mutation: "mutations",
      subscription: "subscriptions",
      directive: "directives",
    });
  });
});

describe("resolvePaths", () => {
  it("uses the exact GraphQL name as the filename", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "enum", name: "Role" },
      { kind: "query", name: "user" },
      { kind: "directive", name: "auth" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe("types/objects/User.md");
    expect(paths.get(elementId({ kind: "enum", name: "Role" }))).toBe("types/enums/Role.md");
    expect(paths.get(elementId({ kind: "query", name: "user" }))).toBe("queries/user.md");
    expect(paths.get(elementId({ kind: "directive", name: "auth" }))).toBe("directives/auth.md");
  });

  it("does not suffix names that collide only across different directories", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "enum", name: "User" },
      { kind: "input", name: "user" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe("types/objects/User.md");
    expect(paths.get(elementId({ kind: "enum", name: "User" }))).toBe("types/enums/User.md");
    expect(paths.get(elementId({ kind: "input", name: "user" }))).toBe("types/inputs/user.md");
  });

  it("returns one entry per input element", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "Post" },
    ]);

    expect(paths.size).toBe(2);
  });
});

function hashOf(name: string): string {
  return createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8);
}

describe("resolvePaths collisions", () => {
  it("suffixes every member of a case-fold collision set", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe(
      `types/objects/User-${hashOf("User")}.md`,
    );
    expect(paths.get(elementId({ kind: "object", name: "user" }))).toBe(
      `types/objects/user-${hashOf("user")}.md`,
    );
  });

  it("suffixes names that would shadow the reserved index.md", () => {
    const paths = resolvePaths([{ kind: "object", name: "index" }]);

    expect(paths.get(elementId({ kind: "object", name: "index" }))).toBe(
      `types/objects/index-${hashOf("index")}.md`,
    );
  });

  it("suffixes names that would shadow the reserved log.md, case-insensitively", () => {
    const paths = resolvePaths([{ kind: "query", name: "Log" }]);

    expect(paths.get(elementId({ kind: "query", name: "Log" }))).toBe(
      `queries/Log-${hashOf("Log")}.md`,
    );
  });

  it("is independent of input order", () => {
    const elements: { kind: "object"; name: string }[] = [
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
      { kind: "object", name: "Post" },
      { kind: "object", name: "index" },
      { kind: "object", name: "Comment" },
    ];
    const forward = resolvePaths(elements);
    const reversed = resolvePaths([...elements].reverse());

    for (const element of elements) {
      expect(reversed.get(elementId(element))).toBe(forward.get(elementId(element)));
    }
  });

  it("does not suffix a name merely because another directory has a collision", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
      { kind: "enum", name: "User" },
    ]);

    expect(paths.get(elementId({ kind: "enum", name: "User" }))).toBe("types/enums/User.md");
  });
});
