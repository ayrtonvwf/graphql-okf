import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTree, writeTree } from "./bundle-tree.js";

describe("writeTree then readTree", () => {
  it("round-trips a nested tree", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "okf-tree-")), "bundle");
    const tree = new Map([
      ["index.md", "# root\n"],
      ["types/objects/User.md", "# User\n"],
    ]);

    await writeTree(dir, tree);

    expect(await readTree(dir)).toEqual(tree);
  });

  it("replaces whatever was there before", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "okf-tree-")), "bundle");
    await writeTree(dir, new Map([["stale.md", "old\n"]]));

    await writeTree(dir, new Map([["fresh.md", "new\n"]]));

    expect(await readTree(dir)).toEqual(new Map([["fresh.md", "new\n"]]));
  });
});
