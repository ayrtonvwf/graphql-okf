---
type: mutation
title: "addReview"
description: "Adds a review to a product."
resource: "https://shop.example/graphql"
tags: [graphql, mutation]
timestamp: 2026-03-02T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# addReview

Adds a review to a product.

Directives: [`@auth`](../directives/auth.md)(requires: CUSTOMER).

**Returns** [`Review!`](../types/objects/Review.md)

## Arguments

- **`body`**: [`String`](../types/scalars/String.md)
- **`productId`**: [`ID!`](../types/scalars/ID.md)
- **`rating`**: [`Int!`](../types/scalars/Int.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
