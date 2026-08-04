---
type: "GraphQL Object Type"
title: "Country"
resource: "https://countries.trevorblades.com/graphql#Country"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-08-04T16:53:04.837Z" }
---

<!-- graphql-okf:generated:start -->
# Country

# Schema

```graphql
type Country {
  awsRegion: String!
  capital: String
  code: ID!
  continent: Continent!
  currencies: [String!]!
  currency: String
  emoji: String!
  emojiU: String!
  languages: [Language!]!
  name(lang: String): String!
  native: String!
  phone: String!
  phones: [String!]!
  states: [State!]!
  subdivisions: [Subdivision!]!
}
```

References: [`Continent`](/types/Continent.md), [`Language`](/types/Language.md), [`State`](/types/State.md), [`Subdivision`](/types/Subdivision.md).

<!-- graphql-okf:generated:end -->
