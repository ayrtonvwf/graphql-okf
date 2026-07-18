import {
  astFromValue,
  type GraphQLArgument,
  type GraphQLEnumType,
  type GraphQLField,
  type GraphQLInputField,
  type GraphQLInputObjectType,
  type GraphQLInterfaceType,
  type GraphQLNamedType,
  type GraphQLObjectType,
  type GraphQLScalarType,
  type GraphQLType,
  type GraphQLUnionType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isSpecifiedScalarType,
  isUnionType,
  print,
} from "graphql";
import type { LoadedSchema } from "../source/types.js";
import type {
  ConceptNode,
  EnumTypeNode,
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
} from "./ir.js";
import {
  type ConceptKind,
  DIRECTORY_BY_KIND,
  type ElementName,
  elementId,
  resolvePaths,
} from "./naming.js";

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
  if (isObjectType(type)) return "object";
  if (isInterfaceType(type)) return "interface";
  if (isUnionType(type)) return "union";
  if (isInputObjectType(type)) return "input";
  return null;
}

function printDefaultValue(input: GraphQLArgument | GraphQLInputField): string | null {
  if (input.defaultValue === undefined) {
    return null;
  }
  const ast = astFromValue(input.defaultValue, input.type);
  return ast === null || ast === undefined ? null : print(ast);
}

function toTypeRef(
  type: GraphQLType,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): TypeRef {
  const wrappers: ("nonNull" | "list")[] = [];
  let current: GraphQLType = type;
  while (isNonNullType(current) || isListType(current)) {
    wrappers.push(isNonNullType(current) ? "nonNull" : "list");
    current = current.ofType;
  }
  const named = current as GraphQLNamedType;

  const rootDirectory = rootDirectoryByTypeName.get(named.name);
  if (rootDirectory !== undefined) {
    return { wrappers, name: named.name, path: `${rootDirectory}/index.md` };
  }

  const kind = kindOfNamedType(named);
  if (kind === null) {
    throw new Error(`unsupported named type ${named.name}`);
  }
  return { wrappers, name: named.name, path: pathFor({ kind, name: named.name }) };
}

function argNode(
  arg: GraphQLArgument,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): InputValueNode {
  return {
    name: arg.name,
    description: arg.description ?? null,
    type: toTypeRef(arg.type, pathFor, rootDirectoryByTypeName),
    defaultValue: printDefaultValue(arg),
    deprecation: deprecationOf(arg.deprecationReason),
    appliedDirectives: [],
  };
}

function inputFieldNode(
  field: GraphQLInputField,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): InputValueNode {
  return {
    name: field.name,
    description: field.description ?? null,
    type: toTypeRef(field.type, pathFor, rootDirectoryByTypeName),
    defaultValue: printDefaultValue(field),
    deprecation: deprecationOf(field.deprecationReason),
    appliedDirectives: [],
  };
}

function fieldNode(
  field: GraphQLField<unknown, unknown>,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): FieldNode {
  return {
    name: field.name,
    description: field.description ?? null,
    type: toTypeRef(field.type, pathFor, rootDirectoryByTypeName),
    args: byName(field.args).map((arg) => argNode(arg, pathFor, rootDirectoryByTypeName)),
    deprecation: deprecationOf(field.deprecationReason),
    appliedDirectives: [],
  };
}

