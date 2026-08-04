---
type: "GraphQL Interface Type"
title: "Timestamped"
description: "Anything that records when it was created and last modified."
resource: "https://shop.example/graphql#Timestamped"
tags: ["graphql", "interface"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Timestamped

Anything that records when it was created and last modified.

Implemented by [`Customer`](/types/Customer.md), [`Order`](/types/Order.md), [`Product`](/types/Product.md), [`Review`](/types/Review.md).

# Schema

```graphql
interface Timestamped {
  createdAt: DateTime!
  updatedAt: DateTime
}
```

References: [`DateTime`](/types/DateTime.md).

<!-- graphql-okf:generated:end -->
