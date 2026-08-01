import { describe, expect, it } from "vitest";
import type {
  ConceptNode,
  DirectiveDefinitionNode,
  EnumTypeNode,
  InputObjectTypeNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  OperationNode,
  ScalarTypeNode,
  TypeRef,
  UnionTypeNode,
} from "../../model/ir.js";
import {
  renderBody,
  renderDirectiveBody,
  renderEnumBody,
  renderInputBody,
  renderInterfaceBody,
  renderObjectBody,
  renderOperationBody,
  renderScalarBody,
  renderUnionBody,
} from "./body.js";

const scalarRef = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/scalars/${name}.md`,
  wrappers,
});

const country: ObjectTypeNode = {
  kind: "object",
  name: "Country",
  path: "types/objects/Country.md",
  description: "An ISO country.",
  appliedDirectives: [],
  interfaces: [{ name: "Node", path: "types/interfaces/Node.md", wrappers: [] }],
  fields: [
    {
      name: "code",
      description: "The ISO code.",
      type: scalarRef("ID", ["nonNull"]),
      args: [],
      deprecation: null,
      appliedDirectives: [],
    },
    {
      name: "phone",
      description: null,
      type: scalarRef("String"),
      args: [
        {
          name: "code",
          description: "Calling code.",
          type: scalarRef("String", ["nonNull"]),
          defaultValue: '"+1"',
          deprecation: null,
          appliedDirectives: [],
        },
      ],
      deprecation: { reason: "use dialCode" },
      appliedDirectives: [],
    },
  ],
};

describe("renderObjectBody", () => {
  it("renders heading, description, implements, and fields with linked types", () => {
    const out = renderObjectBody(country);
    expect(out).toContain("# Country");
    expect(out).toContain("An ISO country.");
    expect(out).toContain("Implements [`Node`](../interfaces/Node.md).");
    expect(out).toContain("| `code` | [`ID!`](../scalars/ID.md) | The ISO code. |");
    expect(out).toContain(
      "| `phone` | [`String`](../scalars/String.md) | (deprecated: use dialCode) |",
    );
    expect(out).toContain("## Arguments");
    expect(out).toContain("### `phone`");
    expect(out).toContain(
      '| `code` | [`String!`](../scalars/String.md) | `"+1"` | Calling code. |',
    );
  });

  it("renders an applied directive's arguments inline", () => {
    const node: ObjectTypeNode = {
      ...country,
      appliedDirectives: [
        {
          name: "cacheControl",
          path: "directives/cacheControl.md",
          args: [{ name: "maxAge", value: "60" }],
        },
      ],
    };
    const out = renderObjectBody(node);
    expect(out).toContain(
      "Directives: [`@cacheControl`](../../directives/cacheControl.md)(maxAge: 60).",
    );
  });

  it("renders a field's applied directives in its description cell", () => {
    const node: ObjectTypeNode = {
      ...country,
      fields: [
        {
          name: "email",
          description: null,
          type: scalarRef("EmailAddress", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [
            {
              name: "auth",
              path: "directives/auth.md",
              args: [{ name: "requires", value: "STAFF" }],
            },
          ],
        },
      ],
    };

    expect(renderObjectBody(node)).toContain(
      "| `email` | [`EmailAddress!`](../scalars/EmailAddress.md) | [`@auth`](../../directives/auth.md)(requires: STAFF) |",
    );
  });

  it("orders a field cell as description, then deprecation, then directives", () => {
    const node: ObjectTypeNode = {
      ...country,
      fields: [
        {
          name: "defaultAddress",
          description: "Where orders are shipped.",
          type: scalarRef("String"),
          args: [],
          deprecation: { reason: "use shippingAddress" },
          appliedDirectives: [
            {
              name: "auth",
              path: "directives/auth.md",
              args: [{ name: "requires", value: "CUSTOMER" }],
            },
          ],
        },
      ],
    };

    expect(renderObjectBody(node)).toContain(
      "| `defaultAddress` | [`String`](../scalars/String.md) | Where orders are shipped. (deprecated: use shippingAddress) [`@auth`](../../directives/auth.md)(requires: CUSTOMER) |",
    );
  });

  it("omits the Fields section when a type has no fields", () => {
    const node: ObjectTypeNode = { ...country, fields: [] };
    const out = renderObjectBody(node);
    expect(out).not.toContain("# Schema");
  });
});

describe("renderInterfaceBody", () => {
  it("adds an implemented-by line", () => {
    const node: InterfaceTypeNode = {
      kind: "interface",
      name: "Node",
      path: "types/interfaces/Node.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      implementedBy: [{ name: "Country", path: "types/objects/Country.md", wrappers: [] }],
      fields: [
        {
          name: "id",
          description: null,
          type: scalarRef("ID", ["nonNull"]),
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    };
    const out = renderInterfaceBody(node);
    expect(out).toContain("# Node");
    expect(out).toContain("Implemented by [`Country`](../objects/Country.md).");
    expect(out).toContain("| `id` | [`ID!`](../scalars/ID.md) |  |");
  });
});

describe("renderUnionBody", () => {
  it("lists member types as links", () => {
    const node: UnionTypeNode = {
      kind: "union",
      name: "SearchResult",
      path: "types/unions/SearchResult.md",
      description: null,
      appliedDirectives: [],
      members: [
        { name: "Country", path: "types/objects/Country.md", wrappers: [] },
        { name: "Continent", path: "types/objects/Continent.md", wrappers: [] },
      ],
    };
    const out = renderUnionBody(node);
    expect(out).toContain("# Schema");
    expect(out).toContain("| Member |");
    expect(out).toContain("| [`Country`](../objects/Country.md) |");
    expect(out).toContain("| [`Continent`](../objects/Continent.md) |");
  });
});

describe("renderEnumBody", () => {
  it("lists values with descriptions and deprecation", () => {
    const node: EnumTypeNode = {
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: "Access level.",
      appliedDirectives: [],
      values: [
        { name: "ADMIN", description: null, deprecation: null, appliedDirectives: [] },
        { name: "OWNER", description: "Full access.", deprecation: null, appliedDirectives: [] },
        {
          name: "VIEWER",
          description: null,
          deprecation: { reason: "use READER" },
          appliedDirectives: [],
        },
      ],
    };
    const out = renderEnumBody(node);
    expect(out).toContain("# Schema");
    expect(out).toContain("| Value | Description |");
    expect(out).toContain("| `ADMIN` |  |");
    expect(out).toContain("| `OWNER` | Full access. |");
    expect(out).toContain("| `VIEWER` | (deprecated: use READER) |");
  });
});

describe("renderInputBody", () => {
  it("lists input fields with defaults", () => {
    const node: InputObjectTypeNode = {
      kind: "input",
      name: "LanguageFilterInput",
      path: "types/inputs/LanguageFilterInput.md",
      description: null,
      appliedDirectives: [],
      fields: [
        {
          name: "limit",
          description: null,
          type: { name: "Int", path: "types/scalars/Int.md", wrappers: [] },
          defaultValue: "10",
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    };
    const out = renderInputBody(node);
    expect(out).toContain("# Schema");
    expect(out).toContain("| Field | Type | Default | Description |");
    expect(out).toContain("| `limit` | [`Int`](../scalars/Int.md) | `10` |  |");
  });
});

describe("renderScalarBody", () => {
  it("notes a custom scalar and its specifiedBy url", () => {
    const node: ScalarTypeNode = {
      kind: "scalar",
      name: "DateTime",
      path: "types/scalars/DateTime.md",
      description: "An ISO-8601 timestamp.",
      appliedDirectives: [],
      specifiedByUrl: "https://scalars.test/datetime",
      isBuiltIn: false,
    };
    const out = renderScalarBody(node);
    expect(out).toContain("# DateTime");
    expect(out).toContain("An ISO-8601 timestamp.");
    expect(out).toContain("Custom scalar. Specified by <https://scalars.test/datetime>.");
  });

  it("notes a built-in scalar", () => {
    const node: ScalarTypeNode = {
      kind: "scalar",
      name: "String",
      path: "types/scalars/String.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: null,
      isBuiltIn: true,
    };
    expect(renderScalarBody(node)).toContain("Built-in GraphQL scalar.");
  });
});

const languages: OperationNode = {
  kind: "query",
  name: "languages",
  rootTypeName: "Query",
  path: "queries/languages.md",
  description: "Returns every language.",
  appliedDirectives: [],
  args: [
    {
      name: "filter",
      description: "Narrows results.",
      type: {
        name: "LanguageFilterInput",
        path: "types/inputs/LanguageFilterInput.md",
        wrappers: [],
      },
      defaultValue: null,
      deprecation: null,
      appliedDirectives: [],
    },
  ],
  type: {
    name: "Language",
    path: "types/objects/Language.md",
    wrappers: ["nonNull", "list", "nonNull"],
  },
  deprecation: null,
};

describe("renderOperationBody", () => {
  it("renders returns and arguments with links resolving across directories", () => {
    const out = renderOperationBody(languages);
    expect(out).toContain("# languages");
    expect(out).toContain("**Returns** [`[Language!]!`](../types/objects/Language.md)");
    expect(out).toContain("# Schema");
    expect(out).toContain("| Argument | Type | Default | Description |");
    expect(out).toContain(
      "| `filter` | [`LanguageFilterInput`](../types/inputs/LanguageFilterInput.md) |  | Narrows results. |",
    );
  });

  it("surfaces operation-level deprecation", () => {
    const out = renderOperationBody({ ...languages, deprecation: { reason: "use list" } });
    expect(out).toContain("**Deprecated: use list**");
  });
});

describe("renderDirectiveBody", () => {
  it("renders an @-prefixed heading, locations, and arguments", () => {
    const node: DirectiveDefinitionNode = {
      kind: "directive",
      name: "deprecated",
      path: "directives/deprecated.md",
      description: "Marks an element as no longer supported.",
      appliedDirectives: [],
      locations: ["ARGUMENT_DEFINITION", "ENUM_VALUE", "FIELD_DEFINITION"],
      isRepeatable: false,
      isBuiltIn: true,
      args: [
        {
          name: "reason",
          description: "Why.",
          type: { name: "String", path: "types/scalars/String.md", wrappers: [] },
          defaultValue: '"No longer supported"',
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    };
    const out = renderDirectiveBody(node);
    expect(out).toContain("# @deprecated");
    expect(out).toContain("Locations: `ARGUMENT_DEFINITION`, `ENUM_VALUE`, `FIELD_DEFINITION`.");
    expect(out).toContain("# Schema");
    expect(out).toContain(
      '| `reason` | [`String`](../types/scalars/String.md) | `"No longer supported"` | Why. |',
    );
  });
});

describe("renderBody dispatcher", () => {
  it("dispatches each kind", () => {
    const concept: ConceptNode = languages;
    expect(renderBody(concept)).toContain("# languages");
  });

  it("dispatches every other concept kind to its renderer", () => {
    const union: UnionTypeNode = {
      kind: "union",
      name: "SearchResult",
      path: "types/unions/SearchResult.md",
      description: null,
      appliedDirectives: [],
      members: [],
    };
    const enumNode: EnumTypeNode = {
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [],
      values: [],
    };
    const input: InputObjectTypeNode = {
      kind: "input",
      name: "LanguageFilterInput",
      path: "types/inputs/LanguageFilterInput.md",
      description: null,
      appliedDirectives: [],
      fields: [],
    };
    const scalar: ScalarTypeNode = {
      kind: "scalar",
      name: "String",
      path: "types/scalars/String.md",
      description: null,
      appliedDirectives: [],
      specifiedByUrl: null,
      isBuiltIn: true,
    };
    const mutation: OperationNode = { ...languages, kind: "mutation", name: "addLanguage" };
    const subscription: OperationNode = {
      ...languages,
      kind: "subscription",
      name: "languageAdded",
    };
    const directive: DirectiveDefinitionNode = {
      kind: "directive",
      name: "deprecated",
      path: "directives/deprecated.md",
      description: null,
      appliedDirectives: [],
      locations: [],
      isRepeatable: false,
      isBuiltIn: true,
      args: [],
    };

    expect(renderBody(country)).toContain("# Country");
    expect(renderBody(union)).toContain("# SearchResult");
    expect(renderBody(enumNode)).toContain("# Role");
    expect(renderBody(input)).toContain("# LanguageFilterInput");
    expect(renderBody(scalar)).toContain("# String");
    expect(renderBody(mutation)).toContain("# addLanguage");
    expect(renderBody(subscription)).toContain("# languageAdded");
    expect(renderBody(directive)).toContain("# @deprecated");
  });
});

describe("# Schema sections", () => {
  it("renders object fields as a table under a top-level # Schema", () => {
    const body = renderObjectBody({
      kind: "object",
      name: "Country",
      path: "types/objects/Country.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [
        {
          name: "code",
          description: "ISO 3166-1 alpha-2 code.",
          type: { wrappers: ["nonNull"], name: "ID", path: "types/scalars/ID.md" },
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(body).toContain("\n# Schema\n");
    expect(body).toContain("| Field | Type | Description |");
    expect(body).toContain("| --- | --- | --- |");
    expect(body).toContain("| `code` | [`ID!`](../scalars/ID.md) | ISO 3166-1 alpha-2 code. |");
  });

  it("keeps a multi-paragraph field description on one row", () => {
    const body = renderObjectBody({
      kind: "object",
      name: "Product",
      path: "types/objects/Product.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [
        {
          name: "description",
          description: "The blurb.\n\nMay contain Markdown.",
          type: { wrappers: [], name: "String", path: "types/scalars/String.md" },
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
        {
          name: "sku",
          description: null,
          type: { wrappers: [], name: "String", path: "types/scalars/String.md" },
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(body).toContain(
      "| `description` | [`String`](../scalars/String.md) | The blurb. May contain Markdown. |",
    );
    // The second field must still be in the same table, not a new one.
    expect(body.match(/\| Field \| Type \| Description \|/g)).toHaveLength(1);
    expect(body).toContain("| `sku` |");
  });

  it("puts field arguments in their own subsection below the table", () => {
    const body = renderObjectBody({
      kind: "object",
      name: "Query",
      path: "types/objects/Thing.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [
        {
          name: "languages",
          description: null,
          type: { wrappers: [], name: "Language", path: "types/objects/Language.md" },
          args: [
            {
              name: "limit",
              description: "How many.",
              type: { wrappers: [], name: "Int", path: "types/scalars/Int.md" },
              defaultValue: "10",
              deprecation: null,
              appliedDirectives: [],
            },
          ],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(body).toContain("## Arguments");
    expect(body).toContain("### `languages`");
    expect(body).toContain("| Argument | Type | Default | Description |");
    expect(body).toContain("| `limit` | [`Int`](../scalars/Int.md) | `10` | How many. |");
  });

  it("omits the Arguments subsection when no field takes arguments", () => {
    const body = renderObjectBody({
      kind: "object",
      name: "Country",
      path: "types/objects/Country.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [
        {
          name: "code",
          description: null,
          type: { wrappers: [], name: "ID", path: "types/scalars/ID.md" },
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(body).not.toContain("## Arguments");
  });

  it("renders enum values as a table", () => {
    const body = renderEnumBody({
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [],
      values: [
        { name: "ADMIN", description: "Full access.", deprecation: null, appliedDirectives: [] },
      ],
    });

    expect(body).toContain("# Schema");
    expect(body).toContain("| Value | Description |");
    expect(body).toContain("| `ADMIN` | Full access. |");
  });

  it("renders union members as a table", () => {
    const body = renderUnionBody({
      kind: "union",
      name: "Result",
      path: "types/unions/Result.md",
      description: null,
      appliedDirectives: [],
      members: [{ wrappers: [], name: "Country", path: "types/objects/Country.md" }],
    });

    expect(body).toContain("| Member |");
    expect(body).toContain("| [`Country`](../objects/Country.md) |");
  });

  it("renders operation arguments as a table under # Schema", () => {
    const body = renderOperationBody({
      kind: "query",
      name: "countries",
      rootTypeName: "Query",
      path: "queries/countries.md",
      description: null,
      appliedDirectives: [],
      deprecation: null,
      type: { wrappers: [], name: "Country", path: "types/objects/Country.md" },
      args: [
        {
          name: "filter",
          description: "Narrow the list.",
          type: { wrappers: [], name: "Filter", path: "types/inputs/Filter.md" },
          defaultValue: null,
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(body).toContain("# Schema");
    expect(body).toContain("| Argument | Type | Default | Description |");
    expect(body).toContain(
      "| `filter` | [`Filter`](../types/inputs/Filter.md) |  | Narrow the list. |",
    );
  });

  it("surfaces deprecation in the description cell", () => {
    const body = renderEnumBody({
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [],
      values: [
        {
          name: "GUEST",
          description: "Anonymous.",
          deprecation: { reason: "Use ANON." },
          appliedDirectives: [],
        },
      ],
    });

    expect(body).toContain("| `GUEST` | Anonymous. (deprecated: Use ANON.) |");
  });

  it("escapes a pipe in a description so the row survives", () => {
    const body = renderEnumBody({
      kind: "enum",
      name: "Sep",
      path: "types/enums/Sep.md",
      description: null,
      appliedDirectives: [],
      values: [
        { name: "PIPE", description: "A | character.", deprecation: null, appliedDirectives: [] },
      ],
    });

    expect(body).toContain("| `PIPE` | A \\| character. |");
  });

  it("keeps the concept-level docstring verbatim, paragraph breaks and all", () => {
    const body = renderObjectBody({
      kind: "object",
      name: "Product",
      path: "types/objects/Product.md",
      description: "A product.\n\nMay contain Markdown.",
      appliedDirectives: [],
      interfaces: [],
      fields: [],
    });

    expect(body).toContain("A product.\n\nMay contain Markdown.");
  });
});
