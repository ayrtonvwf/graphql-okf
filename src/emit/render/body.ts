import type {
  AppliedDirective,
  Deprecation,
  EnumTypeNode,
  FieldNode,
  InputObjectTypeNode,
  InputValueNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  ScalarTypeNode,
  TypeRef,
  UnionTypeNode,
} from "../../model/ir.js";
import { relLink, typeLink } from "./links.js";

function deprecatedSuffix(deprecation: Deprecation | null): string {
  if (deprecation === null) {
    return "";
  }
  return deprecation.reason === null ? " (deprecated)" : ` (deprecated: ${deprecation.reason})`;
}

function appliedInline(applied: readonly AppliedDirective[], fromPath: string): string {
  return applied
    .map((directive) => {
      const args =
        directive.args.length === 0
          ? ""
          : `(${directive.args.map((arg) => `${arg.name}: ${arg.value}`).join(", ")})`;
      return `[\`@${directive.name}\`](${relLink(fromPath, directive.path)})${args}`;
    })
    .join(", ");
}

function descriptionLine(text: string | null): string[] {
  return text === null ? [] : ["", text];
}

function directivesLine(applied: readonly AppliedDirective[], fromPath: string): string[] {
  return applied.length === 0 ? [] : ["", `Directives: ${appliedInline(applied, fromPath)}.`];
}

function defaultSuffix(defaultValue: string | null): string {
  return defaultValue === null ? "" : ` = \`${defaultValue}\``;
}

function descSuffix(description: string | null): string {
  return description === null ? "" : ` — ${description}`;
}

// A field bullet, plus one sub-bullet per argument.
function renderField(field: FieldNode, fromPath: string): string[] {
  const head = `- **\`${field.name}\`** — ${typeLink(fromPath, field.type)}${descSuffix(
    field.description,
  )}${deprecatedSuffix(field.deprecation)}`;
  const args = field.args.map(
    (arg) =>
      `  - Argument **\`${arg.name}\`**: ${typeLink(fromPath, arg.type)}${defaultSuffix(
        arg.defaultValue,
      )}${descSuffix(arg.description)}${deprecatedSuffix(arg.deprecation)}`,
  );
  return [head, ...args];
}

// A bullet for an input-object field or a standalone argument list entry.
function bulletForInputValue(value: InputValueNode, fromPath: string): string {
  return `- **\`${value.name}\`**: ${typeLink(fromPath, value.type)}${defaultSuffix(
    value.defaultValue,
  )}${descSuffix(value.description)}${deprecatedSuffix(value.deprecation)}`;
}

function implementsLine(interfaces: readonly TypeRef[], fromPath: string): string[] {
  if (interfaces.length === 0) {
    return [];
  }
  const links = interfaces.map((ref) => typeLink(fromPath, ref)).join(", ");
  return ["", `Implements ${links}.`];
}

function fieldsSection(fields: readonly FieldNode[], fromPath: string): string[] {
  if (fields.length === 0) {
    return [];
  }
  return ["", "## Fields", "", ...fields.flatMap((field) => renderField(field, fromPath))];
}

export function renderObjectBody(node: ObjectTypeNode): string {
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives, node.path),
    ...implementsLine(node.interfaces, node.path),
    ...fieldsSection(node.fields, node.path),
    "",
  ].join("\n");
}

export function renderInterfaceBody(node: InterfaceTypeNode): string {
  const implementedBy =
    node.implementedBy.length === 0
      ? []
      : [
          "",
          `Implemented by ${node.implementedBy.map((ref) => typeLink(node.path, ref)).join(", ")}.`,
        ];
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives, node.path),
    ...implementsLine(node.interfaces, node.path),
    ...implementedBy,
    ...fieldsSection(node.fields, node.path),
    "",
  ].join("\n");
}

export function renderUnionBody(node: UnionTypeNode): string {
  const members =
    node.members.length === 0
      ? []
      : ["", "## Members", "", ...node.members.map((ref) => `- ${typeLink(node.path, ref)}`)];
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives, node.path),
    ...members,
    "",
  ].join("\n");
}

export function renderEnumBody(node: EnumTypeNode): string {
  const values =
    node.values.length === 0
      ? []
      : [
          "",
          "## Values",
          "",
          ...node.values.map(
            (value) =>
              `- **\`${value.name}\`**${descSuffix(value.description)}${deprecatedSuffix(
                value.deprecation,
              )}`,
          ),
        ];
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives, node.path),
    ...values,
    "",
  ].join("\n");
}

export function renderInputBody(node: InputObjectTypeNode): string {
  const fields =
    node.fields.length === 0
      ? []
      : ["", "## Fields", "", ...node.fields.map((value) => bulletForInputValue(value, node.path))];
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives, node.path),
    ...fields,
    "",
  ].join("\n");
}

export function renderScalarBody(node: ScalarTypeNode): string {
  const note = node.isBuiltIn
    ? "Built-in GraphQL scalar."
    : node.specifiedByUrl === null
      ? "Custom scalar."
      : `Custom scalar. Specified by <${node.specifiedByUrl}>.`;
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives, node.path),
    "",
    note,
    "",
  ].join("\n");
}

export {
  bulletForInputValue,
  defaultSuffix,
  deprecatedSuffix,
  descriptionLine,
  descSuffix,
  directivesLine,
};
