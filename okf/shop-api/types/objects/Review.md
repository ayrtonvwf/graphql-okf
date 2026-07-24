---
type: object
title: "Review"
description: "A customer's written opinion of a product."
resource: "https://shop.example/graphql"
tags: [graphql, object]
timestamp: 2026-03-02T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Review

A customer's written opinion of a product.

Implements [`Node`](../interfaces/Node.md), [`Timestamped`](../interfaces/Timestamped.md).

## Fields

- **`author`** — [`Customer!`](Customer.md)
- **`body`** — [`String`](../scalars/String.md)
- **`createdAt`** — [`DateTime!`](../scalars/DateTime.md)
- **`id`** — [`ID!`](../scalars/ID.md)
- **`product`** — [`Product!`](Product.md)
- **`rating`** — [`Int!`](../scalars/Int.md) — A rating from 1 to 5 inclusive.
- **`updatedAt`** — [`DateTime`](../scalars/DateTime.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
