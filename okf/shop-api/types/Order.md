---
type: "GraphQL Object Type"
title: "Order"
description: "A customer's purchase."
resource: "https://shop.example/graphql#Order"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Order

A customer's purchase.

# Schema

```graphql
type Order implements Node & Timestamped @auth(requires: CUSTOMER) {
  createdAt: DateTime!
  currency: Currency!
  customer: Customer!
  id: ID!
  lines: [OrderLine!]!
  paidWith: PaymentMethod
  shipTo: Address!
  status: OrderStatus!
  "The order total, including the currency it is denominated in."
  total: Money!
  updatedAt: DateTime
}
```

References: [`Address`](/types/Address.md), [`@auth`](/directives/auth.md), [`Currency`](/types/Currency.md), [`Customer`](/types/Customer.md), [`DateTime`](/types/DateTime.md), [`Money`](/types/Money.md), [`Node`](/types/Node.md), [`OrderLine`](/types/OrderLine.md), [`OrderStatus`](/types/OrderStatus.md), [`PaymentMethod`](/types/PaymentMethod.md), [`Timestamped`](/types/Timestamped.md).

<!-- graphql-okf:generated:end -->
