---
type: "GraphQL Object Type"
title: "Money"
description: "An amount of money in a specific currency."
resource: "https://shop.example/graphql#Money"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Money

An amount of money in a specific currency.

# Schema

```graphql
type Money {
  "The amount in the smallest unit of the currency, e.g. cents."
  amountCents: Int!
  currency: Currency!
}
```

References: [`Currency`](/types/Currency.md).

<!-- graphql-okf:generated:end -->
