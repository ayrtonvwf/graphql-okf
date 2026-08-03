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

Implements [`Node`](/types/interfaces/Node.md), [`Timestamped`](/types/interfaces/Timestamped.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `createdAt` | [`DateTime!`](/types/scalars/DateTime.md) |  |
| `currency` | [`Currency!`](/types/enums/Currency.md) |  |
| `customer` | [`Customer!`](/types/objects/Customer.md) |  |
| `id` | [`ID!`](/types/scalars/ID.md) |  |
| `lines` | [`[OrderLine!]!`](/types/objects/OrderLine.md) |  |
| `paidWith` | [`PaymentMethod`](/types/unions/PaymentMethod.md) |  |
| `shipTo` | [`Address!`](/types/objects/Address.md) |  |
| `status` | [`OrderStatus!`](/types/enums/OrderStatus.md) |  |
| `total` | [`Money!`](/types/objects/Money.md) | The order total, including the currency it is denominated in. |
| `updatedAt` | [`DateTime`](/types/scalars/DateTime.md) |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
