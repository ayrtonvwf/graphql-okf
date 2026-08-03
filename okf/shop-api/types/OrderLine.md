---
type: "GraphQL Object Type"
title: "OrderLine"
description: "One line of an order: a product and how many of it were bought."
resource: "https://shop.example/graphql#OrderLine"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# OrderLine

One line of an order: a product and how many of it were bought.

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `product` | [`Product!`](/types/Product.md) |  |
| `quantity` | [`Int!`](/types/Int.md) |  |
| `unitPriceCents` | [`Int!`](/types/Int.md) | The price of a single unit at the time the order was placed. |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
