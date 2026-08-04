---
type: "GraphQL Enum Type"
title: "OrderStatus"
description: "The lifecycle stage of an order."
resource: "https://shop.example/graphql#OrderStatus"
tags: ["graphql", "enum"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# OrderStatus

The lifecycle stage of an order.

# Schema

```graphql
enum OrderStatus {
  CANCELLED
  DELIVERED
  PAID
  "Created but not yet paid."
  PENDING
  "Paid, then fully refunded."
  REFUNDED
  SHIPPED
}
```

<!-- graphql-okf:generated:end -->
