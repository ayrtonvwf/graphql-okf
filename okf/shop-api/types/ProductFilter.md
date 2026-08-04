---
type: "GraphQL Input Type"
title: "ProductFilter"
description: "Narrows a product listing."
resource: "https://shop.example/graphql#ProductFilter"
tags: ["graphql", "input"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# ProductFilter

Narrows a product listing. Every field is optional; omitted fields do not filter.

# Schema

```graphql
input ProductFilter {
  inStockOnly: Boolean = false
  "Only products carrying all of these labels."
  labels: [String!] = []
  maxPriceCents: Int
  minPriceCents: Int = 0
  "Case-insensitive substring match against the product name."
  nameContains: String = ""
  "Only products a caller of this role may see."
  visibleTo: Role = GUEST
}
```

References: [`Role`](/types/Role.md).

<!-- graphql-okf:generated:end -->
