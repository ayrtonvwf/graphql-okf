---
type: "GraphQL Subscription"
title: "orderStatusChanged"
description: "Emits the order each time its status changes."
resource: "https://shop.example/graphql#Subscription.orderStatusChanged"
tags: ["graphql", "subscription"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# orderStatusChanged

Emits the order each time its status changes.

# Schema

```graphql
orderStatusChanged(orderId: ID!): Order! @auth(requires: CUSTOMER)
```

References: [`@auth`](/directives/auth.md), [`Order`](/types/Order.md).

<!-- graphql-okf:generated:end -->
