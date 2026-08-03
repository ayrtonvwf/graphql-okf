---
type: "GraphQL Mutation"
title: "addReview"
description: "Adds a review to a product."
resource: "https://shop.example/graphql#Mutation.addReview"
tags: ["graphql", "mutation"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# addReview

Adds a review to a product.

Directives: [`@auth`](/directives/auth.md)(requires: CUSTOMER).

**Returns** [`Review!`](/types/Review.md)

# Schema

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `body` | [`String`](/types/String.md) |  |  |
| `productId` | [`ID!`](/types/ID.md) |  |  |
| `rating` | [`Int!`](/types/Int.md) |  |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
