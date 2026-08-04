# Subscription operations

<!-- graphql-okf:generated:start -->
Signatures are GraphQL SDL. A type name in a signature is a concept file at `/types/<Name>.md`; `/types/index.md` lists them all.

* [`orderStatusChanged(orderId: ID!): Order!`](/subscriptions/orderStatusChanged.md) - Emits the order each time its status changes.
* [`productPriceChanged: Product!`](/subscriptions/productPriceChanged.md) - Emits a product each time its price changes.
* [`reviewPosted(productId: ID!): Review!`](/subscriptions/reviewPosted.md) - Emits each new review as it is posted.
<!-- graphql-okf:generated:end -->
