---
type: "GraphQL Query"
title: "products"
description: "Lists products, most recently created first."
resource: "https://shop.example/graphql#Query.products"
tags: ["graphql", "query"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# products

Lists products, most recently created first.

# Schema

```graphql
products(
  filter: ProductFilter
  "Maximum number of products to return."
  first: Int = 20
): [Product!]!
```

References: [`Product`](/types/Product.md), [`ProductFilter`](/types/ProductFilter.md).

<!-- graphql-okf:generated:end -->
