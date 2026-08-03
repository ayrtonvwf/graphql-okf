---
type: "GraphQL Query"
title: "products"
description: "Lists products, most recently created first."
resource: "https://shop.example/graphql#Query.products"
tags: ["graphql", "query"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# products

Lists products, most recently created first.

**Returns** [`[Product!]!`](/types/Product.md)

# Schema

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `filter` | [`ProductFilter`](/types/ProductFilter.md) |  |  |
| `first` | `Int` | `20` | Maximum number of products to return. |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
