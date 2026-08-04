---
type: "GraphQL Object Type"
title: "Address"
description: "A postal address."
resource: "https://shop.example/graphql#Address"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Address

A postal address.

# Schema

```graphql
type Address {
  city: String!
  "An ISO-3166-1 alpha-2 country code."
  country: String!
  line1: String!
  line2: String
  postalCode: String!
}
```

<!-- graphql-okf:generated:end -->
