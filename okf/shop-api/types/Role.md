---
type: "GraphQL Enum Type"
title: "Role"
description: "Access levels a caller can hold."
resource: "https://shop.example/graphql#Role"
tags: ["graphql", "enum"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# Role

Access levels a caller can hold.

Used by the `@auth` directive to gate fields.

# Schema

```graphql
enum Role {
  "A signed-in shopper."
  CUSTOMER
  "Anyone, including unauthenticated callers."
  GUEST
  "A member of shop staff."
  STAFF
}
```

<!-- graphql-okf:generated:end -->
