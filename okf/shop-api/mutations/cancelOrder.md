---
type: mutation
title: "cancelOrder"
description: "Cancels an order that has not yet shipped."
resource: "https://shop.example/graphql"
tags: [graphql, mutation]
timestamp: 2026-01-15T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# cancelOrder

Cancels an order that has not yet shipped.

Directives: [`@auth`](../directives/auth.md)(requires: CUSTOMER).

**Returns** [`Order!`](../types/objects/Order.md)

## Arguments

- **`id`**: [`ID!`](../types/scalars/ID.md)
- **`reason`**: [`String`](../types/scalars/String.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
