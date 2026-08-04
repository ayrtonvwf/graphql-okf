---
type: "GraphQL Union Type"
title: "PaymentMethod"
description: "How an order was paid for."
resource: "https://shop.example/graphql#PaymentMethod"
tags: ["graphql", "union"]
generated: { by: "graphql-okf/0.1", at: "2026-05-20T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# PaymentMethod

How an order was paid for.

# Schema

```graphql
union PaymentMethod = CreditCard | PayPalAccount
```

References: [`CreditCard`](/types/CreditCard.md), [`PayPalAccount`](/types/PayPalAccount.md).

<!-- graphql-okf:generated:end -->
