export type GraphqlOkfErrorCode =
  | "SOURCE_NOT_FOUND"
  | "SOURCE_UNREADABLE"
  | "SDL_PARSE_ERROR"
  | "SCHEMA_INVALID"
  | "ENDPOINT_UNREACHABLE"
  | "ENDPOINT_HTTP_ERROR"
  | "ENDPOINT_INVALID_RESPONSE"
  | "INTROSPECTION_DISABLED"
  | "NAME_HASH_COLLISION"
  | "LAYOUT_MOVE_CONFLICT"
  | "NOT_A_BUNDLE"
  | "CLI_USAGE"
  | "INVALID_TIMESTAMP"
  | "MALFORMED_CONCEPT"
  | "OKF_VERSION_DOWNGRADE"
  | "INVALID_OKF_VERSION";

export class GraphqlOkfError extends Error {
  readonly code: GraphqlOkfErrorCode;

  constructor(code: GraphqlOkfErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GraphqlOkfError";
    this.code = code;
  }
}
