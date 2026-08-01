# shop-client

A small Node client for the shop GraphQL API.

## Layout

- `src/client.ts` — the HTTP transport. One `request()` helper; set
  `authenticated: true` for operations that need a signed-in customer.
- `src/products.ts` — browsing the catalogue.
- `src/orders.ts` — placing and cancelling orders.
- `src/index.ts` — a demo run tying the above together.

## Configuration

- `SHOP_API_URL` — the GraphQL endpoint.
- `SHOP_API_TOKEN` — the customer session token, required for authenticated operations.

## Running

```bash
npm start
```
