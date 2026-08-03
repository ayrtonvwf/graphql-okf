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

Implements [`Node`](/types/Node.md), [`Purchasable`](/types/Purchasable.md), [`Timestamped`](/types/Timestamped.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `createdAt` | [`DateTime!`](/types/DateTime.md) |  |
| `description` | `String` | A long-form description. May contain Markdown, including **bold** text and [links](https://example.test). |
| `id` | `ID!` |  |
| `inStock` | `Boolean!` | Whether the product can currently be ordered. |
| `labels` | `[String!]!` | Free-form merchandising labels. |
| `name` | `String!` | The customer-facing name. |
| `price` | [`Money!`](/types/Money.md) |  |
| `reviews` | [`[Review!]!`](/types/Review.md) | Reviews left by customers, newest first. |
| `sku` | `String` | The internal SKU. Not stable across catalog migrations. (deprecated: No longer supported) |
| `updatedAt` | [`DateTime`](/types/DateTime.md) |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->

## Ownership

Owned by the Catalog team. Ping #catalog before changing pricing fields.
