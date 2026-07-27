---
type: "GraphQL Enum Type"
title: "Role"
description: "Access levels a caller can hold."
resource: "https://shop.example/graphql#Role"
tags: ["graphql", "enum"]
timestamp: "2026-01-15T09:00:00.000Z"
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Role

Access levels a caller can hold.

Used by the `@auth` directive to gate fields.

# Schema

| Value | Description |
| --- | --- |
| `CUSTOMER` | A signed-in shopper. |
| `GUEST` | Anyone, including unauthenticated callers. |
| `STAFF` | A member of shop staff. |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
