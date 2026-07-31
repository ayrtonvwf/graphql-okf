import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureDiff,
  cleanupWorkspace,
  commitPristine,
  generateBundle,
  prepareWorkspace as prepareWorkspaceUntracked,
} from "./workspace.ts";

const run = promisify(execFile);
const workspaces: string[] = [];

/** Tracks every workspace a test creates so `afterEach` can sweep them up. */
async function prepareWorkspace(runId: string, needsFixture: boolean): Promise<string> {
  const ws = await prepareWorkspaceUntracked(runId, needsFixture);
  workspaces.push(ws);
  return ws;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((ws) => rm(ws, { recursive: true, force: true })));
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

  it("returns a path with no trace of the run id, case id, or scenario id", async () => {
    // Regression test: the returned path must not leak which of the three
    // scenarios (or which case) produced it — an agent reading its own cwd,
    // an error message, or the confinement hook's denial string must not be
    // able to infer which cell it is running in.
    const ws = await prepareWorkspace("qa__okf-bundle__t1", false);
    expect(ws).not.toContain("qa");
    expect(ws).not.toContain("okf-bundle");
    expect(ws).not.toContain("t1");
  });

  it("returns a different directory on every call, even for the same run id", async () => {
    const a = await prepareWorkspace("add-review__baseline__t1", false);
    const b = await prepareWorkspace("add-review__baseline__t1", false);
    expect(a).not.toBe(b);
  });
});

describe("cleanupWorkspace", () => {
  it("removes the workspace directory and everything inside it", async () => {
    const ws = await prepareWorkspaceUntracked("qa__baseline__t1", false);
    await writeFile(join(ws, "note.txt"), "hello", "utf8");
    await cleanupWorkspace(ws);
    await expect(readFile(join(ws, "note.txt"), "utf8")).rejects.toThrow();
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
