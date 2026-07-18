import { readFile } from "node:fs/promises";
import { buildSchema, validateSchema } from "graphql";
import { GraphqlOkfError } from "../errors.js";
import type { LoadedSchema } from "./types.js";

export async function loadFromSdl(filePath: string): Promise<LoadedSchema> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new GraphqlOkfError("SOURCE_NOT_FOUND", `SDL file not found: ${filePath}`, { cause });
    }
    throw new GraphqlOkfError("SOURCE_UNREADABLE", `Could not read SDL file: ${filePath}`, {
      cause,
    });
  }

  let schema: LoadedSchema["schema"];
  try {
    schema = buildSchema(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new GraphqlOkfError(
      "SDL_PARSE_ERROR",
      `Could not parse SDL file ${filePath}: ${detail}`,
      { cause },
    );
  }

  const errors = validateSchema(schema);
  if (errors.length > 0) {
    throw new GraphqlOkfError(
      "SCHEMA_INVALID",
      `Schema in ${filePath} is not valid: ${errors.map((error) => error.message).join("; ")}`,
    );
  }

  return { schema, resource: filePath, origin: "sdl" };
}
