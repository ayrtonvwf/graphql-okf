import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncOkfBundle } from "../src/index.js";

const V1 = new URL("../examples/shop-api/v1.graphql", import.meta.url).pathname;

const RESOURCE = "https://shop.example/graphql";
const T1 = "2026-01-15T09:00:00.000Z";

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
