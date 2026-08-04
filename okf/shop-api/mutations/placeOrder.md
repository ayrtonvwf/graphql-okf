---
type: "GraphQL Mutation"
title: "placeOrder"
description: "Places an order for the given products."
resource: "https://shop.example/graphql#Mutation.placeOrder"
tags: ["graphql", "mutation"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# placeOrder

Places an order for the given products.

# Schema

```graphql
placeOrder(input: PlaceOrderInput!): Order! @auth(requires: CUSTOMER)
```

References: [`@auth`](/directives/auth.md), [`Order`](/types/Order.md), [`PlaceOrderInput`](/types/PlaceOrderInput.md).

<!-- graphql-okf:generated:end -->
