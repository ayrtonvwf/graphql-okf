import {
  type GraphQLEnumType,
  type GraphQLNamedType,
  type GraphQLScalarType,
  isEnumType,
  isScalarType,
  isSpecifiedScalarType,
} from "graphql";
import type { LoadedSchema } from "../source/types.js";
import type { ConceptNode, EnumTypeNode, ScalarTypeNode, SchemaIr } from "./ir.js";
import { type ConceptKind, type ElementName, elementId, resolvePaths } from "./naming.js";

function byName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

function deprecationOf(reason: string | null | undefined) {
  return reason === null || reason === undefined ? null : { reason };
}

function kindOfNamedType(type: GraphQLNamedType): ConceptKind | null {
  if (isScalarType(type)) return "scalar";
  if (isEnumType(type)) return "enum";
  return null;
}

export function project(loaded: LoadedSchema): SchemaIr {
  const { schema } = loaded;

  const namedTypes = Object.values(schema.getTypeMap()).filter(
    (type) => !type.name.startsWith("__"),
  );

  const elements: ElementName[] = [];
  for (const type of namedTypes) {
    const kind = kindOfNamedType(type);
    if (kind !== null) {
      elements.push({ kind, name: type.name });
    }
  }

  const paths = resolvePaths(elements);
  const pathFor = (element: ElementName): string => {
    const path = paths.get(elementId(element));
    if (path === undefined) {
      throw new Error(`no path resolved for ${elementId(element)}`);
    }
    return path;
  };

  const concepts: ConceptNode[] = [];

  for (const type of namedTypes) {
    if (isScalarType(type)) {
      concepts.push(scalarConcept(type, pathFor({ kind: "scalar", name: type.name })));
    } else if (isEnumType(type)) {
      concepts.push(enumConcept(type, pathFor({ kind: "enum", name: type.name })));
    }
  }

  concepts.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  return { resource: loaded.resource, origin: loaded.origin, concepts };
}

function scalarConcept(type: GraphQLScalarType, path: string): ScalarTypeNode {
  return {
    kind: "scalar",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    specifiedByUrl: type.specifiedByURL ?? null,
    isBuiltIn: isSpecifiedScalarType(type),
  };
}

function enumConcept(type: GraphQLEnumType, path: string): EnumTypeNode {
  return {
    kind: "enum",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    values: byName(type.getValues()).map((value) => ({
      name: value.name,
      description: value.description ?? null,
      deprecation: deprecationOf(value.deprecationReason),
      appliedDirectives: [],
    })),
  };
}
