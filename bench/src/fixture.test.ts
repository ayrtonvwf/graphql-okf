import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_DIR } from "./constants.js";

async function fixtureFiles(dir: string = FIXTURE_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await fixtureFiles(full)));
    else files.push(full);
  }
  return files;
}

describe("the fixture must not leak the schema", () => {
  it("ships no SDL file", async () => {
    const files = await fixtureFiles();
    expect(files.filter((f) => f.endsWith(".graphql") || f.endsWith(".gql"))).toEqual([]);
  });

  it("does not depend on graphql-codegen or the graphql package", async () => {
    const manifest = await readFile(join(FIXTURE_DIR, "package.json"), "utf8");
    expect(manifest).not.toMatch(/codegen/i);
    expect(manifest).not.toMatch(/"graphql"/);
  });

  it("never mentions the operations the coding cases must discover", async () => {
    const files = await fixtureFiles();
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, `${file} leaks addReview`).not.toMatch(/addReview/);
      expect(text, `${file} leaks reviewPosted`).not.toMatch(/reviewPosted/);
    }
  });

  it("does not reveal the cancelOrder reason argument", async () => {
    const orders = await readFile(join(FIXTURE_DIR, "src", "orders.ts"), "utf8");
    expect(orders).toMatch(/cancelOrder/);
    expect(orders).not.toMatch(/reason/i);
  });

  it("keeps the transport return type opaque", async () => {
    const client = await readFile(join(FIXTURE_DIR, "src", "client.ts"), "utf8");
    expect(client).toMatch(/Promise<unknown>/);
  });

  it("actually uses the operations the cases build on", async () => {
    const products = await readFile(join(FIXTURE_DIR, "src", "products.ts"), "utf8");
    const orders = await readFile(join(FIXTURE_DIR, "src", "orders.ts"), "utf8");
    expect(products).toMatch(/products\(/);
    expect(products).toMatch(/product\(/);
    expect(orders).toMatch(/placeOrder\(/);
  });
});
