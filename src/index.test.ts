import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOkfBundle } from "./index.js";

describe("createOkfBundle", () => {
  it("writes an OKF bundle from an SDL file into a fresh directory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-e2e-"));
    const sdlPath = join(workspace, "schema.graphql");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      sdlPath,
      '"An ISO country." type Country { code: ID! } type Query { countries: [Country!]! }',
    );
    const outDir = join(workspace, "bundle");

    await createOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-07-23T12:00:00.000Z",
    });

    const country = await readFile(join(outDir, "types/objects/Country.md"), "utf8");
    expect(country).toContain("type: object");
    expect(country).toContain("# Country");
    const rootIndex = await readFile(join(outDir, "index.md"), "utf8");
    expect(rootIndex).toContain("- [types/](types/index.md)");
  });
});
