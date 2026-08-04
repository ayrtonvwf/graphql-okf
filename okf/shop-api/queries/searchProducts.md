---
type: "GraphQL Query"
title: "searchProducts"
description: "Full-text search across the catalog."
resource: "https://shop.example/graphql#Query.searchProducts"
tags: ["graphql", "query"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
graphql_okf_status: "removed"
removedAt: "2026-03-02T09:00:00.000Z"
---

<!-- graphql-okf:generated:start -->
> **Removed.** This element is no longer present in the schema as of 2026-03-02.

# Last known definition

# searchProducts

Full-text search across the catalog.

# Schema

```graphql
searchProducts(
  "Ignored since the search backend migration."
  fuzzy: Boolean = false @deprecated(reason: "The backend always matches fuzzily.")
  query: String!
): [Product!]! @deprecated(reason: "Use products(filter:) instead.")
```

References: [`Product`](/types/Product.md).

<!-- graphql-okf:generated:end -->
