import type { ConceptKind } from "./naming.js";

export type TypeRef = {
  readonly wrappers: readonly ("nonNull" | "list")[];
  readonly name: string;
  /** Null for a spec-defined element, which has no concept file (issue #23). */
  readonly path: string | null;
};

export type Deprecation = { readonly reason: string | null };

export type AppliedDirective = {
  readonly name: string;
  /** Null for a spec directive, which has no concept file (issue #23). */
  readonly path: string | null;
  readonly args: readonly { readonly name: string; readonly value: string }[];
};

type ConceptBase = {
  readonly kind: ConceptKind;
  readonly name: string;
  readonly path: string;
  readonly description: string | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type InputValueNode = {
  readonly name: string;
  readonly description: string | null;
  readonly type: TypeRef;
  readonly defaultValue: string | null;
  readonly deprecation: Deprecation | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type FieldNode = {
  readonly name: string;
  readonly description: string | null;
  readonly type: TypeRef;
  readonly args: readonly InputValueNode[];
  readonly deprecation: Deprecation | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type EnumValueNode = {
  readonly name: string;
  readonly description: string | null;
  readonly deprecation: Deprecation | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type ObjectTypeNode = ConceptBase & {
  readonly kind: "object";
  readonly fields: readonly FieldNode[];
  readonly interfaces: readonly TypeRef[];
};

export type InterfaceTypeNode = ConceptBase & {
  readonly kind: "interface";
  readonly fields: readonly FieldNode[];
  readonly interfaces: readonly TypeRef[];
  readonly implementedBy: readonly TypeRef[];
};

export type UnionTypeNode = ConceptBase & {
  readonly kind: "union";
  readonly members: readonly TypeRef[];
};

export type EnumTypeNode = ConceptBase & {
  readonly kind: "enum";
  readonly values: readonly EnumValueNode[];
};

export type InputObjectTypeNode = ConceptBase & {
  readonly kind: "input";
  readonly fields: readonly InputValueNode[];
};

export type ScalarTypeNode = ConceptBase & {
  readonly kind: "scalar";
  readonly specifiedByUrl: string | null;
};

export type OperationNode = ConceptBase & {
  readonly kind: "query" | "mutation" | "subscription";
  /** The schema's declared root type name, which may not be "Query". */
  readonly rootTypeName: string;
  readonly args: readonly InputValueNode[];
  readonly type: TypeRef;
  readonly deprecation: Deprecation | null;
};

export type DirectiveDefinitionNode = ConceptBase & {
  readonly kind: "directive";
  readonly locations: readonly string[];
  readonly args: readonly InputValueNode[];
  readonly isRepeatable: boolean;
};

export type ConceptNode =
  | ObjectTypeNode
  | InterfaceTypeNode
  | UnionTypeNode
  | EnumTypeNode
  | InputObjectTypeNode
  | ScalarTypeNode
  | OperationNode
  | DirectiveDefinitionNode;

export type SchemaIr = {
  readonly resource: string;
  readonly origin: "sdl" | "introspection";
  readonly concepts: readonly ConceptNode[];
};
