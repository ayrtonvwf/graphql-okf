---
type: "GraphQL Query"
title: "order"
description: "Looks up a single order."
resource: "https://shop.example/graphql#Query.order"
tags: ["graphql", "query"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# order

Looks up a single order.

# Schema

```graphql
order(id: ID!): Order @auth(requires: CUSTOMER)
```

References: [`@auth`](/directives/auth.md), [`Order`](/types/Order.md).

<!-- graphql-okf:generated:end -->
