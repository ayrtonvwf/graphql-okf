import { request } from "./client.js";

export interface ProductSummary {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
  readonly inStock: boolean;
}

const LIST_PRODUCTS = `
  query ListProducts($first: Int) {
    products(first: $first) {
      id
      name
      inStock
      price { amountCents }
    }
  }
`;

const GET_PRODUCT = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      name
      description
      inStock
      price { amountCents }
    }
  }
`;

interface RawProduct {
  id: string;
  name: string;
  description?: string | null;
  inStock: boolean;
  price: { amountCents: number };
}

function toSummary(raw: RawProduct): ProductSummary {
  return {
    id: raw.id,
    name: raw.name,
    priceCents: raw.price.amountCents,
    inStock: raw.inStock,
  };
}

export async function listProducts(first = 20): Promise<ProductSummary[]> {
  const data = (await request(LIST_PRODUCTS, { first })) as { products: RawProduct[] };
  return data.products.map(toSummary);
}

export async function getProduct(id: string): Promise<ProductSummary | null> {
  const data = (await request(GET_PRODUCT, { id })) as { product: RawProduct | null };
  return data.product === null ? null : toSummary(data.product);
}
