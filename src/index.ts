import type { SchemaIr } from "./model/ir.js";
import { project } from "./model/project.js";
import { loadSchema } from "./source/index.js";
import type { SourceSpec } from "./source/types.js";

export interface OkfBundleOptions {
  readonly outDir: string;
}

export function createOkfBundle(_options: OkfBundleOptions): never {
  throw new Error("graphql-okf: not implemented yet (GOAL-M1 in progress)");
}

export type { GraphqlOkfErrorCode } from "./errors.js";
export { GraphqlOkfError } from "./errors.js";
export type {
  AppliedDirective,
  ConceptNode,
  Deprecation,
  DirectiveDefinitionNode,
  EnumTypeNode,
  EnumValueNode,
  FieldNode,
  InputObjectTypeNode,
  InputValueNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  SchemaIr,
  TypeRef,
  UnionTypeNode,
} from "./model/ir.js";
export type { ConceptKind } from "./model/naming.js";
export type { FetchLike, LoadedSchema, SourceSpec } from "./source/types.js";

export async function readSchema(spec: SourceSpec): Promise<SchemaIr> {
  return project(await loadSchema(spec));
}
