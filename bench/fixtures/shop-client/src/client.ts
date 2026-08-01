const ENDPOINT = process.env.SHOP_API_URL ?? "https://shop.example.test/graphql";

export interface RequestOptions {
  /** Sends the caller's session token. Required by operations that need a signed-in customer. */
  readonly authenticated?: boolean;
}

/**
 * Sends an operation to the shop API and hands back the raw `data` payload.
 *
 * Deliberately untyped: each feature module declares the narrow shape it uses.
 */
export async function request(
  query: string,
  variables: Record<string, unknown> = {},
  options: RequestOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.authenticated === true) {
    const token = process.env.SHOP_API_TOKEN;
    if (token === undefined) {
      throw new Error("SHOP_API_TOKEN is required for authenticated operations");
    }
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shop API responded ${response.status}`);
  }

  const payload = (await response.json()) as { data?: unknown; errors?: { message: string }[] };
  if (payload.errors !== undefined && payload.errors.length > 0) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }
  return payload.data;
}
