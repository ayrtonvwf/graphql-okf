---
type: "GraphQL Object Type"
title: "OrderLine"
description: "One line of an order: a product and how many of it were bought."
resource: "https://shop.example/graphql#OrderLine"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# OrderLine

One line of an order: a product and how many of it were bought.

# Schema

```graphql
type OrderLine {
  product: Product!
  quantity: Int!
  "The price of a single unit at the time the order was placed."
  unitPriceCents: Int!
}
```

References: [`Product`](/types/Product.md).

<!-- graphql-okf:generated:end -->
