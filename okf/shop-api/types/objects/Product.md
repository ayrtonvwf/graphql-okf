---
type: object
title: "Product"
description: "An item offered for sale."
resource: "https://shop.example/graphql"
tags: [graphql, object]
timestamp: 2026-05-20T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Product

An item offered for sale.

Directives: [`@tag`](../../directives/tag.md)(name: "catalog"), [`@tag`](../../directives/tag.md)(name: "public").

Implements [`Node`](../interfaces/Node.md), [`Purchasable`](../interfaces/Purchasable.md), [`Timestamped`](../interfaces/Timestamped.md).

## Fields

- **`createdAt`** — [`DateTime!`](../scalars/DateTime.md)
- **`description`** — [`String`](../scalars/String.md) — A long-form description.

May contain Markdown, including **bold** text and [links](https://example.test).
- **`id`** — [`ID!`](../scalars/ID.md)
- **`inStock`** — [`Boolean!`](../scalars/Boolean.md) — Whether the product can currently be ordered.
- **`labels`** — [`[String!]!`](../scalars/String.md) — Free-form merchandising labels.
- **`name`** — [`String!`](../scalars/String.md) — The customer-facing name.
- **`price`** — [`Money!`](Money.md)
- **`reviews`** — [`[Review!]!`](Review.md) — Reviews left by customers, newest first.
- **`sku`** — [`String`](../scalars/String.md) — The internal SKU. Not stable across catalog migrations. (deprecated: No longer supported)
- **`updatedAt`** — [`DateTime`](../scalars/DateTime.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->

## Ownership

Owned by the Catalog team. Ping #catalog before changing pricing fields.
