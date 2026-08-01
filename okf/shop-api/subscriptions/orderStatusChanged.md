---
type: "GraphQL Subscription"
title: "orderStatusChanged"
description: "Emits the order each time its status changes."
resource: "https://shop.example/graphql#Subscription.orderStatusChanged"
tags: ["graphql", "subscription"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# orderStatusChanged

Emits the order each time its status changes.

Directives: [`@auth`](/directives/auth.md)(requires: CUSTOMER).

**Returns** [`Order!`](/types/objects/Order.md)

# Schema

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `orderId` | [`ID!`](/types/scalars/ID.md) |  |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
