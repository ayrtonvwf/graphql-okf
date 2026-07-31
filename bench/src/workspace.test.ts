import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const run = promisify(execFile);
let dir: string;

vi.mock("./constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants.js")>();
  return {
    ...actual,
    get RESULTS_DIR() {
      return dir;
    },
  };
});

const { captureDiff, commitPristine, generateBundle, prepareWorkspace } = await import(
  "./workspace.js"
);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "okf-bench-ws-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("prepareWorkspace", () => {
  it("creates an empty workspace when the case needs no fixture", async () => {
    const ws = await prepareWorkspace("qa__baseline__t1", false);
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(ws)).toEqual([]);
  });

  it("copies the fixture when the case needs it", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    expect(await readFile(join(ws, "src", "orders.ts"), "utf8")).toMatch(/cancelOrder/);
  });

  it("starts from a clean copy even if a previous run left files behind", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    await writeFile(join(ws, "STALE.md"), "leftover", "utf8");
    const again = await prepareWorkspace("add-review__baseline__t1", true);
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(again)).not.toContain("STALE.md");
  });
});

describe("generateBundle", () => {
  it("emits the bundle into okf/shop-api inside the workspace", async () => {
    const ws = await prepareWorkspace("qa__okf-bundle__t1", false);
    await generateBundle(ws);
    expect(await readFile(join(ws, "okf", "shop-api", "index.md"), "utf8")).toContain(
      "okf_version",
    );
    expect(
      await readFile(join(ws, "okf", "shop-api", "mutations", "addReview.md"), "utf8"),
    ).toMatch(/addReview/);
  });

  it("is byte-identical across runs", async () => {
    const a = await prepareWorkspace("qa__okf-bundle__t1", false);
    await generateBundle(a);
    const b = await prepareWorkspace("qa__okf-bundle__t2", false);
    await generateBundle(b);
    const path = join("okf", "shop-api", "mutations", "addReview.md");
    expect(await readFile(join(a, path), "utf8")).toBe(await readFile(join(b, path), "utf8"));
  });
});

describe("commitPristine and captureDiff", () => {
  it("reports no diff when nothing changed", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    await commitPristine(ws);
    expect(await captureDiff(ws)).toBe("");
  });

  it("captures an edit to a tracked file", async () => {
    const ws = await prepareWorkspace("add-review__baseline__t1", true);
    await commitPristine(ws);
    await writeFile(join(ws, "src", "reviews.ts"), "export const x = 1;\n", "utf8");
    const diff = await captureDiff(ws);
    expect(diff).toMatch(/src\/reviews\.ts/);
    expect(diff).toMatch(/export const x = 1;/);
  });

  it("excludes the generated bundle from the diff", async () => {
    const ws = await prepareWorkspace("add-review__okf-bundle__t1", true);
    await generateBundle(ws);
    await commitPristine(ws);
    await writeFile(join(ws, "okf", "shop-api", "SCRIBBLE.md"), "agent scribble\n", "utf8");
    expect(await captureDiff(ws)).toBe("");
  });

  it("commits with a harness identity rather than depending on global git config", async () => {
    const ws = await prepareWorkspace("qa__baseline__t1", false);
    await writeFile(join(ws, "a.txt"), "a\n", "utf8");
    await commitPristine(ws);
    const { stdout } = await run("git", ["-C", ws, "log", "-1", "--format=%an <%ae>"]);
    expect(stdout.trim()).toBe("graphql-okf bench <bench@graphql-okf.invalid>");
  });
});
