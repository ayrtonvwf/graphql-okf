# Query operations

<!-- graphql-okf:generated:start -->
Signatures are GraphQL SDL. A type name in a signature is a concept file at `/types/<Name>.md`; `/types/index.md` lists them all.

* [`me: Customer`](/queries/me.md) - The currently authenticated customer, if any.
* [`node(id: ID!): Node`](/queries/node.md) - Looks up any node by its globally unique identifier.
* [`order(id: ID!): Order`](/queries/order.md) - Looks up a single order.
* [`product(id: ID!): Product`](/queries/product.md) - Looks up a single product.
* [`products(filter: ProductFilter, first: Int = 20): [Product!]!`](/queries/products.md) - Lists products, most recently created first.
* [searchProducts](/queries/searchProducts.md) - (removed)
<!-- graphql-okf:generated:end -->

<!-- Human-authored content below this line is preserved across regenerations. -->
