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
import { bundleLink, typeLink } from "./links.js";
import { cell } from "./text.js";

function deprecatedSuffix(deprecation: Deprecation | null): string {
  if (deprecation === null) {
    return "";
  }
  return deprecation.reason === null
    ? " (deprecated)"
    : ` (deprecated: ${cell(deprecation.reason)})`;
}

function appliedInline(applied: readonly AppliedDirective[], escapeArgs: boolean): string {
  return applied
    .map((directive) => {
      const args =
        directive.args.length === 0
          ? ""
          : `(${directive.args
              .map((arg) => `${arg.name}: ${escapeArgs ? cell(arg.value) : arg.value}`)
              .join(", ")})`;
      const label = `\`@${directive.name}\``;
      const head = directive.path === null ? label : `[${label}](${bundleLink(directive.path)})`;
      return `${head}${args}`;
    })
    .join(", ");
}

function descriptionLine(text: string | null): string[] {
  return text === null ? [] : ["", text];
}

function directivesLine(applied: readonly AppliedDirective[]): string[] {
  return applied.length === 0 ? [] : ["", `Directives: ${appliedInline(applied, false)}.`];
}

function implementsLine(interfaces: readonly TypeRef[]): string[] {
  if (interfaces.length === 0) {
    return [];
  }
  const links = interfaces.map((ref) => typeLink(ref)).join(", ");
  return ["", `Implements ${links}.`];
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ];
}

function descriptionCell(
  description: string | null,
  deprecation: Deprecation | null,
  applied: readonly AppliedDirective[],
): string {
  const parts = [
    description === null ? "" : cell(description),
    deprecatedSuffix(deprecation).trim(),
    appliedInline(applied, true),
  ];
  return parts.filter((part) => part !== "").join(" ");
}

function defaultCell(defaultValue: string | null): string {
  return defaultValue === null ? "" : `\`${defaultValue}\``;
}

/**
 * OKF §4.2 gives `# Schema` conventional meaning for an asset's fields, and the
 * reference tooling only extracts field names from a top-level `# Schema`
 * section. This is a second H1 below the title, matching §4.3's own example.
 */
function schemaSection(lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ["", "# Schema", "", ...lines];
}

function fieldsTable(fields: readonly FieldNode[]): string[] {
  return table(
    ["Field", "Type", "Description"],
    fields.map((field) => [
      `\`${field.name}\``,
      typeLink(field.type),
      descriptionCell(field.description, field.deprecation, field.appliedDirectives),
    ]),
  );
}

function argumentsTable(args: readonly InputValueNode[]): string[] {
  return table(
    ["Argument", "Type", "Default", "Description"],
    args.map((arg) => [
      `\`${arg.name}\``,
      typeLink(arg.type),
      defaultCell(arg.defaultValue),
      descriptionCell(arg.description, arg.deprecation, arg.appliedDirectives),
    ]),
  );
}

/** Field arguments do not fit a flat table, so they get their own subsection. */
function fieldArgumentsSection(fields: readonly FieldNode[]): string[] {
  const withArgs = fields.filter((field) => field.args.length > 0);
  if (withArgs.length === 0) {
    return [];
  }
  return [
    "",
    "## Arguments",
    ...withArgs.flatMap((field) => [
      "",
      `### \`${field.name}\``,
      "",
      ...argumentsTable(field.args),
    ]),
  ];
}

function fieldsSchema(fields: readonly FieldNode[]): string[] {
  if (fields.length === 0) {
    return [];
  }
  return [...schemaSection(fieldsTable(fields)), ...fieldArgumentsSection(fields)];
}

function inputFieldsSchema(fields: readonly InputValueNode[]): string[] {
  if (fields.length === 0) {
    return [];
  }
  return schemaSection(
    table(
      ["Field", "Type", "Default", "Description"],
      fields.map((value) => [
        `\`${value.name}\``,
        typeLink(value.type),
        defaultCell(value.defaultValue),
        descriptionCell(value.description, value.deprecation, value.appliedDirectives),
      ]),
    ),
  );
}

function argumentsSchema(args: readonly InputValueNode[]): string[] {
  return args.length === 0 ? [] : schemaSection(argumentsTable(args));
}

export function renderObjectBody(node: ObjectTypeNode): string {
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives),
    ...implementsLine(node.interfaces),
    ...fieldsSchema(node.fields),
    "",
  ].join("\n");
}

export function renderInterfaceBody(node: InterfaceTypeNode): string {
  const implementedBy =
    node.implementedBy.length === 0
      ? []
      : ["", `Implemented by ${node.implementedBy.map((ref) => typeLink(ref)).join(", ")}.`];
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives),
    ...implementsLine(node.interfaces),
    ...implementedBy,
    ...fieldsSchema(node.fields),
    "",
  ].join("\n");
}

export function renderUnionBody(node: UnionTypeNode): string {
  const members =
    node.members.length === 0
      ? []
      : schemaSection(
          table(
            ["Member"],
            node.members.map((ref) => [typeLink(ref)]),
          ),
        );
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives),
    ...members,
    "",
  ].join("\n");
}

export function renderEnumBody(node: EnumTypeNode): string {
  const values =
    node.values.length === 0
      ? []
      : schemaSection(
          table(
            ["Value", "Description"],
            node.values.map((value) => [
              `\`${value.name}\``,
              descriptionCell(value.description, value.deprecation, value.appliedDirectives),
            ]),
          ),
        );
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives),
    ...values,
    "",
  ].join("\n");
}

export function renderInputBody(node: InputObjectTypeNode): string {
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives),
    ...inputFieldsSchema(node.fields),
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
    ...directivesLine(node.appliedDirectives),
    "",
    note,
    "",
  ].join("\n");
}

function deprecatedBlock(deprecation: Deprecation | null): string[] {
  if (deprecation === null) {
    return [];
  }
  return deprecation.reason === null
    ? ["", "**Deprecated**"]
    : ["", `**Deprecated: ${deprecation.reason}**`];
}

export function renderOperationBody(node: OperationNode): string {
  return [
    `# ${node.name}`,
    ...descriptionLine(node.description),
    ...deprecatedBlock(node.deprecation),
    ...directivesLine(node.appliedDirectives),
    "",
    `**Returns** ${typeLink(node.type)}`,
    ...argumentsSchema(node.args),
    "",
  ].join("\n");
}

export function renderDirectiveBody(node: DirectiveDefinitionNode): string {
  const locations =
    node.locations.length === 0
      ? []
      : ["", `Locations: ${node.locations.map((location) => `\`${location}\``).join(", ")}.`];
  const repeatable = node.isRepeatable ? ["", "Repeatable."] : [];
  return [
    `# @${node.name}`,
    ...descriptionLine(node.description),
    ...directivesLine(node.appliedDirectives),
    ...locations,
    ...repeatable,
    ...argumentsSchema(node.args),
    "",
  ].join("\n");
}

export function renderBody(concept: ConceptNode): string {
  switch (concept.kind) {
    case "object":
      return renderObjectBody(concept);
    case "interface":
      return renderInterfaceBody(concept);
    case "union":
      return renderUnionBody(concept);
    case "enum":
      return renderEnumBody(concept);
    case "input":
      return renderInputBody(concept);
    case "scalar":
      return renderScalarBody(concept);
    case "query":
    case "mutation":
    case "subscription":
      return renderOperationBody(concept);
    case "directive":
      return renderDirectiveBody(concept);
  }
}
