---
type: "GraphQL Directive"
title: "auth"
description: "Restricts a field or type to callers holding at least the given role."
resource: "https://shop.example/graphql#@auth"
tags: ["graphql", "directive"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
# @auth

Restricts a field or type to callers holding at least the given role.

# Schema

```graphql
directive @auth(requires: Role! = CUSTOMER) on FIELD_DEFINITION | OBJECT
```

References: [`Role`](/types/Role.md).

<!-- graphql-okf:generated:end -->
