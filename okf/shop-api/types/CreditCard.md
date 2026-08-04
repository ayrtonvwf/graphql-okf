---
type: "GraphQL Object Type"
title: "CreditCard"
description: "A payment card."
resource: "https://shop.example/graphql#CreditCard"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# CreditCard

A payment card.

# Schema

```graphql
type CreditCard {
  brand: String!
  expiryMonth: Int!
  expiryYear: Int!
  "The last four digits of the card number."
  last4: String!
}
```

<!-- graphql-okf:generated:end -->
