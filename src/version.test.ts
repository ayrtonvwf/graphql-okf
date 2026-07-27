import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PRODUCER } from "./version.js";

describe("PRODUCER", () => {
  it("is the OKF §7 <producer>/<version> actor identity", () => {
    expect(PRODUCER).toMatch(/^graphql-okf\/\d+\.\d+$/);
  });

  it("tracks package.json's major.minor, so a release cannot emit a stale actor", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    const [major, minor] = pkg.version.split(".");

    expect(PRODUCER).toBe(`graphql-okf/${major}.${minor}`);
  });
});
