---
type: "GraphQL Interface Type"
title: "Purchasable"
description: "Anything a customer can put in an order."
resource: "https://shop.example/graphql#Purchasable"
tags: ["graphql", "interface"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Purchasable

Anything a customer can put in an order.

Implementors are guaranteed to expose a price in the shop's base currency.

Implements [`Node`](/types/Node.md).

Implemented by [`Product`](/types/Product.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `id` | [`ID!`](/types/ID.md) |  |
| `price` | [`Money!`](/types/Money.md) | The price, including the currency it is denominated in. |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