export function project(loaded: LoadedSchema): SchemaIr {
  const { schema } = loaded;

  const rootDirectoryByTypeName = new Map<string, string>();
  const roots: {
    readonly kind: OperationNode["kind"];
    readonly type: GraphQLObjectType | null | undefined;
  }[] = [
    { kind: "query", type: schema.getQueryType() },
    { kind: "mutation", type: schema.getMutationType() },
    { kind: "subscription", type: schema.getSubscriptionType() },
  ];
  for (const root of roots) {
    if (root.type) {
      rootDirectoryByTypeName.set(root.type.name, DIRECTORY_BY_KIND[root.kind]);
    }
  }

  const namedTypes = Object.values(schema.getTypeMap()).filter(
    (type) => !type.name.startsWith("__") && !rootDirectoryByTypeName.has(type.name),
  );

  const elements: ElementName[] = [];
  for (const type of namedTypes) {
    const kind = kindOfNamedType(type);
    if (kind !== null) {
      elements.push({ kind, name: type.name });
    }
  }
  for (const root of roots) {
    if (!root.type) {
      continue;
    }
    for (const field of Object.values(root.type.getFields())) {
      elements.push({ kind: root.kind, name: field.name });
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

  const implementorsByInterface = new Map<string, ElementName[]>();
  for (const type of namedTypes) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }
    const kind: ConceptKind = isObjectType(type) ? "object" : "interface";
    for (const implemented of type.getInterfaces()) {
      const bucket = implementorsByInterface.get(implemented.name);
      const entry: ElementName = { kind, name: type.name };
      if (bucket === undefined) {
        implementorsByInterface.set(implemented.name, [entry]);
      } else {
        bucket.push(entry);
      }
    }
  }

  const concepts: ConceptNode[] = [];

  for (const type of namedTypes) {
    if (isScalarType(type)) {
      concepts.push(scalarConcept(type, pathFor({ kind: "scalar", name: type.name })));
    } else if (isEnumType(type)) {
      concepts.push(enumConcept(type, pathFor({ kind: "enum", name: type.name })));
    } else if (isObjectType(type)) {
      concepts.push(
        objectConcept(
          type,
          pathFor({ kind: "object", name: type.name }),
          pathFor,
          rootDirectoryByTypeName,
        ),
      );
    } else if (isInterfaceType(type)) {
      concepts.push(
        interfaceConcept(
          type,
          pathFor({ kind: "interface", name: type.name }),
          pathFor,
          implementorsByInterface.get(type.name) ?? [],
          rootDirectoryByTypeName,
        ),
      );
    } else if (isUnionType(type)) {
      concepts.push(
        unionConcept(
          type,
          pathFor({ kind: "union", name: type.name }),
          pathFor,
          rootDirectoryByTypeName,
        ),
      );
    } else if (isInputObjectType(type)) {
      concepts.push(
        inputConcept(
          type,
          pathFor({ kind: "input", name: type.name }),
          pathFor,
          rootDirectoryByTypeName,
        ),
      );
    }
  }

  for (const root of roots) {
    if (!root.type) {
      continue;
    }
    for (const field of Object.values(root.type.getFields())) {
      concepts.push({
        kind: root.kind,
        name: field.name,
        path: pathFor({ kind: root.kind, name: field.name }),
        description: field.description ?? null,
        appliedDirectives: [],
        args: byName(field.args).map((arg) => argNode(arg, pathFor, rootDirectoryByTypeName)),
        type: toTypeRef(field.type, pathFor, rootDirectoryByTypeName),
        deprecation: deprecationOf(field.deprecationReason),
      });
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

function objectConcept(
  type: GraphQLObjectType,
  path: string,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): ObjectTypeNode {
  return {
    kind: "object",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    fields: byName(Object.values(type.getFields())).map((field) =>
      fieldNode(field, pathFor, rootDirectoryByTypeName),
    ),
    interfaces: byName(type.getInterfaces()).map((each) =>
      toTypeRef(each, pathFor, rootDirectoryByTypeName),
    ),
  };
}

function interfaceConcept(
  type: GraphQLInterfaceType,
  path: string,
  pathFor: (element: ElementName) => string,
  implementors: readonly ElementName[],
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): InterfaceTypeNode {
  return {
    kind: "interface",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    fields: byName(Object.values(type.getFields())).map((field) =>
      fieldNode(field, pathFor, rootDirectoryByTypeName),
    ),
    interfaces: byName(type.getInterfaces()).map((each) =>
      toTypeRef(each, pathFor, rootDirectoryByTypeName),
    ),
    implementedBy: byName([...implementors]).map((implementor) => ({
      wrappers: [],
      name: implementor.name,
      path: pathFor(implementor),
    })),
  };
}

function unionConcept(
  type: GraphQLUnionType,
  path: string,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): UnionTypeNode {
  return {
    kind: "union",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    members: byName(type.getTypes()).map((member) =>
      toTypeRef(member, pathFor, rootDirectoryByTypeName),
    ),
  };
}

function inputConcept(
  type: GraphQLInputObjectType,
  path: string,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): InputObjectTypeNode {
  return {
    kind: "input",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    fields: byName(Object.values(type.getFields())).map((field) =>
      inputFieldNode(field, pathFor, rootDirectoryByTypeName),
    ),
  };
}
