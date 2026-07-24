import { buildBundle } from "./emit/bundle.js";
import { assembleFile, EMPTY_HUMAN } from "./emit/render/seam.js";
import { writeBundle } from "./emit/write.js";
import type { SchemaIr } from "./model/ir.js";
import { project } from "./model/project.js";
import { loadSchema } from "./source/index.js";
import type { SourceSpec } from "./source/types.js";

export interface CreateOkfBundleOptions {
  readonly source: SourceSpec;
  readonly outDir: string;
  readonly now?: string;
}

export async function createOkfBundle(options: CreateOkfBundleOptions): Promise<void> {
  const ir = await readSchema(options.source);
  const timestamp = options.now ?? new Date().toISOString();
  const parts = buildBundle(ir, timestamp);
  const files = new Map<string, string>();
  for (const [path, part] of parts) {
    files.set(path, assembleFile(part, EMPTY_HUMAN));
  }
  await writeBundle(files, options.outDir);
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
