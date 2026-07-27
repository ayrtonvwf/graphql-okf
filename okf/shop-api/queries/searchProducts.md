---
type: "GraphQL Query"
title: "searchProducts"
description: "Full-text search across the catalog."
resource: "https://shop.example/graphql#Query.searchProducts"
tags: ["graphql", "query"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
graphql_okf_status: "removed"
removedAt: "2026-03-02T09:00:00.000Z"
---

<!-- graphql-okf:generated:start -->
> **Removed.** This element is no longer present in the schema as of 2026-03-02.

# Last known definition

# searchProducts

Full-text search across the catalog.

**Deprecated: Use products(filter:) instead.**

**Returns** [`[Product!]!`](../types/objects/Product.md)

# Schema

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `fuzzy` | [`Boolean`](../types/scalars/Boolean.md) | `false` | Ignored since the search backend migration. (deprecated: The backend always matches fuzzily.) |
| `query` | [`String!`](../types/scalars/String.md) |  |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
