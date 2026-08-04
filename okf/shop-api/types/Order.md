---
type: "GraphQL Object Type"
title: "Order"
description: "A customer's purchase."
resource: "https://shop.example/graphql#Order"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Order

A customer's purchase.

Directives: [`@auth`](/directives/auth.md)(requires: CUSTOMER).

Implements [`Node`](/types/Node.md), [`Timestamped`](/types/Timestamped.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `createdAt` | [`DateTime!`](/types/DateTime.md) |  |
| `currency` | [`Currency!`](/types/Currency.md) |  |
| `customer` | [`Customer!`](/types/Customer.md) |  |
| `id` | `ID!` |  |
| `lines` | [`[OrderLine!]!`](/types/OrderLine.md) |  |
| `paidWith` | [`PaymentMethod`](/types/PaymentMethod.md) |  |
| `shipTo` | [`Address!`](/types/Address.md) |  |
| `status` | [`OrderStatus!`](/types/OrderStatus.md) |  |
| `total` | [`Money!`](/types/Money.md) | The order total, including the currency it is denominated in. |
| `updatedAt` | [`DateTime`](/types/DateTime.md) |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
