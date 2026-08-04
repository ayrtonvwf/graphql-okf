---
type: "GraphQL Object Type"
title: "Customer"
description: "A person who can place orders."
resource: "https://shop.example/graphql#Customer"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Customer

A person who can place orders.

A customer is created on first sign-in and is never hard-deleted.

# Schema

```graphql
type Customer implements Node & Timestamped {
  createdAt: DateTime!
  "Where orders are shipped by default."
  defaultAddress: Address
  displayName: String!
  email: EmailAddress! @auth(requires: STAFF)
  id: ID!
  updatedAt: DateTime
}
```

References: [`Address`](/types/Address.md), [`@auth`](/directives/auth.md), [`DateTime`](/types/DateTime.md), [`EmailAddress`](/types/EmailAddress.md), [`Node`](/types/Node.md), [`Timestamped`](/types/Timestamped.md).

<!-- graphql-okf:generated:end -->
