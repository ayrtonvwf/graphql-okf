import { cancelOrder, placeOrder } from "./orders.js";
import { getProduct, listProducts } from "./products.js";

async function main(): Promise<void> {
  const products = await listProducts(5);
  for (const product of products) {
    console.log(`${product.name} — ${(product.priceCents / 100).toFixed(2)}`);
  }

  const first = products[0];
  if (first === undefined) {
    console.log("No products available.");
    return;
  }

  const detail = await getProduct(first.id);
  console.log(`Selected: ${detail?.name ?? "unknown"}`);

  const order = await placeOrder(
    [first.id],
    {
      line1: "1 Test Street",
      city: "Porto Alegre",
      postalCode: "90000-000",
      country: "BR",
    },
    "tok_test",
  );
  console.log(`Placed order ${order.id} (${order.status})`);

  await cancelOrder(order.id);
  console.log("Order cancelled.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
