---
type: object
title: "OrderLine"
description: "One line of an order: a product and how many of it were bought."
resource: "https://shop.example/graphql"
tags: [graphql, object]
timestamp: 2026-01-15T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# OrderLine

One line of an order: a product and how many of it were bought.

## Fields

- **`product`** — [`Product!`](Product.md)
- **`quantity`** — [`Int!`](../scalars/Int.md)
- **`unitPriceCents`** — [`Int!`](../scalars/Int.md) — The price of a single unit at the time the order was placed.

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
