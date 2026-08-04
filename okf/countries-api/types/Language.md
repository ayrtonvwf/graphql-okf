---
type: "GraphQL Object Type"
title: "Language"
resource: "https://countries.trevorblades.com/graphql#Language"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-08-04T16:53:04.837Z" }
---

<!-- graphql-okf:generated:start -->
# Language

# Schema

```graphql
type Language {
  code: ID!
  countries: [Country!]!
  name: String!
  native: String!
  rtl: Boolean!
}
```

References: [`Country`](/types/Country.md).

<!-- graphql-okf:generated:end -->
