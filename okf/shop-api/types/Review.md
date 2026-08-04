---
type: "GraphQL Object Type"
title: "Review"
description: "A customer's written opinion of a product."
resource: "https://shop.example/graphql#Review"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Review

A customer's written opinion of a product.

Implements [`Node`](/types/Node.md), [`Timestamped`](/types/Timestamped.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `author` | [`Customer!`](/types/Customer.md) |  |
| `body` | `String` |  |
| `createdAt` | [`DateTime!`](/types/DateTime.md) |  |
| `id` | `ID!` |  |
| `product` | [`Product!`](/types/Product.md) |  |
| `rating` | `Int!` | A rating from 1 to 5 inclusive. |
| `updatedAt` | [`DateTime`](/types/DateTime.md) |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
