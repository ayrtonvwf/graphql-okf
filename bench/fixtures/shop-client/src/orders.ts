import { request } from "./client.js";

export interface OrderSummary {
  readonly id: string;
  readonly status: string;
  readonly totalCents: number;
}

export interface ShippingAddress {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly postalCode: string;
  readonly country: string;
}

const PLACE_ORDER = `
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input) {
      id
      status
      total { amountCents }
    }
  }
`;

const CANCEL_ORDER = `
  mutation CancelOrder($id: ID!) {
    cancelOrder(id: $id) {
      id
    }
  }
`;

interface RawOrder {
  id: string;
  status: string;
  total: { amountCents: number };
}

export async function placeOrder(
  productIds: string[],
  shipTo: ShippingAddress,
  cardToken: string,
): Promise<OrderSummary> {
  const data = (await request(
    PLACE_ORDER,
    { input: { productIds, shipTo, payWith: { creditCardToken: cardToken } } },
    { authenticated: true },
  )) as { placeOrder: RawOrder };

  return {
    id: data.placeOrder.id,
    status: data.placeOrder.status,
    totalCents: data.placeOrder.total.amountCents,
  };
}

/** Cancels an order the customer no longer wants. */
export async function cancelOrder(orderId: string): Promise<void> {
  await request(CANCEL_ORDER, { id: orderId }, { authenticated: true });
}
