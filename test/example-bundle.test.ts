import { appendFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncOkfBundle } from "../src/index.js";
import { readTree, writeTree } from "./support/bundle-tree.js";

const V1 = new URL("../examples/shop-api/v1.graphql", import.meta.url).pathname;
const V2 = new URL("../examples/shop-api/v2.graphql", import.meta.url).pathname;
const V3 = new URL("../examples/shop-api/v3.graphql", import.meta.url).pathname;

const RESOURCE = "https://shop.example/graphql";
const T1 = "2026-01-15T09:00:00.000Z";
const T2 = "2026-03-02T09:00:00.000Z";
const T3 = "2026-05-20T09:00:00.000Z";

describe("the v1 example schema", () => {
  it("emits every concept kind the model supports", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: V1 },
      outDir,
      now: T1,
      resource: RESOURCE,
    });

    expect(result.added).toHaveLength(43);
    for (const path of [
      "types/objects/Product.md",
      "types/interfaces/Purchasable.md",
      "types/unions/PaymentMethod.md",
      "types/enums/OrderStatus.md",
      "types/inputs/PaymentInput.md",
      "types/scalars/DateTime.md",
      "directives/auth.md",
      "directives/tag.md",
      "queries/searchProducts.md",
      "mutations/placeOrder.md",
      "subscriptions/orderStatusChanged.md",
      "subscriptions/productPriceChanged.md",
    ]) {
      expect(result.added).toContain(path);
    }
  });
});

describe("reconciling v1 to v2", () => {
  it("adds Money and Review, deprecates the cents fields, tombstones searchProducts", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");
    await syncOkfBundle({
      source: { kind: "sdl", path: V1 },
      outDir,
      now: T1,
      resource: RESOURCE,
    });

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: V2 },
      outDir,
      now: T2,
      resource: RESOURCE,
    });

    expect([...result.added].sort()).toEqual([
      "mutations/addReview.md",
      "subscriptions/reviewPosted.md",
      "types/objects/Money.md",
      "types/objects/Review.md",
    ]);
    expect(result.removed).toEqual(["queries/searchProducts.md"]);
    expect(result.changed).toHaveLength(8);
    expect(result.unchanged).toBe(34);
  });
});

describe("reconciling v2 to v3", () => {
  it("removes the deprecated members and leaves the earlier tombstone untouched", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T1, resource: RESOURCE });
    await syncOkfBundle({ source: { kind: "sdl", path: V2 }, outDir, now: T2, resource: RESOURCE });
    const tombstoneAfterV2 = await readFile(join(outDir, "queries/searchProducts.md"), "utf8");

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: V3 },
      outDir,
      now: T3,
      resource: RESOURCE,
    });

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(["types/objects/GiftCard.md"]);
    expect(result.changed).toHaveLength(5);
    expect(result.unchanged).toBe(40);
    expect(await readFile(join(outDir, "queries/searchProducts.md"), "utf8")).toBe(
      tombstoneAfterV2,
    );
  });

  it("records both removals as tombstones rather than deletions", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T1, resource: RESOURCE });
    await syncOkfBundle({ source: { kind: "sdl", path: V2 }, outDir, now: T2, resource: RESOURCE });
    await syncOkfBundle({ source: { kind: "sdl", path: V3 }, outDir, now: T3, resource: RESOURCE });

    const giftCard = await readFile(join(outDir, "types/objects/GiftCard.md"), "utf8");
    expect(giftCard).toContain("status: removed");
    expect(giftCard).toContain(`removedAt: ${T3}`);
  });
});

const COMMITTED = new URL("../okf/shop-api", import.meta.url).pathname;

const HUMAN_SECTION =
  "\n## Ownership\n\nOwned by the Catalog team. Ping #catalog before changing pricing fields.\n";

/**
 * Runs the full v1 -> v2 -> v3 sequence with pinned timestamps, injecting a
 * human-authored section after v1. The injection is deliberate: it is what makes
 * GOAL-8.3 (human edits survive regeneration) verifiable by opening the committed
 * bundle rather than by trusting a test name.
 */
async function buildExampleBundle(): Promise<Map<string, string>> {
  const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-golden-")), "bundle");

  await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T1, resource: RESOURCE });
  await appendFile(join(outDir, "types/objects/Product.md"), HUMAN_SECTION);
  await syncOkfBundle({ source: { kind: "sdl", path: V2 }, outDir, now: T2, resource: RESOURCE });
  await syncOkfBundle({ source: { kind: "sdl", path: V3 }, outDir, now: T3, resource: RESOURCE });

  return readTree(outDir);
}

describe("the committed example bundle", () => {
  it("matches okf/shop-api byte-for-byte", async () => {
    const built = await buildExampleBundle();

    if (process.env.UPDATE_EXAMPLE === "1") {
      await writeTree(COMMITTED, built);
      return;
    }

    expect(await readTree(COMMITTED)).toEqual(built);
  });

  it("carries three dated log entries and the surviving human section", async () => {
    const built = await buildExampleBundle();

    const log = built.get("log.md") ?? "";
    expect(log).toContain(`## ${T1}`);
    expect(log).toContain(`## ${T2}`);
    expect(log).toContain(`## ${T3}`);
    expect(built.get("types/objects/Product.md")).toContain("Ping #catalog");
  });

  it("records no absolute filesystem path anywhere in the bundle", async () => {
    const built = await buildExampleBundle();

    const offenders = [...built.entries()]
      .filter(([, contents]) => contents.includes("/private/") || contents.includes("/home/"))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
