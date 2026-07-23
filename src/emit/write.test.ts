import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphqlOkfError } from "../errors.js";
import { writeBundle } from "./write.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "okf-write-"));
}

describe("writeBundle", () => {
  it("writes every entry, creating nested directories", async () => {
    const dir = await tempDir();
    await writeBundle(
      new Map([
        ["index.md", "# root\n"],
        ["types/objects/Country.md", "# Country\n"],
      ]),
      dir,
    );

    expect(await readFile(join(dir, "index.md"), "utf8")).toBe("# root\n");
    expect(await readFile(join(dir, "types/objects/Country.md"), "utf8")).toBe("# Country\n");
  });

  it("refuses a non-empty output directory", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "existing.txt"), "keep me");

    const code = await writeBundle(new Map([["index.md", "# root\n"]]), dir).then(
      () => "no-error",
      (error: GraphqlOkfError) => error.code,
    );
    expect(code).toBe("OUTPUT_NOT_EMPTY");
  });
});
