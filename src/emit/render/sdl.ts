import type {
  AppliedDirective,
  ConceptNode,
  Deprecation,
  DirectiveDefinitionNode,
  EnumTypeNode,
  FieldNode,
  InputObjectTypeNode,
  InputValueNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  TypeRef,
  UnionTypeNode,
} from "../../model/ir.js";
import { decoratedType } from "./links.js";

/**
 * A description as a GraphQL string. Single-quoted when it fits on one line and
 * needs no escaping; a block string otherwise, with its own delimiter escaped
 * per the GraphQL grammar. Content always sits on its own lines, so a trailing
 * quote in the text can never run into the closing delimiter.
 *
 * A single rule rather than a prettiness heuristic: the same description must
 * render identically on every run (GOAL-8.1).
 */
export function sdlString(text: string): string {
  if (!text.includes("\n") && !text.includes('"') && !text.includes("\\")) {
    return `"${text}"`;
  }
  return `"""\n${text.replace(/"""/g, '\\"""')}\n"""`;
}

/**
 * A description as indented SDL lines. Block strings have their common indent
 * stripped by GraphQL itself, so indenting every line uniformly changes how the
 * block reads without changing what it says.
 */
export function docstringLines(description: string | null, indent: string): string[] {
  if (description === null) {
    return [];
  }
  return sdlString(description)
    .split("\n")
    .map((line) => `${indent}${line}`);
}

/**
 * Applied directives as a suffix, leading space included so callers concatenate
 * rather than branch. Argument values are already SDL literals in the IR.
 * `@deprecated` and `@specifiedBy` are never here — `project.ts` models them as
 * fields, so they are printed from those fields instead and cannot double up.
 */
export function appliedSdl(applied: readonly AppliedDirective[]): string {
  return applied
    .map((directive) => {
      const args =
        directive.args.length === 0
          ? ""
          : `(${directive.args.map((arg) => `${arg.name}: ${arg.value}`).join(", ")})`;
      return ` @${directive.name}${args}`;
    })
    .join("");
}

/** Deprecation as the directive GraphQL defines for it. */
export function deprecatedSdl(deprecation: Deprecation | null): string {
  if (deprecation === null) {
    return "";
  }
  return deprecation.reason === null
    ? " @deprecated"
    : ` @deprecated(reason: ${sdlString(deprecation.reason)})`;
}

function argumentText(arg: InputValueNode): string {
  const type = decoratedType(arg.type);
  const base =
    arg.defaultValue === null
      ? `${arg.name}: ${type}`
      : `${arg.name}: ${type} = ${arg.defaultValue}`;
  return `${base}${appliedSdl(arg.appliedDirectives)}${deprecatedSdl(arg.deprecation)}`;
}

/**
 * The one-line argument list. Empty parentheses are not SDL, so an element with
 * no arguments renders as a bare `name: Type`. Descriptions are dropped: this is
 * the form index rows use (issue #21), and a row must stay one line.
 */
export function inlineArgumentList(args: readonly InputValueNode[]): string {
  if (args.length === 0) {
    return "";
  }
  return `(${args.map(argumentText).join(", ")})`;
}

/**
 * The argument list as it appears inside a block: inline when nothing is
 * described, one argument per line when anything is. Delegating the inline case
 * keeps a single spelling of it shared with `signature.ts`.
 */
export function argumentLines(args: readonly InputValueNode[], indent: string): string[] {
  if (args.length === 0) {
    return [""];
  }
  if (args.every((arg) => arg.description === null)) {
    return [inlineArgumentList(args)];
  }
  const inner = `${indent}  `;
  return [
    "(",
    ...args.flatMap((arg) => [
      ...docstringLines(arg.description, inner),
      `${inner}${argumentText(arg)}`,
    ]),
    `${indent})`,
  ];
}

/** One field definition: its docstring, then its signature. */
export function fieldLines(field: FieldNode, indent: string): string[] {
  const args = argumentLines(field.args, indent);
  const head = args.slice(0, -1);
  const tail = args[args.length - 1] ?? "";
  const suffix = `: ${decoratedType(field.type)}${appliedSdl(field.appliedDirectives)}${deprecatedSdl(field.deprecation)}`;

  if (head.length === 0) {
    return [...docstringLines(field.description, indent), `${indent}${field.name}${tail}${suffix}`];
  }
  const [open, ...middle] = head;
  return [
    ...docstringLines(field.description, indent),
    `${indent}${field.name}${open}`,
    ...middle,
    `${tail}${suffix}`,
  ];
}

