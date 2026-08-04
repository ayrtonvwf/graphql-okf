# Types

<!-- graphql-okf:generated:start -->
## Object types

* [Address](/types/Address.md) - A postal address.
* [CreditCard](/types/CreditCard.md) - A payment card.
* [Customer](/types/Customer.md) - A person who can place orders.
* [Money](/types/Money.md) - An amount of money in a specific currency.
* [Order](/types/Order.md) - A customer's purchase.
* [OrderLine](/types/OrderLine.md) - One line of an order: a product and how many of it were bought.
* [PayPalAccount](/types/PayPalAccount.md) - A linked PayPal account.
* [Product](/types/Product.md) - An item offered for sale.
* [Review](/types/Review.md) - A customer's written opinion of a product.

## Interface types

* [Node](/types/Node.md) - Anything addressable by a globally unique identifier.
* [Purchasable](/types/Purchasable.md) - Anything a customer can put in an order.
* [Timestamped](/types/Timestamped.md) - Anything that records when it was created and last modified.

## Union types

* [PaymentMethod](/types/PaymentMethod.md) - How an order was paid for.

## Enum types

* [Currency](/types/Currency.md) - An ISO-4217 currency code.
* [OrderStatus](/types/OrderStatus.md) - The lifecycle stage of an order.
* [Role](/types/Role.md) - Access levels a caller can hold.

## Input object types

* [AddressInput](/types/AddressInput.md) - A postal address supplied by a client.
* [PaymentInput](/types/PaymentInput.md) - Exactly one payment instrument.
* [PlaceOrderInput](/types/PlaceOrderInput.md) - Everything needed to turn a basket into an order.
* [ProductFilter](/types/ProductFilter.md) - Narrows a product listing.

## Scalar types

* [DateTime](/types/DateTime.md) - An ISO-8601 instant, e.g.
* [EmailAddress](/types/EmailAddress.md) - An RFC 5322 email address.

## Removed

* [GiftCard](/types/GiftCard.md) - (removed)
<!-- graphql-okf:generated:end -->
