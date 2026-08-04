# Operation signatures in index.md files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry a full GraphQL SDL signature on every operation and directive row of an `index.md`, so an agent learns what an operation takes and returns without opening its concept file.

**Architecture:** A new `src/emit/render/signature.ts` renders an SDL one-liner for an operation or a directive, built on `decoratedType` from `links.ts` so wrapper spelling cannot drift from the concept-file tables. `src/emit/render/directory-index.ts` learns two optional row flags — `code` (wrap the label in a code span) and `deprecated` (prefix the summary with a bold marker). `src/emit/bundle.ts` uses the signature as the row's link label for the three operation kinds and `directive`, adds a per-directory convention note, and moves index ordering off the rendered label onto an explicit sort key.

**Tech Stack:** TypeScript (`strict: true`, ESM), Node 24, Vitest + v8 coverage, Biome, knip, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-04-index-signatures-design.md`](../specs/2026-08-04-index-signatures-design.md) — issue #21.

## Global Constraints

- **Determinism is load-bearing** (`M1/GOAL-8.1`, `M1/NG-6`). No runtime LLM calls, no nondeterministic iteration order, no wall-clock output beyond the spec's ISO-8601 timestamps. Re-running against an unchanged schema must be a byte-identical no-op.
- **The naming scheme is the single source of truth** (`M1/GOAL-4.5`). Never hardcode a directory name that `src/model/naming.ts` already owns; never re-derive a shape `links.ts` already renders.
- **Single public entry point:** everything exported flows through `src/index.ts`.
- **Coverage thresholds are enforced:** lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.
- **TDD:** write the failing test, watch it fail, write the minimal code to pass. Never backfill tests.
- **Verification gate before any PR:** `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, `pnpm run knip`.
- **Row format, verbatim.** Operation row: ``* [`products(filter: ProductFilter, first: Int = 20): [Product!]!`](/queries/products.md) - Lists products, most recently created first.`` Directive row: ``* [`@auth(requires: Role! = CUSTOMER) on FIELD_DEFINITION | OBJECT`](/directives/auth.md) - Restricts a field or type to callers holding at least the given role.``
- **The separator between link and summary stays `" - "`** — the existing OKF §6 bullet form. Do not switch to an em dash.
- **Types inside signatures are never links.** Signatures use `decoratedType`, never `typeLink`.

## File Structure

**Created:**
- `src/emit/render/signature.ts` — SDL one-liners for an operation and for a directive. One responsibility; consumed by `bundle.ts`, not by `body.ts`.
- `src/emit/render/signature.test.ts`

**Modified:**
- `src/emit/render/directory-index.ts` — `IndexEntry` gains optional `code` and `deprecated`; `bullet` renders both.
- `src/emit/render/directory-index.test.ts` — tests for the two new flags.
- `src/emit/bundle.ts` — signature labels for operation/directive kinds, `SIGNATURE_NOTE`, explicit sort keys replacing `sortByLabel`.
- `src/emit/bundle.test.ts` — index-level integration tests.
- `okf/shop-api/`, `okf/countries-api/` — regenerated fixtures.
- `README.md` — one paragraph documenting the convention.

**Untouched by design:** `src/emit/render/body.ts` (concept-file bodies are issue #24's subject), `src/model/` (no IR change is needed — every fact a signature needs is already projected).

---

### Task 1: The signature renderer

**Files:**
- Create: `src/emit/render/signature.ts`
- Test: `src/emit/render/signature.test.ts`

**Interfaces:**
- Consumes: `decoratedType(ref: TypeRef): string` from `src/emit/render/links.ts`; `OperationNode`, `DirectiveDefinitionNode`, `InputValueNode` from `src/model/ir.ts`.
- Produces: `operationSignature(node: OperationNode): string` and `directiveSignature(node: DirectiveDefinitionNode): string`, both consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/emit/render/signature.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DirectiveDefinitionNode, InputValueNode, OperationNode, TypeRef } from "../../model/ir.js";
import { directiveSignature, operationSignature } from "./signature.js";

