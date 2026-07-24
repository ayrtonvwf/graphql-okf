import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmptyOrMissing, readExistingBundle } from "./read.js";

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "okf-read-"));
}

describe("readExistingBundle", () => {
  it("returns an empty map for a directory that does not exist", async () => {
    const dir = join(await workspace(), "absent");

    expect((await readExistingBundle(dir)).size).toBe(0);
  });

  it("reads nested markdown files keyed by POSIX relative path, sorted", async () => {
    const dir = await workspace();
    await mkdir(join(dir, "types", "objects"), { recursive: true });
    await writeFile(join(dir, "index.md"), "root\n");
    await writeFile(join(dir, "types", "objects", "Country.md"), "country\n");

    const files = await readExistingBundle(dir);

    expect([...files.keys()]).toEqual(["index.md", "types/objects/Country.md"]);
    expect(files.get("types/objects/Country.md")).toBe("country\n");
  });

  it("ignores files that are not markdown", async () => {
    const dir = await workspace();
    await writeFile(join(dir, "index.md"), "root\n");
    await writeFile(join(dir, "schema.graphql"), "type Query { a: Int }\n");

    expect([...(await readExistingBundle(dir)).keys()]).toEqual(["index.md"]);
  });
});

describe("isEmptyOrMissing", () => {
  it("is true for a missing directory", async () => {
    expect(await isEmptyOrMissing(join(await workspace(), "absent"))).toBe(true);
  });

  it("is true for an empty directory", async () => {
    expect(await isEmptyOrMissing(await workspace())).toBe(true);
  });

  it("is false once the directory holds anything", async () => {
    const dir = await workspace();
    await writeFile(join(dir, "index.md"), "root\n");

    expect(await isEmptyOrMissing(dir)).toBe(false);
  });
});
