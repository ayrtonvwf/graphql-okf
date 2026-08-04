---
type: "GraphQL Mutation"
title: "addReview"
description: "Adds a review to a product."
resource: "https://shop.example/graphql#Mutation.addReview"
tags: ["graphql", "mutation"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# addReview

Adds a review to a product.

# Schema

```graphql
addReview(body: String, productId: ID!, rating: Int!): Review! @auth(requires: CUSTOMER)
```

References: [`@auth`](/directives/auth.md), [`Review`](/types/Review.md).

<!-- graphql-okf:generated:end -->
