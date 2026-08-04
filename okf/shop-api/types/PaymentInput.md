---
type: "GraphQL Input Type"
title: "PaymentInput"
description: "Exactly one payment instrument."
resource: "https://shop.example/graphql#PaymentInput"
tags: ["graphql", "input"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# PaymentInput

Exactly one payment instrument.

Supply exactly one field; supplying zero or more than one is an error.

# Schema

```graphql
input PaymentInput @oneOf {
  creditCardToken: String
  giftCardCode: String
  payPalToken: String
}
```

<!-- graphql-okf:generated:end -->
