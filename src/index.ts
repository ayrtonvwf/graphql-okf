import { GraphqlOkfError } from "./errors.js";
import type { SchemaIr } from "./model/ir.js";
import { project } from "./model/project.js";
import { applyPlan } from "./reconcile/apply.js";
import { reconcile } from "./reconcile/plan.js";
import { isEmptyOrMissing, readExistingBundle } from "./reconcile/read.js";
import { loadSchema } from "./source/index.js";
import type { SourceSpec } from "./source/types.js";

export interface SyncOkfBundleOptions {
  readonly source: SourceSpec;
  readonly outDir: string;
  readonly now?: string;
}

export interface SyncResult {
  readonly created: boolean;
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: number;
}

export async function syncOkfBundle(options: SyncOkfBundleOptions): Promise<SyncResult> {
  const created = await isEmptyOrMissing(options.outDir);
  const existing = created ? new Map<string, string>() : await readExistingBundle(options.outDir);

  if (!created && !existing.has("index.md")) {
    throw new GraphqlOkfError(
      "NOT_A_BUNDLE",
      `"${options.outDir}" is not empty and does not look like a graphql-okf bundle (no root index.md). Choose an empty directory or an existing bundle.`,
    );
  }

  const ir = await readSchema(options.source);
  const timestamp = options.now ?? new Date().toISOString();
  const plan = reconcile(ir, existing, timestamp);
  await applyPlan(plan, options.outDir, timestamp);

  return {
    created,
    added: plan.added.map((change) => change.path),
    changed: plan.changed.map((change) => change.path),
    removed: plan.removed.map((change) => change.path),
    unchanged: plan.unchanged,
  };
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
