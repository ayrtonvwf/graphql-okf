---
type: object
title: "Customer"
description: "A person who can place orders.\n\nA customer is created on first sign-in and is never hard-deleted."
resource: "https://shop.example/graphql"
tags: [graphql, object]
timestamp: 2026-03-02T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Customer

A person who can place orders.

A customer is created on first sign-in and is never hard-deleted.

Implements [`Node`](../interfaces/Node.md), [`Timestamped`](../interfaces/Timestamped.md).

## Fields

- **`createdAt`** — [`DateTime!`](../scalars/DateTime.md)
- **`defaultAddress`** — [`Address`](Address.md) — Where orders are shipped by default.
- **`displayName`** — [`String!`](../scalars/String.md)
- **`email`** — [`EmailAddress!`](../scalars/EmailAddress.md)
- **`id`** — [`ID!`](../scalars/ID.md)
- **`updatedAt`** — [`DateTime`](../scalars/DateTime.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