/** One input-object field or one enum-adjacent input value, as a definition line. */
export function inputValueLines(value: InputValueNode, indent: string): string[] {
  return [...docstringLines(value.description, indent), `${indent}${argumentText(value)}`];
}

const INDENT = "  ";

function implementsClause(interfaces: readonly TypeRef[]): string {
  return interfaces.length === 0
    ? ""
    : ` implements ${interfaces.map((ref) => ref.name).join(" & ")}`;
}

/**
 * A definition with members. GraphQL has no empty braces, so a member-less type
 * is its header alone — which is valid SDL and says exactly as much.
 */
function withBody(header: string, members: readonly string[]): string[] {
  return members.length === 0 ? [header] : [`${header} {`, ...members, "}"];
}

function objectBlock(node: ObjectTypeNode | InterfaceTypeNode): string[] {
  const keyword = node.kind === "object" ? "type" : "interface";
  const header = `${keyword} ${node.name}${implementsClause(node.interfaces)}${appliedSdl(node.appliedDirectives)}`;
  return withBody(
    header,
    node.fields.flatMap((field) => fieldLines(field, INDENT)),
  );
}

function inputBlock(node: InputObjectTypeNode): string[] {
  return withBody(
    `input ${node.name}${appliedSdl(node.appliedDirectives)}`,
    node.fields.flatMap((value) => inputValueLines(value, INDENT)),
  );
}

function enumBlock(node: EnumTypeNode): string[] {
  return withBody(
    `enum ${node.name}${appliedSdl(node.appliedDirectives)}`,
    node.values.flatMap((value) => [
      ...docstringLines(value.description, INDENT),
      `${INDENT}${value.name}${appliedSdl(value.appliedDirectives)}${deprecatedSdl(value.deprecation)}`,
    ]),
  );
}

function unionBlock(node: UnionTypeNode): string[] {
  const header = `union ${node.name}${appliedSdl(node.appliedDirectives)}`;
  return node.members.length === 0
    ? [header]
    : [`${header} = ${node.members.map((ref) => ref.name).join(" | ")}`];
}

/**
 * `@specifiedBy` is printed from `specifiedByUrl` rather than from
 * `appliedDirectives`, where `project.ts` deliberately does not put it.
 */
function scalarBlock(node: ScalarTypeNode): string[] {
  const specifiedBy =
    node.specifiedByUrl === null ? "" : ` @specifiedBy(url: ${sdlString(node.specifiedByUrl)})`;
  return [`scalar ${node.name}${appliedSdl(node.appliedDirectives)}${specifiedBy}`];
}

/**
 * An operation is one field of a root type, so it prints as a field definition —
 * a valid SDL fragment rather than a standalone document. The root type name is
 * not lost with it: the concept's `resource` anchor carries it.
 */
function operationBlock(node: OperationNode): string[] {
  return fieldLines(
    {
      name: node.name,
      description: null,
      type: node.type,
      args: node.args,
      deprecation: node.deprecation,
      appliedDirectives: node.appliedDirectives,
    },
    "",
  );
}

/** Locations are already sorted by `project.ts`; this prints them as the IR holds them. */
function directiveBlock(node: DirectiveDefinitionNode): string[] {
  const args = argumentLines(node.args, "");
  const repeatable = node.isRepeatable ? " repeatable" : "";
  const on = ` on ${node.locations.join(" | ")}`;
  const head = args.slice(0, -1);
  const tail = args[args.length - 1] ?? "";

  if (head.length === 0) {
    return [`directive @${node.name}${tail}${repeatable}${on}`];
  }
  const [open, ...middle] = head;
  return [`directive @${node.name}${open}`, ...middle, `${tail}${repeatable}${on}`];
}

/** The lines inside a concept file's fenced `graphql` block. */
export function sdlBlock(concept: ConceptNode): readonly string[] {
  switch (concept.kind) {
    case "object":
    case "interface":
      return objectBlock(concept);
    case "input":
      return inputBlock(concept);
    case "enum":
      return enumBlock(concept);
    case "union":
      return unionBlock(concept);
    case "scalar":
      return scalarBlock(concept);
    case "query":
    case "mutation":
    case "subscription":
      return operationBlock(concept);
    case "directive":
      return directiveBlock(concept);
  }
}
