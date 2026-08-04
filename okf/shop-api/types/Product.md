---
type: "GraphQL Object Type"
title: "Product"
description: "An item offered for sale."
resource: "https://shop.example/graphql#Product"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Product

An item offered for sale.

# Schema

```graphql
type Product implements Node & Purchasable & Timestamped @tag(name: "catalog") @tag(name: "public") {
  createdAt: DateTime!
  """
  A long-form description.
  
  May contain Markdown, including **bold** text and [links](https://example.test).
  """
  description: String
  id: ID!
  "Whether the product can currently be ordered."
  inStock: Boolean!
  "Free-form merchandising labels."
  labels: [String!]!
  "The customer-facing name."
  name: String!
  price: Money!
  "Reviews left by customers, newest first."
  reviews: [Review!]!
  "The internal SKU. Not stable across catalog migrations."
  sku: String @deprecated(reason: "No longer supported")
  updatedAt: DateTime
}
```

References: [`DateTime`](/types/DateTime.md), [`Money`](/types/Money.md), [`Node`](/types/Node.md), [`Purchasable`](/types/Purchasable.md), [`Review`](/types/Review.md), [`@tag`](/directives/tag.md), [`Timestamped`](/types/Timestamped.md).

<!-- graphql-okf:generated:end -->

## Ownership

Owned by the Catalog team. Ping #catalog before changing pricing fields.