const ref = (name: string, wrappers: TypeRef["wrappers"] = []): TypeRef => ({
  name,
  path: `types/${name}.md`,
  wrappers,
});

const arg = (
  name: string,
  type: TypeRef,
  defaultValue: string | null = null,
): InputValueNode => ({
  name,
  description: null,
  type,
  defaultValue,
  deprecation: null,
  appliedDirectives: [],
});

const operation = (
  name: string,
  args: readonly InputValueNode[],
  type: TypeRef,
): OperationNode => ({
  kind: "query",
  name,
  path: `queries/${name}.md`,
  description: null,
  appliedDirectives: [],
  rootTypeName: "Query",
  args,
  type,
  deprecation: null,
});

const directive = (
  name: string,
  args: readonly InputValueNode[],
  locations: readonly string[],
  isRepeatable = false,
): DirectiveDefinitionNode => ({
  kind: "directive",
  name,
  path: `directives/${name}.md`,
  description: null,
  appliedDirectives: [],
  locations,
  args,
  isRepeatable,
});

describe("operationSignature", () => {
  it("renders arguments, defaults and the return type", () => {
    const node = operation(
      "products",
      [arg("filter", ref("ProductFilter")), arg("first", ref("Int"), "20")],
      ref("Product", ["nonNull", "list", "nonNull"]),
    );

    expect(operationSignature(node)).toBe(
      "products(filter: ProductFilter, first: Int = 20): [Product!]!",
    );
  });

  it("omits empty parentheses when there are no arguments", () => {
    expect(operationSignature(operation("me", [], ref("Customer")))).toBe("me: Customer");
  });

  it("keeps arguments in declaration order rather than sorting them", () => {
    const node = operation(
      "search",
      [arg("term", ref("String", ["nonNull"])), arg("after", ref("String"))],
      ref("Result"),
    );

    expect(operationSignature(node)).toBe("search(term: String!, after: String): Result");
  });

  it("renders a built-in scalar as a bare name, since it has no concept file", () => {
    const node = operation("count", [], { name: "Int", path: null, wrappers: ["nonNull"] });

    expect(operationSignature(node)).toBe("count: Int!");
  });
});

