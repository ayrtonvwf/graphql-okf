---
type: query
title: "searchProducts"
description: "Full-text search across the catalog."
resource: "https://shop.example/graphql"
tags: [graphql, query]
timestamp: 2026-01-15T09:00:00.000Z
status: removed
removedAt: 2026-03-02T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
> **Removed.** This element is no longer present in the schema as of 2026-03-02.

## Last known definition

# searchProducts

Full-text search across the catalog.

**Deprecated: Use products(filter:) instead.**

**Returns** [`[Product!]!`](../types/objects/Product.md)

## Arguments

- **`fuzzy`**: [`Boolean`](../types/scalars/Boolean.md) = `false` — Ignored since the search backend migration. (deprecated: The backend always matches fuzzily.)
- **`query`**: [`String!`](../types/scalars/String.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
