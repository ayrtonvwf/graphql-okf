import type { IntrospectionOptions, IntrospectionQuery } from "graphql";
import { buildClientSchema, getIntrospectionQuery } from "graphql";
import { GraphqlOkfError } from "../errors.js";
import type { FetchLike, LoadedSchema } from "./types.js";

/**
 * graphql-js v16 defaults every one of these to false. Without them the
 * introspection path loses specifiedByURL, directive repeatability and
 * input-value deprecation, breaking SDL/introspection equivalence (spec §5.3).
 */
export const INTROSPECTION_OPTIONS: IntrospectionOptions = {
  descriptions: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
  schemaDescription: true,
  inputValueDeprecation: true,
};

type GraphqlResponse = {
  readonly data?: unknown;
  readonly errors?: readonly { readonly message?: unknown }[];
};

function errorMessages(payload: GraphqlResponse): readonly string[] {
  if (!Array.isArray(payload.errors)) {
    return [];
  }
  return payload.errors.map((error) => String(error?.message ?? ""));
}

export async function loadFromEndpoint(
  url: string,
  options: { headers?: Readonly<Record<string, string>>; fetch?: FetchLike } = {},
): Promise<LoadedSchema> {
  const doFetch = options.fetch ?? globalThis.fetch;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ query: getIntrospectionQuery(INTROSPECTION_OPTIONS) }),
    });
  } catch (cause) {
    throw new GraphqlOkfError("ENDPOINT_UNREACHABLE", `Could not reach GraphQL endpoint ${url}`, {
      cause,
    });
  }

  if (!response.ok) {
    throw new GraphqlOkfError(
      "ENDPOINT_HTTP_ERROR",
      `GraphQL endpoint ${url} responded with HTTP ${response.status}`,
    );
  }

  let payload: GraphqlResponse;
  try {
    payload = (await response.json()) as GraphqlResponse;
  } catch (cause) {
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} did not return JSON`,
      { cause },
    );
  }

  const messages = errorMessages(payload);
  if (messages.length > 0) {
    const disabled = messages.some((message) => /introspection/i.test(message));
    if (disabled) {
      throw new GraphqlOkfError(
        "INTROSPECTION_DISABLED",
        `GraphQL endpoint ${url} has introspection disabled (${messages.join("; ")}). ` +
          "Supply an SDL file instead.",
      );
    }
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} returned errors: ${messages.join("; ")}`,
    );
  }

  const data = payload.data;
  if (typeof data !== "object" || data === null || !("__schema" in data)) {
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} did not return an introspection result`,
    );
  }

  try {
    const schema = buildClientSchema(data as unknown as IntrospectionQuery);
    return { schema, resource: url, origin: "introspection" };
  } catch (cause) {
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} returned an introspection result that could not be built`,
      { cause },
    );
  }
}
