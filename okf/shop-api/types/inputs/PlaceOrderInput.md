---
type: "GraphQL Input Type"
title: "PlaceOrderInput"
description: "Everything needed to turn a basket into an order."
resource: "https://shop.example/graphql#PlaceOrderInput"
tags: ["graphql", "input"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# PlaceOrderInput

Everything needed to turn a basket into an order.

# Schema

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `payWith` | [`PaymentInput!`](/types/inputs/PaymentInput.md) |  |  |
| `productIds` | [`[ID!]!`](/types/scalars/ID.md) |  |  |
| `shipTo` | [`AddressInput!`](/types/inputs/AddressInput.md) |  |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
