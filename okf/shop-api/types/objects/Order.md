---
type: object
title: "Order"
description: "A customer's purchase."
resource: "https://shop.example/graphql"
tags: [graphql, object]
timestamp: 2026-05-20T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Order

A customer's purchase.

Directives: [`@auth`](../../directives/auth.md)(requires: CUSTOMER).

Implements [`Node`](../interfaces/Node.md), [`Timestamped`](../interfaces/Timestamped.md).

## Fields

- **`createdAt`** — [`DateTime!`](../scalars/DateTime.md)
- **`currency`** — [`Currency!`](../enums/Currency.md)
- **`customer`** — [`Customer!`](Customer.md)
- **`id`** — [`ID!`](../scalars/ID.md)
- **`lines`** — [`[OrderLine!]!`](OrderLine.md)
- **`paidWith`** — [`PaymentMethod`](../unions/PaymentMethod.md)
- **`shipTo`** — [`Address!`](Address.md)
- **`status`** — [`OrderStatus!`](../enums/OrderStatus.md)
- **`total`** — [`Money!`](Money.md) — The order total, including the currency it is denominated in.
- **`updatedAt`** — [`DateTime`](../scalars/DateTime.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
