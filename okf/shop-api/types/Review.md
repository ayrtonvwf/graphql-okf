---
type: "GraphQL Object Type"
title: "Review"
description: "A customer's written opinion of a product."
resource: "https://shop.example/graphql#Review"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Review

A customer's written opinion of a product.

# Schema

```graphql
type Review implements Node & Timestamped {
  author: Customer!
  body: String
  createdAt: DateTime!
  id: ID!
  product: Product!
  "A rating from 1 to 5 inclusive."
  rating: Int!
  updatedAt: DateTime
}
```

References: [`Customer`](/types/Customer.md), [`DateTime`](/types/DateTime.md), [`Node`](/types/Node.md), [`Product`](/types/Product.md), [`Timestamped`](/types/Timestamped.md).

<!-- graphql-okf:generated:end -->
