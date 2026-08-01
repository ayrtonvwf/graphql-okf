---
type: "GraphQL Directive"
title: "auth"
description: "Restricts a field or type to callers holding at least the given role."
resource: "https://shop.example/graphql#@auth"
tags: ["graphql", "directive"]
generated: { by: "graphql-okf/0.1", at: "2026-01-15T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# @auth

Restricts a field or type to callers holding at least the given role.

Locations: `FIELD_DEFINITION`, `OBJECT`.

# Schema

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `requires` | [`Role!`](/types/enums/Role.md) | `CUSTOMER` |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
