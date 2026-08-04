---
type: "GraphQL Interface Type"
title: "Node"
description: "Anything addressable by a globally unique identifier."
resource: "https://shop.example/graphql#Node"
tags: ["graphql", "interface"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Node

Anything addressable by a globally unique identifier.

Implemented by [`Customer`](/types/Customer.md), [`Order`](/types/Order.md), [`Product`](/types/Product.md), [`Purchasable`](/types/Purchasable.md), [`Review`](/types/Review.md).

# Schema

```graphql
interface Node {
  "The globally unique identifier."
  id: ID!
}
```

<!-- graphql-okf:generated:end -->
