---
type: "GraphQL Interface Type"
title: "Purchasable"
description: "Anything a customer can put in an order."
resource: "https://shop.example/graphql#Purchasable"
tags: ["graphql", "interface"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Purchasable

Anything a customer can put in an order.

Implementors are guaranteed to expose a price in the shop's base currency.

Implemented by [`Product`](/types/Product.md).

# Schema

```graphql
interface Purchasable implements Node {
  id: ID!
  "The price, including the currency it is denominated in."
  price: Money!
}
```

References: [`Money`](/types/Money.md), [`Node`](/types/Node.md).

<!-- graphql-okf:generated:end -->
