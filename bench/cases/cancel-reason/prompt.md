This project is a small client for a GraphQL shop API.

Change the existing cancel-order flow so that a cancellation reason is required:
the client should refuse to submit a cancellation with an empty or missing reason.
After a successful cancellation, surface the server's response to the caller
rather than discarding it.

Follow the conventions already used by the existing feature modules in `src/`.
