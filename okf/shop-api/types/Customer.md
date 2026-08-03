---
type: "GraphQL Object Type"
title: "Customer"
description: "A person who can place orders."
resource: "https://shop.example/graphql#Customer"
tags: ["graphql", "object"]
generated: { by: "graphql-okf/0.1", at: "2026-03-02T09:00:00.000Z" }
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# Customer

A person who can place orders.

A customer is created on first sign-in and is never hard-deleted.

Implements [`Node`](/types/Node.md), [`Timestamped`](/types/Timestamped.md).

# Schema

| Field | Type | Description |
| --- | --- | --- |
| `createdAt` | [`DateTime!`](/types/DateTime.md) |  |
| `defaultAddress` | [`Address`](/types/Address.md) | Where orders are shipped by default. |
| `displayName` | [`String!`](/types/String.md) |  |
| `email` | [`EmailAddress!`](/types/EmailAddress.md) | [`@auth`](/directives/auth.md)(requires: STAFF) |
| `id` | [`ID!`](/types/ID.md) |  |
| `updatedAt` | [`DateTime`](/types/DateTime.md) |  |

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
