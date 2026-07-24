---
type: input
title: "ProductFilter"
description: "Narrows a product listing. Every field is optional; omitted fields do not filter."
resource: "https://shop.example/graphql"
tags: [graphql, input]
timestamp: 2026-01-15T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# ProductFilter

Narrows a product listing. Every field is optional; omitted fields do not filter.

## Fields

- **`inStockOnly`**: [`Boolean`](../scalars/Boolean.md) = `false`
- **`labels`**: [`[String!]`](../scalars/String.md) = `[]` — Only products carrying all of these labels.
- **`maxPriceCents`**: [`Int`](../scalars/Int.md)
- **`minPriceCents`**: [`Int`](../scalars/Int.md) = `0`
- **`nameContains`**: [`String`](../scalars/String.md) = `""` — Case-insensitive substring match against the product name.
- **`visibleTo`**: [`Role`](../enums/Role.md) = `GUEST` — Only products a caller of this role may see.

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
