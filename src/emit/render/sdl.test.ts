import { describe, expect, it } from "vitest";
import type { FieldNode, InputValueNode, TypeRef } from "../../model/ir.js";
import {
  appliedSdl,
  argumentLines,
  deprecatedSdl,
  docstringLines,
  fieldLines,
  inlineArgumentList,
  sdlString,
} from "./sdl.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

const arg = (over: Partial<InputValueNode> = {}): InputValueNode => ({
  name: "first",
  description: null,
  type: ref("Int"),
  defaultValue: null,
  deprecation: null,
  appliedDirectives: [],
  ...over,
});

const field = (over: Partial<FieldNode> = {}): FieldNode => ({
  name: "products",
  description: null,
  type: ref("Product", ["nonNull", "list", "nonNull"]),
  args: [],
  deprecation: null,
  appliedDirectives: [],
  ...over,
});

describe("sdlString", () => {
  it("uses a single-quoted string for a plain one-liner", () => {
    expect(sdlString("Where orders ship.")).toBe('"Where orders ship."');
  });

  it("uses a block string when the text spans lines", () => {
    expect(sdlString("One.\nTwo.")).toBe('"""\nOne.\nTwo.\n"""');
  });

  it("uses a block string when the text holds a quote", () => {
    expect(sdlString('Say "hi".')).toBe('"""\nSay "hi".\n"""');
  });

  it("uses a block string when the text holds a backslash", () => {
    expect(sdlString("A\\B")).toBe('"""\nA\\B\n"""');
  });

  it("escapes a triple quote inside a block string", () => {
    expect(sdlString('a """ b\nc')).toBe('"""\na \\""" b\nc\n"""');
  });
});

describe("docstringLines", () => {
  it("is empty for a missing description", () => {
    expect(docstringLines(null, "  ")).toEqual([]);
  });

  it("indents every line of a block string", () => {
    expect(docstringLines("One.\nTwo.", "  ")).toEqual(['  """', "  One.", "  Two.", '  """']);
  });
});

describe("appliedSdl", () => {
  it("is empty when nothing is applied", () => {
    expect(appliedSdl([])).toBe("");
  });

  it("prints each directive with its arguments, leading space included", () => {
    expect(
      appliedSdl([
        { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: "STAFF" }] },
        { name: "tag", path: "directives/tag.md", args: [] },
      ]),
    ).toBe(" @auth(requires: STAFF) @tag");
  });
});

describe("deprecatedSdl", () => {
  it("is empty when not deprecated", () => {
    expect(deprecatedSdl(null)).toBe("");
  });

  it("prints a bare @deprecated when there is no reason", () => {
    expect(deprecatedSdl({ reason: null })).toBe(" @deprecated");
  });

  it("prints the reason as an SDL string", () => {
    expect(deprecatedSdl({ reason: "Use email." })).toBe(' @deprecated(reason: "Use email.")');
  });
});

describe("inlineArgumentList", () => {
  it("is empty for no arguments, since SDL has no empty parens", () => {
    expect(inlineArgumentList([])).toBe("");
  });

  it("prints names, types, and defaults on one line", () => {
    expect(inlineArgumentList([arg(), arg({ name: "after", type: ref("String") })])).toBe(
      "(first: Int, after: String)",
    );
  });

  it("prints a default value", () => {
    expect(inlineArgumentList([arg({ defaultValue: "20" })])).toBe("(first: Int = 20)");
  });
});

describe("argumentLines", () => {
  it("stays inline when no argument is described", () => {
    expect(argumentLines([arg({ defaultValue: "20" })], "  ")).toEqual(["(first: Int = 20)"]);
  });

  it("breaks across lines when any argument is described", () => {
    expect(
      argumentLines([arg({ description: "How many." }), arg({ name: "after" })], "  "),
    ).toEqual(["(", '    "How many."', "    first: Int", "    after: Int", "  )"]);
  });
});

describe("fieldLines", () => {
  it("prints a bare field", () => {
    expect(fieldLines(field(), "  ")).toEqual(["  products: [Product!]!"]);
  });

  it("prints description, arguments, directives, and deprecation together", () => {
    expect(
      fieldLines(
        field({
          description: "Lists products.",
          args: [arg({ defaultValue: "20" })],
          deprecation: { reason: "Use search." },
          appliedDirectives: [{ name: "auth", path: "directives/auth.md", args: [] }],
        }),
        "  ",
      ),
    ).toEqual([
      '  "Lists products."',
      '  products(first: Int = 20): [Product!]! @auth @deprecated(reason: "Use search.")',
    ]);
  });
});
