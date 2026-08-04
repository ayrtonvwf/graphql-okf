# Mutation operations

<!-- graphql-okf:generated:start -->
Signatures are GraphQL SDL. A type name in a signature is a concept file at `/types/<Name>.md`; `/types/index.md` lists them all.

* [`addReview(body: String, productId: ID!, rating: Int!): Review!`](/mutations/addReview.md) - Adds a review to a product.
* [`cancelOrder(id: ID!, reason: String): Order!`](/mutations/cancelOrder.md) - Cancels an order that has not yet shipped.
* [`placeOrder(input: PlaceOrderInput!): Order!`](/mutations/placeOrder.md) - Places an order for the given products.
* [`updateDefaultAddress(address: AddressInput!, customerId: ID!): Customer!`](/mutations/updateDefaultAddress.md) - Replaces a customer's default shipping address.
<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
