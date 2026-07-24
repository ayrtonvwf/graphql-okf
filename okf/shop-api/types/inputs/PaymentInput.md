---
type: input
title: "PaymentInput"
description: "Exactly one payment instrument.\n\nSupply exactly one field; supplying zero or more than one is an error."
resource: "https://shop.example/graphql"
tags: [graphql, input]
timestamp: 2026-01-15T09:00:00.000Z
---

<!-- graphql-okf:generated:start -->
<!-- Regenerated on each run. Do not edit inside this block; edits below the end marker are preserved. -->

# PaymentInput

Exactly one payment instrument.

Supply exactly one field; supplying zero or more than one is an error.

Directives: [`@oneOf`](../../directives/oneOf.md).

## Fields

- **`creditCardToken`**: [`String`](../scalars/String.md)
- **`giftCardCode`**: [`String`](../scalars/String.md)
- **`payPalToken`**: [`String`](../scalars/String.md)

<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
