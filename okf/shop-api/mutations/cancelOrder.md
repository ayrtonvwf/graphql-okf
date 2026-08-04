---
type: "GraphQL Mutation"
title: "cancelOrder"
description: "Cancels an order that has not yet shipped."
resource: "https://shop.example/graphql#Mutation.cancelOrder"
tags: ["graphql", "mutation"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# cancelOrder

Cancels an order that has not yet shipped.

# Schema

```graphql
cancelOrder(id: ID!, reason: String): Order! @auth(requires: CUSTOMER)
```

References: [`@auth`](/directives/auth.md), [`Order`](/types/Order.md).

<!-- graphql-okf:generated:end -->
