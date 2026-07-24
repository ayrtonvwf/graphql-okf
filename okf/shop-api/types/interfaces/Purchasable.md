---
type: interface
title: "Purchasable"
description: "Anything a customer can put in an order.\n\nImplementors are guaranteed to expose a price in the shop's base currency."
resource: "https://shop.example/graphql"
tags: [graphql, interface]
timestamp: 2026-05-20T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Purchasable

Anything a customer can put in an order.

Implementors are guaranteed to expose a price in the shop's base currency.

Implements [`Node`](Node.md).

Implemented by [`Product`](../objects/Product.md).

## Fields

- **`id`** — [`ID!`](../scalars/ID.md)
- **`price`** — [`Money!`](../objects/Money.md) — The price, including the currency it is denominated in.

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