describe("directiveSignature", () => {
  it("renders the name, arguments and locations", () => {
    const node = directive(
      "auth",
      [arg("requires", ref("Role", ["nonNull"]), "CUSTOMER")],
      ["FIELD_DEFINITION", "OBJECT"],
    );

    expect(directiveSignature(node)).toBe(
      "@auth(requires: Role! = CUSTOMER) on FIELD_DEFINITION | OBJECT",
    );
  });

  it("renders a directive with no arguments", () => {
    expect(directiveSignature(directive("tag", [], ["FIELD_DEFINITION"]))).toBe(
      "@tag on FIELD_DEFINITION",
    );
  });

  it("puts `repeatable` in its SDL slot, before `on`", () => {
    const node = directive("tag", [arg("name", ref("String", ["nonNull"]))], ["OBJECT"], true);

    expect(directiveSignature(node)).toBe("@tag(name: String!) repeatable on OBJECT");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm exec vitest run src/emit/render/signature.test.ts
```

Expected: FAIL — `Failed to resolve import "./signature.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/emit/render/signature.ts`:

```ts
import type { DirectiveDefinitionNode, InputValueNode, OperationNode } from "../../model/ir.js";
import { decoratedType } from "./links.js";

/**
 * The SDL argument list. Empty parentheses are not SDL, so an element with no
 * arguments renders as a bare `name: Type`. `decoratedType` rather than
 * `typeLink`: a signature is a code span, and a Markdown code span cannot hold a
 * link (see the issue #21 design).
 */
function argumentList(args: readonly InputValueNode[]): string {
  if (args.length === 0) {
    return "";
  }
  const rendered = args.map((arg) => {
    const type = decoratedType(arg.type);
    return arg.defaultValue === null
      ? `${arg.name}: ${type}`
      : `${arg.name}: ${type} = ${arg.defaultValue}`;
  });
  return `(${rendered.join(", ")})`;
}

export function operationSignature(node: OperationNode): string {
  return `${node.name}${argumentList(node.args)}: ${decoratedType(node.type)}`;
}

/**
 * Locations are already sorted by `project.ts`, so this prints them as the IR
 * holds them and cannot disagree with `body.ts`'s `Locations:` line. GraphQL
 * requires at least one location, so there is no empty case to branch on.
 */
export function directiveSignature(node: DirectiveDefinitionNode): string {
  const repeatable = node.isRepeatable ? " repeatable" : "";
  return `@${node.name}${argumentList(node.args)}${repeatable} on ${node.locations.join(" | ")}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm exec vitest run src/emit/render/signature.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm run typecheck && pnpm run lint
```

Expected: both pass. (`knip` will report `signature.ts` exports as unused until Task 3 consumes them — do not run it yet, and do not "fix" it by exporting from `src/index.ts`. Signatures are an internal rendering detail.)

- [ ] **Step 6: Commit**

```bash
git add src/emit/render/signature.ts src/emit/render/signature.test.ts
git commit -m "feat: render SDL signatures for operations and directives (#21)"
```

---

### Task 2: Code-span labels and deprecation markers on index rows

**Files:**
- Modify: `src/emit/render/directory-index.ts:3-7` (the `IndexEntry` interface), `src/emit/render/directory-index.ts:32-36` (`bullet`)
- Test: `src/emit/render/directory-index.test.ts`

**Interfaces:**
- Produces: `IndexEntry` gains two optional fields, `code?: boolean` and `deprecated?: boolean`. Both default to absent, so every existing call site and test literal keeps compiling and rendering identically. Task 3 sets them.

- [ ] **Step 1: Write the failing tests**

Append to `src/emit/render/directory-index.test.ts`, inside the top-level `describe("renderDirectoryIndex", ...)` block, just above the closing `});`:

```ts
  it("wraps the label in a code span when the entry is code", () => {
    const parts = renderDirectoryIndex("Query operations", [
      {
        entries: [
          {
            label: "me: Customer",
            code: true,
            link: "/queries/me.md",
            summary: "The current customer.",
          },
        ],
      },
    ]);

    expect(parts.generated).toContain(
      "* [`me: Customer`](/queries/me.md) - The current customer.",
    );
  });

  it("marks a deprecated entry ahead of its summary", () => {
    const parts = renderDirectoryIndex("Query operations", [
      {
        entries: [
          {
            label: "legacy: String",
            code: true,
            deprecated: true,
            link: "/queries/legacy.md",
            summary: "An old field.",
          },
        ],
      },
    ]);

    expect(parts.generated).toContain(
      "* [`legacy: String`](/queries/legacy.md) - **(deprecated)** An old field.",
    );
  });

  it("marks a deprecated entry that has no summary, without a trailing space", () => {
    const parts = renderDirectoryIndex("Query operations", [
      {
        entries: [
          { label: "legacy: String", code: true, deprecated: true, link: "/queries/legacy.md", summary: "" },
        ],
      },
    ]);

    expect(parts.generated).toContain(
      "* [`legacy: String`](/queries/legacy.md) - **(deprecated)**\n",
    );
  });

  it("renders a plain entry exactly as before when neither flag is set", () => {
    const parts = renderDirectoryIndex("Types", [
      { entries: [{ label: "Country", link: "/types/Country.md", summary: "An ISO country." }] },
    ]);

    expect(parts.generated).toBe("\n* [Country](/types/Country.md) - An ISO country.\n");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/directory-index.test.ts
```

Expected: FAIL — the first two with `Object literal may only specify known properties, 'code' does not exist in type 'IndexEntry'` (Vitest surfaces the transpile error), and once that is past, the rendered strings lack the backticks and the marker.

- [ ] **Step 3: Write the implementation**

In `src/emit/render/directory-index.ts`, replace the `IndexEntry` interface (lines 3-7) with:

```ts
export interface IndexEntry {
  readonly label: string;
  readonly link: string;
  readonly summary: string;
  /**
   * Wrap the label in a code span. Set for signature rows (issue #21), where the
   * label is SDL rather than a bare name.
   */
  readonly code?: boolean;
  /**
   * Prefix the summary with a bold marker. Outside the code span deliberately:
   * the label stays valid SDL, and the marker stays visible ahead of a long
   * description. The deprecation reason stays in the concept file.
   */
  readonly deprecated?: boolean;
}
```

and replace `bullet` (lines 32-36) with:

```ts
function bullet(entry: IndexEntry): string {
  const label = entry.code === true ? `\`${entry.label}\`` : entry.label;
  const link = `* [${label}](${entry.link})`;
  const summary =
    entry.deprecated === true ? `**(deprecated)** ${entry.summary}`.trimEnd() : entry.summary;
  return summary === "" ? link : `${link} - ${summary}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/directory-index.test.ts
```

Expected: PASS, all tests in the file — the pre-existing ones included, unchanged.

- [ ] **Step 5: Confirm no emitted output moved yet**

```bash
pnpm test
```

Expected: PASS, whole suite. In particular `test/example-bundle.test.ts` still matches `okf/shop-api` byte-for-byte: Task 2 adds capability, not output.

- [ ] **Step 6: Commit**

```bash
git add src/emit/render/directory-index.ts src/emit/render/directory-index.test.ts
git commit -m "feat: support code-span labels and deprecation markers on index rows (#21)"
```

---

### Task 3: Put signatures into the indexes

**Files:**
- Modify: `src/emit/bundle.ts` — imports, a new `SIGNATURE_NOTE` beside `SPEC_DEFINED_NOTE` (line 61), `sortByLabel` (lines 66-70) replaced by keyed sorting, `conceptEntry` (lines 147-151), the section assembly (lines 159-177), the note selection (line 193)
- Test: `src/emit/bundle.test.ts`

**Interfaces:**
- Consumes: `operationSignature`, `directiveSignature` from Task 1; `IndexEntry.code` and `IndexEntry.deprecated` from Task 2.
- Produces: `SIGNATURE_NOTE`, exported from `src/emit/bundle.ts` alongside `SPEC_DEFINED_NOTE`, asserted against in Task 3's tests and used nowhere else.

- [ ] **Step 1: Write the failing tests**

Append to `src/emit/bundle.test.ts`, inside the top-level `describe("buildBundle", ...)` block, just above its closing `});`:

```ts
  it("carries an SDL signature as the link label on an operation row", () => {
    const bundle = bundleFrom(`
      input ProductFilter { term: String }
      type Product { id: ID! }
      type Query {
        "Lists products."
        products(filter: ProductFilter, first: Int = 20): [Product!]!
      }
    `);

    expect(assembled(bundle, "queries/index.md")).toContain(
      "* [`products(filter: ProductFilter, first: Int = 20): [Product!]!`](/queries/products.md) - Lists products.",
    );
  });

  it("carries an SDL signature on a directive row", () => {
    const bundle = bundleFrom(`
      "Restricts a field."
      directive @auth(requires: String! = "CUSTOMER") on FIELD_DEFINITION | OBJECT
      type Query { hello: String }
    `);

    expect(assembled(bundle, "directives/index.md")).toContain(
      '* [`@auth(requires: String! = "CUSTOMER") on FIELD_DEFINITION | OBJECT`](/directives/auth.md) - Restricts a field.',
    );
  });

  it("marks a deprecated operation on its index row", () => {
    const bundle = bundleFrom(`
      type Query {
        "An old field."
        legacy: String @deprecated(reason: "Use hello.")
        hello: String
      }
    `);

    expect(assembled(bundle, "queries/index.md")).toContain(
      "* [`legacy: String`](/queries/legacy.md) - **(deprecated)** An old field.",
    );
  });

  it("puts the signature convention note on an index that carries signatures", () => {
    const bundle = bundleFrom("type Query { hello: String }");

    expect(assembled(bundle, "queries/index.md")).toContain(SIGNATURE_NOTE);
  });

  it("leaves the type index without a signature note and without signatures", () => {
    const bundle = bundleFrom(`
      "An ISO country."
      type Country { code: ID! }
      type Query { countries: [Country!]! }
    `);

    const types = assembled(bundle, "types/index.md");
    expect(types).not.toContain(SIGNATURE_NOTE);
    expect(types).toContain("* [Country](/types/Country.md) - An ISO country.");
  });

  it("keeps the root index note about spec-defined elements", () => {
    const bundle = bundleFrom("type Query { hello: String }");

    const root = assembled(bundle, "index.md");
    expect(root).toContain(SPEC_DEFINED_NOTE);
    expect(root).not.toContain(SIGNATURE_NOTE);
  });

  it("orders operation rows by name, not by rendered signature", () => {
    const bundle = bundleFrom(`
      type Query {
        product(id: ID!): String
        products: String
        me: String
      }
    `);

    const names = assembled(bundle, "queries/index.md")
      .split("\n")
      .filter((line) => line.startsWith("* ["))
      .map((line) => line.slice(line.indexOf("](/queries/") + "](/queries/".length, line.indexOf(".md)")));

    expect(names).toEqual(["me", "product", "products"]);
  });
```

Also extend the import on line 6 of the file:

```ts
import { buildBundle, SIGNATURE_NOTE, SPEC_DEFINED_NOTE } from "./bundle.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/bundle.test.ts
```

Expected: FAIL — `SIGNATURE_NOTE` is not exported, and the signature assertions find bare-name rows.

- [ ] **Step 3: Add the note constant and the signature imports**

In `src/emit/bundle.ts`, extend the imports:

```ts
import { type ConceptKind, DIRECTORY_BY_KIND, KIND_ORDER } from "../model/naming.js";
```

and, alongside the existing `bundleLink` import, add:

```ts
import { directiveSignature, operationSignature } from "./render/signature.js";
```

Then add below `SPEC_DEFINED_NOTE`:

```ts
/**
 * `GOAL-7.3`'s "documented convention", applied to signatures. It sits on every
 * index that carries one rather than only on the root: an agent frequently enters
 * at `queries/index.md` without passing through the root, and a convention it
 * never read is a convention that does not exist. `/types/index.md` is named as
 * the authority because `resolvePaths` hashes a basename when two type names
 * differ only by case, so the `<Name>.md` form is the rule, not a guarantee.
 */
export const SIGNATURE_NOTE =
  "Signatures are GraphQL SDL. A type name in a signature is a concept file at " +
  `\`/${DIRECTORY_BY_KIND.object}/<Name>.md\`; ` +
  `\`/${DIRECTORY_BY_KIND.object}/index.md\` lists them all.`;

/** The kinds whose index rows carry a signature, and so a convention note. */
const SIGNATURE_KINDS = new Set<ConceptKind>(["query", "mutation", "subscription", "directive"]);

function signatureOf(concept: ConceptNode): string | null {
  switch (concept.kind) {
    case "query":
    case "mutation":
    case "subscription":
      return operationSignature(concept);
    case "directive":
      return directiveSignature(concept);
    default:
      return null;
  }
}
```

- [ ] **Step 4: Replace label sorting with keyed sorting**

Ordering must not depend on the rendered label once the label is a signature. Replace `sortByLabel` (lines 66-70) with:

```ts
/**
 * An index row's order comes from the element it describes, never from the text
 * it renders as. Signature labels happen to sort the same way bare names do —
 * every GraphQL name character sorts above `(` — but relying on that would make
 * ordering hostage to the next format change (issue #24).
 */
type KeyedEntry = { readonly key: string; readonly entry: IndexEntry };

function ordered(items: readonly KeyedEntry[]): IndexEntry[] {
  return [...items]
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map((item) => item.entry);
}
```

- [ ] **Step 5: Build keyed entries and select the note**

Replace the body of the `for (const dir of allDirs)` loop from `const childEntries` (line 136) through the `bundle.set(...)` call (line 195) with:

```ts
    const childEntries: KeyedEntry[] = [];
    for (const child of childDirs.get(dir) ?? []) {
      const base = posix.basename(child);
      childEntries.push({
        key: `${base}/`,
        entry: {
          label: `${base}/`,
          link: bundleLink(`${child}/index.md`),
          summary: DIRECTORY_LABELS[child] ?? base,
        },
      });
    }

    const concepts = filesByDir.get(dir) ?? [];
    const conceptEntry = (concept: ConceptNode): KeyedEntry => {
      const signature = signatureOf(concept);
      const summary = firstSentence(concept.description) ?? KIND_SUMMARY[concept.kind];
      const deprecated =
        "deprecation" in concept && concept.deprecation !== null ? { deprecated: true } : {};
      return {
        key: concept.name,
        entry: {
          label: signature ?? concept.name,
          link: bundleLink(concept.path),
          summary,
          ...(signature === null ? {} : { code: true }),
          ...deprecated,
        },
      };
    };

    const tombstoneEntries: KeyedEntry[] = (tombstonesByDir.get(dir) ?? []).map((tombstone) => ({
      key: tombstone.title,
      entry: {
        label: tombstone.title,
        link: bundleLink(tombstone.path),
        summary: "(removed)",
      },
    }));

    const kinds = new Set(concepts.map((concept) => concept.kind));
    const sections: IndexSection[] = [];

    if (kinds.size > 1) {
      sections.push({ entries: ordered(childEntries) });
      for (const kind of KIND_ORDER) {
        const entries = concepts.filter((concept) => concept.kind === kind).map(conceptEntry);
        if (entries.length > 0) {
          sections.push({ heading: KIND_SECTION_LABELS[kind], entries: ordered(entries) });
        }
      }
      if (tombstoneEntries.length > 0) {
        sections.push({ heading: "Removed", entries: ordered(tombstoneEntries) });
      }
    } else {
      sections.push({
        entries: ordered([...childEntries, ...concepts.map(conceptEntry), ...tombstoneEntries]),
      });
    }

    const title = DIRECTORY_LABELS[dir] ?? posix.basename(dir);
    const indexPath = dir === "." ? "index.md" : `${dir}/index.md`;
    const frontmatter =
      dir === "."
        ? [
            `okf_version: ${JSON.stringify(ctx.okfVersion)}`,
            `resource: ${JSON.stringify(ir.resource)}`,
          ]
        : undefined;
    const note =
      dir === "."
        ? SPEC_DEFINED_NOTE
        : concepts.some((concept) => SIGNATURE_KINDS.has(concept.kind))
          ? SIGNATURE_NOTE
          : undefined;
    bundle.set(indexPath, renderDirectoryIndex(title, sections, { frontmatter, note }));
```

Two details worth not getting wrong. `deprecation` exists only on `OperationNode` among concept kinds, hence the `in` narrowing rather than a cast. And the note is now passed uniformly for every directory — `renderDirectoryIndex` already treats `note: undefined` as "no note", so the old `dir === "." ? {...} : {...}` split is gone.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/bundle.test.ts
```

Expected: PASS, all tests in the file.

- [ ] **Step 7: Run the whole suite and expect the fixture test to fail**

```bash
pnpm test
```

Expected: FAIL — exactly one test, `test/example-bundle.test.ts > the committed example bundle > matches okf/shop-api byte-for-byte`. The committed fixture predates signatures. Every other test must pass; if anything else fails, stop and diagnose before regenerating anything.

- [ ] **Step 8: Commit the source change**

```bash
git add src/emit/bundle.ts src/emit/bundle.test.ts
git commit -m "feat: put operation and directive signatures in index.md files (#21)"
```

---

### Task 4: Regenerate the fixtures, document the convention, verify

**Files:**
- Modify: `okf/shop-api/` (regenerated), `okf/countries-api/` (regenerated), `README.md`

**Interfaces:**
- Consumes: the emitter behaviour from Task 3. Produces no new code.

- [ ] **Step 1: Regenerate the shop-api fixture**

```bash
UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts
```

This rewrites `okf/shop-api` from the pinned v1 → v2 → v3 → v0.2-migration sequence. It needs no network.

- [ ] **Step 2: Confirm the regenerated bundle now matches**

```bash
pnpm exec vitest run test/example-bundle.test.ts
```

Expected: PASS.

- [ ] **Step 3: Inspect the shop-api diff before trusting it**

```bash
git status --short okf/shop-api
```

Expected: exactly four modified files — `queries/index.md`, `mutations/index.md`, `subscriptions/index.md`, `directives/index.md`. **No other file may appear.** In particular `log.md` must be unchanged: index writes are counted as `indexes` in `src/reconcile/plan.ts` and excluded from `hasLoggableChanges`, so reformatting an index is not a logged event. If `log.md` or any concept file shows up, stop — something outside the intended blast radius moved.

```bash
git diff okf/shop-api/queries/index.md
```

Expected: each row gains a code-span signature label, the convention note appears above the list, and the tombstone row `* [searchProducts](/queries/searchProducts.md) - (removed)` is unchanged.

- [ ] **Step 4: Regenerate the countries-api fixture**

This one is generated from a live third-party endpoint and needs network access.

```bash
pnpm run build
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
```

If the endpoint is unreachable, stop and say so in the PR rather than hand-editing the bundle. Hand-edited generated output is exactly what `M1/GOAL-4.5` exists to prevent.

- [ ] **Step 5: Inspect the countries-api diff**

```bash
git status --short okf/countries-api
```

Expected: modified `queries/index.md` only (this schema declares no mutations, subscriptions or custom directives), and no `log.md` change.

- [ ] **Step 6: Measure what the change cost and bought**

```bash
git diff --stat okf/shop-api okf/countries-api
```

Record the net byte change. The issue budgeted roughly 2 KB added across all indexes; report the real number in the PR whether or not it matches.

- [ ] **Step 7: Document the convention in the README**

In `README.md`, immediately after the `### Built-in scalars and spec directives` section (which ends with the paragraph about `GOAL-7.3` and the root `index.md`), add:

```markdown
### Signatures in index files

An index row for an operation or a directive carries its full GraphQL SDL
signature as the link text:

    * [`products(filter: ProductFilter, first: Int = 20): [Product!]!`](/queries/products.md) - Lists products, most recently created first.

so "what does this take, and what does it return?" is answered by the directory
listing rather than by opening the file. Type names inside a signature are not
links — a Markdown code span cannot contain one, and linking each would roughly
double the row; each names a concept file listed in `/types/index.md`. Each index
that carries signatures says so in a note above its list.
```

- [ ] **Step 8: Final verification**

```bash
pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Expected: all pass, coverage at or above lines 90% / functions 90% / branches 85% / statements 90%.

- [ ] **Step 9: Confirm the determinism guarantee directly**

```bash
pnpm exec vitest run test/reconcile.test.ts test/migrate.test.ts
```

Expected: PASS — a re-run against an unchanged schema stays byte-identical with no `log.md` entry (`GOAL-8.1`).

- [ ] **Step 10: Commit**

```bash
git add README.md okf/shop-api okf/countries-api
git commit -m "docs: regenerate bundles with index signatures, document the convention (#21)"
```

- [ ] **Step 11: Open the PR**

Reference issue #21 and the spec. State three things explicitly: the measured byte change from Step 6 against the issue's ~2 KB estimate; that upgrading an existing bundle rewrites its operation and directive indexes **without** a `log.md` entry, by design; and that the issue's note about reusing an existing signature renderer in `body.ts` was wrong — no such renderer existed, so `signature.ts` is new, and concept-file bodies are deliberately left to issue #24.

---

## Verification

Every check CI enforces, in one run:

```bash
pnpm install --frozen-lockfile && pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Behavioural guarantees this plan must leave intact:

- Re-running against an unchanged schema is byte-identical with no `log.md` entry (`GOAL-8.1`) — `test/reconcile.test.ts`.
- `types/index.md` and every child-directory row render exactly as before — asserted in Task 3 Step 1 and visible as their absence from the Task 4 Step 3 diff.
- Human-authored content below the generated marker survives regeneration (`GOAL-8.3`) — `test/example-bundle.test.ts`.
- No link in the bundle dangles (`GOAL-7.2`) — `src/conformance.test.ts`. Signatures add no links, so this must stay green untouched.
