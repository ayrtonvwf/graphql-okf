---
type: "GraphQL Object Type"
title: "Product"
description: "An item offered for sale."
resource: "https://shop.example/graphql#Product"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Product

An item offered for sale.

Directives: [`@tag`](/directives/tag.md)(name: "catalog"), [`@tag`](/directives/tag.md)(name: "public").

Implements [`Node`](/types/interfaces/Node.md), [`Purchasable`](/types/interfaces/Purchasable.md), [`Timestamped`](/types/interfaces/Timestamped.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `createdAt` | [`DateTime!`](/types/scalars/DateTime.md) |  |
| `description` | [`String`](/types/scalars/String.md) | A long-form description. May contain Markdown, including **bold** text and [links](https://example.test). |
| `id` | [`ID!`](/types/scalars/ID.md) |  |
| `inStock` | [`Boolean!`](/types/scalars/Boolean.md) | Whether the product can currently be ordered. |
| `labels` | [`[String!]!`](/types/scalars/String.md) | Free-form merchandising labels. |
| `name` | [`String!`](/types/scalars/String.md) | The customer-facing name. |
| `price` | [`Money!`](/types/objects/Money.md) |  |
| `reviews` | [`[Review!]!`](/types/objects/Review.md) | Reviews left by customers, newest first. |
| `sku` | [`String`](/types/scalars/String.md) | The internal SKU. Not stable across catalog migrations. (deprecated: No longer supported) |
| `updatedAt` | [`DateTime`](/types/scalars/DateTime.md) |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->

## Ownership

Owned by the Catalog team. Ping #catalog before changing pricing fields.
