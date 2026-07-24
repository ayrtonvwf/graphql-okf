---
type: query
title: "products"
description: "Lists products, most recently created first."
resource: "https://shop.example/graphql"
tags: [graphql, query]
timestamp: 2026-03-02T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# products

Lists products, most recently created first.

**Returns** [`[Product!]!`](../types/objects/Product.md)

## Arguments

- **`filter`**: [`ProductFilter`](../types/inputs/ProductFilter.md)
- **`first`**: [`Int`](../types/scalars/Int.md) = `20` — Maximum number of products to return.

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
