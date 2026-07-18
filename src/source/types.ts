import type { GraphQLSchema } from "graphql";

export type LoadedSchema = {
  readonly schema: GraphQLSchema;
  readonly resource: string;
  readonly origin: "sdl" | "introspection";
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type SourceSpec =
  | { readonly kind: "sdl"; readonly path: string }
  | {
      readonly kind: "endpoint";
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly fetch?: FetchLike;
    };
