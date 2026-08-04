---
type: "GraphQL Input Type"
title: "PlaceOrderInput"
description: "Everything needed to turn a basket into an order."
resource: "https://shop.example/graphql#PlaceOrderInput"
tags: ["graphql", "input"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# PlaceOrderInput

Everything needed to turn a basket into an order.

# Schema

```graphql
input PlaceOrderInput {
  payWith: PaymentInput!
  productIds: [ID!]!
  shipTo: AddressInput!
}
```

References: [`AddressInput`](/types/AddressInput.md), [`PaymentInput`](/types/PaymentInput.md).

<!-- graphql-okf:generated:end -->
