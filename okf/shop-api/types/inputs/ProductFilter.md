---
type: "GraphQL Input Type"
title: "ProductFilter"
description: "Narrows a product listing."
resource: "https://shop.example/graphql#ProductFilter"
tags: ["graphql", "input"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# ProductFilter

Narrows a product listing. Every field is optional; omitted fields do not filter.

# Schema

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `inStockOnly` | [`Boolean`](/types/scalars/Boolean.md) | `false` |  |
| `labels` | [`[String!]`](/types/scalars/String.md) | `[]` | Only products carrying all of these labels. |
| `maxPriceCents` | [`Int`](/types/scalars/Int.md) |  |  |
| `minPriceCents` | [`Int`](/types/scalars/Int.md) | `0` |  |
| `nameContains` | [`String`](/types/scalars/String.md) | `""` | Case-insensitive substring match against the product name. |
| `visibleTo` | [`Role`](/types/enums/Role.md) | `GUEST` | Only products a caller of this role may see. |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
