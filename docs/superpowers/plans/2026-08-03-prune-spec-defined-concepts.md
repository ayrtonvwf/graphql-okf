# Prune spec-defined concept files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop emitting concept files for the ten elements the GraphQL specification defines — the scalars `Boolean`, `Float`, `ID`, `Int`, `String` and the directives `@deprecated`, `@include`, `@oneOf`, `@skip`, `@specifiedBy` — and render every reference to them as plain code rather than a link.

**Architecture:** `src/model/naming.ts` gains the rule (`hasConceptFile`) and the derived set of paths those concepts used to occupy. `TypeRef.path` and `AppliedDirective.path` become `string | null`, so a link with no target is unrepresentable rather than merely untested. `src/model/project.ts` stops putting spec-defined elements into the IR, which drops them from indexes for free. A new `src/reconcile/prune.ts` pre-pass deletes their files from existing bundles before reconciliation can turn them into tombstones.

**Tech Stack:** TypeScript (`strict: true`, ESM), Node 24, Vitest + v8 coverage, Biome, knip, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-03-prune-spec-defined-concepts-design.md`](../specs/2026-08-03-prune-spec-defined-concepts-design.md) — issue #23.

## Global Constraints

- **Determinism is load-bearing** (`M1/GOAL-8.1`, `M1/NG-6`). No runtime LLM calls, no nondeterministic iteration order, no wall-clock output beyond the spec's ISO-8601 timestamps. Re-running against an unchanged schema must be a byte-identical no-op with no `log.md` entry.
- **The naming scheme is the single source of truth** (`M1/GOAL-4.5`). The emitter and the reconciler both consume `src/model/naming.ts`; neither re-derives paths.
- **Single public entry point:** everything exported flows through `src/index.ts`.
- **Coverage thresholds are enforced:** lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.
- **TDD:** write the failing test, watch it fail, write the minimal code to pass. Never backfill tests.
- **Verification gate before any PR:** `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, `pnpm run knip`.
- **The ten spec-defined names, verbatim.** Scalars: `Boolean`, `Float`, `ID`, `Int`, `String`. Directives: `deprecated`, `include`, `oneOf`, `skip`, `specifiedBy`.

## File Structure

**Created:**
- `src/reconcile/prune.ts` — the pre-pass that deletes spec-defined concept files from an existing bundle. One responsibility, mirroring `relayout.ts` and `migrate.ts`.
- `src/reconcile/prune.test.ts`

**Modified:**
- `src/model/naming.ts` — `hasConceptFile`, `SPEC_DEFINED_PATHS`.
- `src/model/ir.ts` — nullable `path` on `TypeRef` and `AppliedDirective`; drop both `isBuiltIn` fields.
- `src/emit/render/links.ts`, `src/emit/render/body.ts` — render plain code when the path is null.
- `src/emit/render/directory-index.ts` — options object carrying `frontmatter` and `note`.
- `src/model/project.ts` — leave spec-defined elements out of the IR.
- `src/emit/bundle.ts` — the root-index convention note.
- `src/reconcile/parse.ts` — `hasHumanText` moves here from `relayout.ts`.
- `src/reconcile/relayout.ts` — import `hasHumanText` instead of defining it.
- `src/reconcile/plan.ts` — run prune; carry `migrated.pruned`.
- `src/reconcile/log.ts` — report the prune count.
- `src/index.ts` — expose `pruned` on `SyncResult`.
- `src/conformance.test.ts`, `test/reconcile.test.ts`, `test/example-bundle.test.ts`
- `README.md`, `docs/northstar-specs/GOAL-M1.md`
- `okf/shop-api/**`, `okf/countries-api/**`

**Task order rationale.** Tasks 1–3 are additive or pure refactors that change no emitted byte, so they land quietly and can be reviewed on their own. Task 4 is the flip — the single commit where output changes and the shop-api golden is regenerated once. Tasks 5–6 build the migration behind it, Task 7 proves it end to end, and Task 8 is the only committed bundle that actually runs it.

---

### Task 1: The rule lives in the naming scheme

Pure addition. Nothing consumes it yet, so no emitted byte changes.

**Files:**
- Modify: `src/model/naming.ts`
- Test: `src/model/naming.test.ts`

**Interfaces:**
- Consumes: `ElementName`, `elementId`, `resolvePaths` — all already in `src/model/naming.ts`.
- Produces:
  - `hasConceptFile(element: ElementName): boolean`
  - `SPEC_DEFINED_PATHS: readonly string[]` — sorted, ten entries.

- [ ] **Step 1: Write the failing tests**

Add to `src/model/naming.test.ts`. The third test is the important one: it pins our name-based rule against graphql-js's own predicates, so the two cannot drift.

```ts
describe("hasConceptFile", () => {
  it("denies a concept file to every specified scalar and directive", () => {
    for (const name of ["Boolean", "Float", "ID", "Int", "String"]) {
      expect(hasConceptFile({ kind: "scalar", name })).toBe(false);
    }
    for (const name of ["deprecated", "include", "oneOf", "skip", "specifiedBy"]) {
      expect(hasConceptFile({ kind: "directive", name })).toBe(false);
    }
  });

  it("grants one to custom scalars, custom directives, and every other kind", () => {
    expect(hasConceptFile({ kind: "scalar", name: "DateTime" })).toBe(true);
    expect(hasConceptFile({ kind: "directive", name: "auth" })).toBe(true);
    // GraphQL names are case-sensitive: `type id` is not the built-in `ID`.
    expect(hasConceptFile({ kind: "object", name: "id" })).toBe(true);
    expect(hasConceptFile({ kind: "enum", name: "String" })).toBe(true);
    expect(hasConceptFile({ kind: "query", name: "skip" })).toBe(true);
  });

  it("agrees with graphql-js about what the specification defines", () => {
    const schema = buildSchema(`
      scalar DateTime
      directive @auth(role: String) on FIELD_DEFINITION
      type Query { at: DateTime, id: ID, n: Int, f: Float, s: String, b: Boolean }
    `);

    for (const type of Object.values(schema.getTypeMap())) {
      if (!isScalarType(type)) {
        continue;
      }
      expect(hasConceptFile({ kind: "scalar", name: type.name })).toBe(!isSpecifiedScalarType(type));
    }

    for (const directive of schema.getDirectives()) {
      expect(hasConceptFile({ kind: "directive", name: directive.name })).toBe(
        !isSpecifiedDirective(directive),
      );
    }
  });
});

describe("SPEC_DEFINED_PATHS", () => {
  it("lists the ten paths spec-defined concepts occupied, sorted", () => {
    expect([...SPEC_DEFINED_PATHS]).toEqual([
      "directives/deprecated.md",
      "directives/include.md",
      "directives/oneOf.md",
      "directives/skip.md",
      "directives/specifiedBy.md",
      "types/Boolean.md",
      "types/Float.md",
      "types/ID.md",
      "types/Int.md",
      "types/String.md",
    ]);
  });
});
```

Extend the existing import from `./naming.js` at the top of the file to include `hasConceptFile` and `SPEC_DEFINED_PATHS`, and add the graphql-js import:

```ts
import { buildSchema, isScalarType, isSpecifiedDirective, isSpecifiedScalarType } from "graphql";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/model/naming.test.ts`

Expected: FAIL. TypeScript/Vitest reports `hasConceptFile` and `SPEC_DEFINED_PATHS` are not exported by `./naming.js`.

- [ ] **Step 3: Write the implementation**

Add to `src/model/naming.ts`, immediately below the `RESERVED_BASENAMES` constant (so it sits with the other naming policy, above `resolvePaths`):

```ts
/**
 * The elements GraphQL's own specification defines. `GOAL-7.3` lets us omit
 * links to built-in scalars under a documented convention; issue #23 extends the
 * same convention to the spec directives, for the same reason — both are prose
 * every model already carries, and every link to one invites a consumer to spend
 * a turn re-reading what it knew before it started.
 *
 * Matching on name is exact, not approximate: GraphQL forbids a schema from
 * redefining a specified scalar or directive, so no custom element can ever carry
 * one of these names in the matching kind. Names are case-sensitive, so a
 * `type id` is a different element from the built-in `ID` and keeps its file.
 */
const SPEC_DEFINED_SCALARS = new Set(["Boolean", "Float", "ID", "Int", "String"]);
const SPEC_DEFINED_DIRECTIVES = new Set([
  "deprecated",
  "include",
  "oneOf",
  "skip",
  "specifiedBy",
]);

/** Whether this element gets a concept file of its own. See the note above. */
export function hasConceptFile(element: ElementName): boolean {
  if (element.kind === "scalar") {
    return !SPEC_DEFINED_SCALARS.has(element.name);
  }
  if (element.kind === "directive") {
    return !SPEC_DEFINED_DIRECTIVES.has(element.name);
  }
  return true;
}

const SPEC_DEFINED_ELEMENTS: readonly ElementName[] = [
  ...[...SPEC_DEFINED_SCALARS].map((name): ElementName => ({ kind: "scalar", name })),
  ...[...SPEC_DEFINED_DIRECTIVES].map((name): ElementName => ({ kind: "directive", name })),
];

/**
 * The paths spec-defined concepts occupied before issue #23, sorted. Derived by
 * running the same two sets `hasConceptFile` consults through `resolvePaths`,
 * rather than written out: these paths are a function of the current rule, so the
 * prune pre-pass that consumes them cannot drift from the emitter's behaviour.
 * (Contrast `relayout.ts`'s `LEGACY_TYPE_DIRS`, which is a historical fact about
 * bundles on disk and must survive the naming scheme forgetting it.)
 */
export const SPEC_DEFINED_PATHS: readonly string[] = [
  ...resolvePaths(SPEC_DEFINED_ELEMENTS).values(),
].sort();
```

`SPEC_DEFINED_PATHS` calls `resolvePaths` at module load; that is safe because `resolvePaths` is a hoisted function declaration.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/model/naming.test.ts`

Expected: PASS, including the three new tests.

- [ ] **Step 5: Verify nothing else moved**

Run: `pnpm test && pnpm run typecheck`

Expected: PASS. No emitted output has changed — nothing consumes the new exports yet.

- [ ] **Step 6: Commit**

```bash
git add src/model/naming.ts src/model/naming.test.ts && git commit -m "feat(naming): add hasConceptFile and SPEC_DEFINED_PATHS (#23)"
```

---

### Task 2: A reference with no target

`TypeRef.path` and `AppliedDirective.path` become nullable and the two renderers learn the null branch. Still no output change: `project.ts` supplies a path for everything until Task 4.

**Files:**
- Modify: `src/model/ir.ts:3-15`
- Modify: `src/emit/render/links.ts:26-28`
- Modify: `src/emit/render/body.ts:29-41`
- Test: `src/emit/render/links.test.ts`, `src/emit/render/body.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `TypeRef.path: string | null` and `AppliedDirective.path: string | null`. Task 4 relies on both being nullable. `typeLink(ref: TypeRef): string` and `decoratedType(ref: TypeRef): string` keep their signatures.

- [ ] **Step 1: Write the failing tests**

Add to `src/emit/render/links.test.ts`:

```ts
describe("a reference with no concept file", () => {
  it("renders plain code instead of a link", () => {
    expect(typeLink({ wrappers: ["nonNull"], name: "ID", path: null })).toBe("`ID!`");
  });

  it("keeps every wrapper on the plain-code form", () => {
    expect(
      typeLink({ wrappers: ["nonNull", "list", "nonNull"], name: "String", path: null }),
    ).toBe("`[String!]!`");
  });
});
```

Add to `src/emit/render/body.test.ts`:

```ts
describe("rendering an element that has no concept file", () => {
  it("renders an unlinked type in a field table", () => {
    const body = renderObjectBody({
      kind: "object",
      name: "Product",
      path: "types/Product.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [
        {
          name: "id",
          description: null,
          type: { wrappers: ["nonNull"], name: "ID", path: null },
          args: [],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(body).toContain("| `id` | `ID!` |");
    expect(body).not.toContain("](/types/ID.md)");
  });

  it("renders an unlinked applied directive, arguments intact", () => {
    const body = renderInputBody({
      kind: "input",
      name: "PaymentInput",
      path: "types/PaymentInput.md",
      description: null,
      fields: [],
      appliedDirectives: [
        { name: "oneOf", path: null, args: [] },
        { name: "tag", path: "directives/tag.md", args: [{ name: "name", value: '"beta"' }] },
      ],
    });

    expect(body).toContain(
      'Directives: `@oneOf`, [`@tag`](/directives/tag.md)(name: "beta").',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/emit/render/links.test.ts src/emit/render/body.test.ts`

Expected: FAIL. `typeLink` produces `` [`ID!`](/null) `` (or a type error on `path: null`), and the directives line renders `` [`@oneOf`](/null) ``.

- [ ] **Step 3: Make the paths nullable**

In `src/model/ir.ts`, change the two `path` fields (leave `ConceptBase.path` alone — a concept that exists always has one):

```ts
export type TypeRef = {
  readonly wrappers: readonly ("nonNull" | "list")[];
  readonly name: string;
  /** Null for a spec-defined element, which has no concept file (issue #23). */
  readonly path: string | null;
};

export type AppliedDirective = {
  readonly name: string;
  /** Null for a spec directive, which has no concept file (issue #23). */
  readonly path: string | null;
  readonly args: readonly { readonly name: string; readonly value: string }[];
};
```

- [ ] **Step 4: Teach the two renderers the null branch**

Replace `typeLink` in `src/emit/render/links.ts`:

```ts
export function typeLink(ref: TypeRef): string {
  const decorated = `\`${decoratedType(ref)}\``;
  return ref.path === null ? decorated : `[${decorated}](${bundleLink(ref.path)})`;
}
```

Replace `appliedInline` in `src/emit/render/body.ts`:

```ts
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
      const head =
        directive.path === null ? label : `[${label}](${bundleLink(directive.path)})`;
      return `${head}${args}`;
    })
    .join(", ");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/emit/render/links.test.ts src/emit/render/body.test.ts`

Expected: PASS.

- [ ] **Step 6: Verify no emitted byte changed**

Run: `pnpm test && pnpm run typecheck`

Expected: PASS, `test/example-bundle.test.ts` included. Every path is still non-null at this point, so the golden bundle is untouched.

- [ ] **Step 7: Commit**

```bash
git add src/model/ir.ts src/emit/render/links.ts src/emit/render/body.ts src/emit/render/links.test.ts src/emit/render/body.test.ts && git commit -m "feat(render): render a reference with no concept file as plain code (#23)"
```

---

### Task 3: `renderDirectoryIndex` takes an options object

Pure signature refactor. A fourth positional parameter is where that signature would stop reading well, so `frontmatter` and the note Task 4 needs fold into one object. Output is byte-identical.

**Files:**
- Modify: `src/emit/render/directory-index.ts:31-53`
- Modify: `src/emit/bundle.ts:175`
- Test: `src/emit/render/directory-index.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `renderDirectoryIndex(title: string, sections: readonly IndexSection[], options?: DirectoryIndexOptions): FileParts` where `DirectoryIndexOptions = { frontmatter?: readonly string[]; note?: string }`. Task 4 passes `note`.

- [ ] **Step 1: Write the failing test**

Add to `src/emit/render/directory-index.test.ts`:

```ts
describe("the options object", () => {
  it("puts a note above the bullets, inside the generated region", () => {
    const parts = renderDirectoryIndex(
      "API interface",
      [{ entries: [{ label: "types/", link: "/types/index.md", summary: "Types" }] }],
      { frontmatter: ['okf_version: "0.2"'], note: "Built-ins have no concept files." },
    );

    expect(parts.preamble).toBe('---\nokf_version: "0.2"\n---\n\n# API interface\n\n');
    expect(parts.generated).toBe(
      "\nBuilt-ins have no concept files.\n\n* [types/](/types/index.md) - Types\n",
    );
  });

  it("renders exactly as before when no note is given", () => {
    const parts = renderDirectoryIndex(
      "Types",
      [{ entries: [{ label: "Country", link: "/types/Country.md", summary: "A country." }] }],
      { frontmatter: ['okf_version: "0.2"'] },
    );

    expect(parts.generated).toBe("\n* [Country](/types/Country.md) - A country.\n");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/emit/render/directory-index.test.ts`

Expected: FAIL — the third argument is typed `readonly string[]`, so passing an object is a type error and the note never appears.

- [ ] **Step 3: Change the signature**

In `src/emit/render/directory-index.ts`, replace the `frontmatter` parameter and the doc comment above `renderDirectoryIndex`:

```ts
export interface DirectoryIndexOptions {
  /**
   * Pre-rendered `key: value` lines. OKF §11 permits a frontmatter block on the
   * bundle-root index only; every other index must stay frontmatter-free per §6,
   * so callers omit it.
   */
  readonly frontmatter?: readonly string[];
  /**
   * A paragraph above the bullets. Inside the generated region, not the preamble,
   * so it is rewritten on every run like everything else the machine owns.
   */
  readonly note?: string;
}

/**
 * A single headingless section renders exactly as an ungrouped index always has:
 * the four single-kind directories must not churn when grouping arrives.
 */
export function renderDirectoryIndex(
  title: string,
  sections: readonly IndexSection[],
  options: DirectoryIndexOptions = {},
): FileParts {
  const blocks = sections
    .filter((section) => section.entries.length > 0)
    .map((section) => {
      const bullets = section.entries.map(bullet).join("\n");
      return section.heading === undefined ? bullets : `## ${section.heading}\n\n${bullets}`;
    });

  const body = options.note === undefined ? blocks : [options.note, ...blocks];

  const { frontmatter } = options;
  const block =
    frontmatter === undefined || frontmatter.length === 0
      ? ""
      : `---\n${frontmatter.join("\n")}\n---\n\n`;

  return {
    preamble: `${block}# ${title}\n\n`,
    generated: `\n${body.join("\n\n")}\n`,
  };
}
```

- [ ] **Step 4: Update the one production caller**

In `src/emit/bundle.ts`, the last line of the per-directory loop currently reads
`bundle.set(indexPath, renderDirectoryIndex(title, sections, frontmatter));`.
Replace it with:

```ts
    bundle.set(indexPath, renderDirectoryIndex(title, sections, { frontmatter }));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/emit/render/directory-index.test.ts src/emit/bundle.test.ts`

Expected: PASS, once one pre-existing call site is updated. `src/emit/render/directory-index.test.ts:69-74` (`"emits a frontmatter block above the title when given one"`) passes frontmatter positionally:

```ts
    const parts = renderDirectoryIndex(
      "API interface",
      [{ entries: [] }],
      { frontmatter: ['okf_version: "0.1"', 'resource: "https://api.test/graphql"'] },
    );
```

Its assertion does not change. No other call site in that file passes a third argument.

- [ ] **Step 6: Verify no emitted byte changed**

Run: `pnpm test && pnpm run typecheck`

Expected: PASS, golden bundle unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/emit/render/directory-index.ts src/emit/render/directory-index.test.ts src/emit/bundle.ts && git commit -m "refactor(render): renderDirectoryIndex takes an options object (#23)"
```

---

### Task 4: The flip

The one commit where output changes. Spec-defined elements leave the IR, the dead `isBuiltIn` machinery goes with them, the root index states the convention, and the shop-api golden is regenerated once.

**Files:**
- Modify: `src/model/project.ts`
- Modify: `src/model/ir.ts:78-82,93-99`
- Modify: `src/emit/render/body.ts:240-254`
- Modify: `src/emit/bundle.ts`
- Test: `src/model/project.test.ts`, `src/emit/bundle.test.ts`, `src/emit/render/body.test.ts`, `src/emit/render/resource.test.ts`, `src/emit/render/concept.test.ts`, `src/reconcile/plan.test.ts`, `src/conformance.test.ts`, `test/example-bundle.test.ts`
- Regenerate: `okf/shop-api/**`

**Interfaces:**
- Consumes: `hasConceptFile` (Task 1); nullable `TypeRef.path` / `AppliedDirective.path` (Task 2); `DirectoryIndexOptions.note` (Task 3).
- Produces: an `ir.concepts` with no spec-defined nodes; `ScalarTypeNode` and `DirectiveDefinitionNode` without `isBuiltIn`; `SPEC_DEFINED_NOTE` exported from `src/emit/bundle.ts` for the tests.

- [ ] **Step 1: Write the failing tests**

Add to `src/model/project.test.ts`, using the `loadedFrom` and `conceptAt` helpers already at the top of that file:

```ts
describe("spec-defined elements", () => {
  it("emits no concept for a specified scalar or directive, but keeps custom ones", () => {
    const ir = project(
      loadedFrom(`
        scalar DateTime
        directive @auth(role: String) on FIELD_DEFINITION
        type Query { at: DateTime, id: ID, n: Int, f: Float, s: String, b: Boolean }
      `),
    );
    const paths = new Set(ir.concepts.map((concept) => concept.path));

    for (const path of SPEC_DEFINED_PATHS) {
      expect(paths.has(path), `${path} should not be emitted`).toBe(false);
    }
    expect(paths.has("types/DateTime.md")).toBe(true);
    expect(paths.has("directives/auth.md")).toBe(true);
  });

  it("gives a reference to a built-in scalar a null path", () => {
    const ir = project(loadedFrom("type Product { id: ID! }\ntype Query { p: Product }"));
    const product = conceptAt(ir.concepts, "types/Product.md") as ObjectTypeNode;

    expect(product.fields[0]?.type.name).toBe("ID");
    expect(product.fields[0]?.type.path).toBeNull();
  });

  it("gives an applied spec directive a null path and a custom one its real path", () => {
    const ir = project(
      loadedFrom(`
        directive @tag(name: String!) on INPUT_OBJECT
        input PaymentInput @oneOf @tag(name: "beta") { card: String, paypal: String }
        type Query { hello: String }
      `),
    );
    const input = conceptAt(ir.concepts, "types/PaymentInput.md") as InputObjectTypeNode;
    const pathByName = new Map(input.appliedDirectives.map((each) => [each.name, each.path]));

    expect(pathByName.get("oneOf")).toBeNull();
    expect(pathByName.get("tag")).toBe("directives/tag.md");
  });

  it("frees a clean path for a custom type that used to case-collide with a built-in", () => {
    const ir = project(loadedFrom("type id { value: String! }\ntype Query { thing: id }"));
    const paths = ir.concepts.map((concept) => concept.path);

    expect(paths).toContain("types/id.md");
    expect(paths.some((path) => path.startsWith("types/id-"))).toBe(false);
  });
});
```

Add `SPEC_DEFINED_PATHS` to the existing `./naming.js` import in `project.test.ts` (the file already imports `ObjectTypeNode` and `InputObjectTypeNode` from `./ir.js`).

Add to `src/emit/bundle.test.ts`, extending its existing `./bundle.js` import to `import { buildBundle, SPEC_DEFINED_NOTE } from "./bundle.js";`:

```ts
describe("the built-in convention note", () => {
  it("states the convention on the bundle root index only", () => {
    const ir = { resource: "https://x.example/graphql", origin: "sdl" as const, concepts: [
      {
        kind: "object" as const,
        name: "Product",
        path: "types/Product.md",
        description: null,
        appliedDirectives: [],
        interfaces: [],
        fields: [],
      },
    ] };

    const bundle = buildBundle(ir, emitContext("0.2", "2026-08-03T00:00:00.000Z"));

    expect(bundle.get("index.md")?.generated).toContain(SPEC_DEFINED_NOTE);
    expect(bundle.get("types/index.md")?.generated).not.toContain(SPEC_DEFINED_NOTE);
  });
});
```

Add to `src/conformance.test.ts`, inside the describe block holding the link invariants, importing `SPEC_DEFINED_PATHS` from `./model/naming.js`:

```ts
  it("emits no concept file for a spec-defined element", async () => {
    const files = await bundleFor("examples/shop-api/v3.graphql");

    for (const path of SPEC_DEFINED_PATHS) {
      expect(files.has(path), `${path} should not be in the bundle`).toBe(false);
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/model/project.test.ts src/emit/bundle.test.ts src/conformance.test.ts`

Expected: FAIL — the concepts are still emitted, paths are still non-null, and `SPEC_DEFINED_NOTE` does not exist.

- [ ] **Step 3: Stop putting spec-defined elements in the IR**

In `src/model/project.ts`:

Add `hasConceptFile` to the existing `./naming.js` import, and drop `isSpecifiedDirective` and `isSpecifiedScalarType` from the `graphql` import — nothing uses them here any more.

Guard the two `elements.push` sites so spec-defined names never enter the collision buckets:

```ts
  const elements: ElementName[] = [];
  for (const type of namedTypes) {
    const kind = kindOfNamedType(type);
    if (kind !== null && hasConceptFile({ kind, name: type.name })) {
      elements.push({ kind, name: type.name });
    }
  }
```

```ts
  for (const directive of schema.getDirectives()) {
    const element: ElementName = { kind: "directive", name: directive.name };
    if (hasConceptFile(element)) {
      elements.push(element);
    }
  }
```

Make `pathFor` nullable. The existing throw stays: an unresolved path for an element that *should* have one is still a bug.

```ts
  const pathFor = (element: ElementName): string | null => {
    if (!hasConceptFile(element)) {
      return null;
    }
    const path = paths.get(elementId(element));
    if (path === undefined) {
      throw new Error(`no path resolved for ${elementId(element)}`);
    }
    return path;
  };
```

Replace the concept-building loop over `namedTypes` — resolving the path once up front removes six repeated `pathFor` calls and gives the skip one home:

```ts
  for (const type of namedTypes) {
    const kind = kindOfNamedType(type);
    if (kind === null) {
      continue;
    }
    const path = pathFor({ kind, name: type.name });
    if (path === null) {
      continue;
    }
    if (isScalarType(type)) {
      concepts.push(scalarConcept(type, path, pathFor));
    } else if (isEnumType(type)) {
      concepts.push(enumConcept(type, path, pathFor));
    } else if (isObjectType(type)) {
      concepts.push(objectConcept(type, path, pathFor, rootDirectoryByTypeName));
    } else if (isInterfaceType(type)) {
      concepts.push(
        interfaceConcept(
          type,
          path,
          pathFor,
          implementorsByInterface.get(type.name) ?? [],
          rootDirectoryByTypeName,
        ),
      );
    } else if (isUnionType(type)) {
      concepts.push(unionConcept(type, path, pathFor, rootDirectoryByTypeName));
    } else if (isInputObjectType(type)) {
      concepts.push(inputConcept(type, path, pathFor, rootDirectoryByTypeName));
    }
  }
```

Replace the directives loop:

```ts
  for (const directive of schema.getDirectives()) {
    const path = pathFor({ kind: "directive", name: directive.name });
    if (path === null) {
      continue;
    }
    concepts.push(directiveConcept(directive, path, pathFor, rootDirectoryByTypeName));
  }
```

Give `directiveConcept` the path instead of recomputing it, and drop `isBuiltIn`:

```ts
function directiveConcept(
  directive: GraphQLDirective,
  path: string,
  pathFor: (element: ElementName) => string | null,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): DirectiveDefinitionNode {
  return {
    kind: "directive",
    name: directive.name,
    path,
    description: normalizeDescription(directive.description),
    appliedDirectives: [],
    locations: [...directive.locations].sort(),
    args: byName(directive.args).map((arg) => argNode(arg, pathFor, rootDirectoryByTypeName)),
    isRepeatable: directive.isRepeatable,
  };
}
```

Drop `isBuiltIn` from `scalarConcept`:

```ts
function scalarConcept(
  type: GraphQLScalarType,
  path: string,
  pathFor: (element: ElementName) => string | null,
): ScalarTypeNode {
  return {
    kind: "scalar",
    name: type.name,
    path,
    description: normalizeDescription(type.description),
    appliedDirectives: appliedDirectivesOf(type, pathFor),
    specifiedByUrl: type.specifiedByURL ?? null,
  };
}
```

Widen every remaining `pathFor` parameter annotation in the file — in `appliedDirectivesOf`, `toTypeRef`, `argNode`, `inputFieldNode`, `fieldNode`, `enumConcept`, `objectConcept`, `interfaceConcept`, `unionConcept`, `inputConcept` — from `(element: ElementName) => string` to `(element: ElementName) => string | null`. No body changes: `TypeRef.path` and `AppliedDirective.path` accept null as of Task 2.

- [ ] **Step 4: Remove the now-unreachable `isBuiltIn`**

In `src/model/ir.ts`, delete `readonly isBuiltIn: boolean;` from both `ScalarTypeNode` and `DirectiveDefinitionNode`. A built-in node can no longer reach the IR, so the flag has no readers.

In `src/emit/render/body.ts`, `renderScalarBody` loses its first branch:

```ts
export function renderScalarBody(node: ScalarTypeNode): string {
  const note =
    node.specifiedByUrl === null
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
```

Then clean up every reader. There are three distinct cases — do not treat them alike.

**a. Delete two whole tests.** Both assert behaviour that no longer exists, and Step 1's replacements cover the same ground:

- `src/model/project.test.ts` — `it("emits built-in scalars as concepts", ...)`, which asserts a concept at `types/String.md`.
- `src/model/project.test.ts` — `it("emits built-in directives flagged as such", ...)`, which asserts concepts at `directives/deprecated.md` and `directives/skip.md`.
- `src/emit/render/body.test.ts` — `it("notes a built-in scalar", ...)` (around line 279), which asserts `"Built-in GraphQL scalar."`.

**b. Delete a single assertion line, keeping the test.** These tests are about something else and merely check the flag in passing:

- `src/model/project.test.ts` — `expect(scalar.isBuiltIn).toBe(false);` in `"emits custom scalars with their specifiedBy url"`.
- `src/model/project.test.ts` — `expect(auth.isBuiltIn).toBe(false);` in `"emits directive definitions with locations and args"`.

**c. Delete the `isBuiltIn:` line from fixture literals**, leaving everything else intact: `src/emit/render/resource.test.ts:38`, `src/emit/render/concept.test.ts:15`, `src/emit/bundle.test.ts:206`, `src/reconcile/plan.test.ts:181`, and `src/emit/render/body.test.ts:271,350,410,426`.

After this step, `grep -rn "isBuiltIn" src/` must return nothing.

- [ ] **Step 5: State the convention on the root index**

In `src/emit/bundle.ts`, add below `KIND_SECTION_LABELS`:

```ts
/**
 * `GOAL-7.3` permits omitting links to built-in scalars "by a documented
 * convention"; this is that document, on the bundle's own entry point, where an
 * agent walking the tree reads it before it can notice anything missing. A
 * constant rather than a per-schema list: a fixed string is trivially
 * deterministic (`GOAL-8.1`), and the convention holds of the bundle whether or
 * not a given schema happens to exercise it.
 */
export const SPEC_DEFINED_NOTE =
  "Built-in scalars (`Boolean`, `Float`, `ID`, `Int`, `String`) and spec directives " +
  "(`@deprecated`, `@include`, `@oneOf`, `@skip`, `@specifiedBy`) have no concept files: " +
  "they are defined by the GraphQL specification and appear as plain code, not links.";
```

Then change the index write at the end of the per-directory loop:

```ts
    bundle.set(
      indexPath,
      renderDirectoryIndex(
        title,
        sections,
        dir === "." ? { frontmatter, note: SPEC_DEFINED_NOTE } : { frontmatter },
      ),
    );
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/`

Expected: PASS. `pnpm run typecheck` must also pass — if a `pathFor` annotation was missed in Step 3, it fails here with "Type 'string | null' is not assignable to type 'string'".

- [ ] **Step 7: Update the example-bundle expectation**

`test/example-bundle.test.ts` asserts `expect(result.added).toHaveLength(43)` for the v1 schema. The shop schema uses four built-in scalars (`Boolean`, `ID`, `Int`, `String` — it never mentions `Float`) and carries all five spec directives, so nine fewer concepts are added.

Change it to:

```ts
    expect(result.added).toHaveLength(34);
```

Run: `pnpm exec vitest run test/example-bundle.test.ts`

Expected: the count assertion passes; the byte-for-byte golden comparison still fails, because `okf/shop-api/` on disk is the old bundle. That is the next step.

- [ ] **Step 8: Regenerate the shop-api golden**

`okf/shop-api/` is rebuilt from scratch by the test, replaying v1 → v2 → v3 with pinned timestamps, so it takes the new output from its first historical run onward — `log.md` included. It therefore shows the emitter's new behaviour and never exercises the prune pre-pass; `okf/countries-api/` in Task 8 is what proves that.

```bash
UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts
```

- [ ] **Step 9: Inspect the regenerated bundle before trusting it**

```bash
git status --short okf/shop-api
```

Expected: nine deletions — `types/Boolean.md`, `types/ID.md`, `types/Int.md`, `types/String.md`, `directives/deprecated.md`, `directives/include.md`, `directives/oneOf.md`, `directives/skip.md`, `directives/specifiedBy.md` — plus modifications to `index.md`, `types/index.md`, `directives/index.md`, and every concept that referenced a built-in.

Then confirm the three headline changes by eye:

```bash
git diff okf/shop-api/index.md
grep -n '`ID!`' okf/shop-api/types/Product.md
grep -n 'oneOf' okf/shop-api/types/PaymentInput.md
```

Expected: the root index carries the convention note; `Product.md` shows `` | `id` | `ID!` | `` with no link; `PaymentInput.md` shows ``Directives: `@oneOf`.``

- [ ] **Step 10: Measure the saving for the PR description**

```bash
git stash && du -sb okf/shop-api && git stash pop && du -sb okf/shop-api
```

Record both numbers — the issue claims 7,289 bytes / 16%, and the PR should report what actually happened.

- [ ] **Step 11: Full verification**

```bash
pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run knip
```

Expected: all pass. knip must report no unused exports — if it flags `isBuiltIn` anywhere, a definition was missed in Step 4.

- [ ] **Step 12: Commit**

```bash
git add -A src okf/shop-api test/example-bundle.test.ts && git commit -m "feat: stop emitting concept files for spec-defined elements (#23)"
```

---

### Task 5: The prune pre-pass

A standalone module with no callers yet, mirroring `relayout.ts` and `migrate.ts`. Wiring happens in Task 6, so this commit changes no behaviour.

**One corner is deliberately not handled.** A bundle whose schema declared `type id` alongside built-in `ID` stored them as `types/ID-<hash>.md` and `types/id-<hash>.md`, neither of which matches a derived prune path. The built-in is tombstoned rather than deleted, and `id` moves to the now-clean `types/id.md`. That result is correct and lossless, just untidy — see the spec's "Known behaviour: the case-fold corner". Do not add a special case for it.

**Files:**
- Create: `src/reconcile/prune.ts`
- Create: `src/reconcile/prune.test.ts`
- Modify: `src/reconcile/parse.ts`
- Modify: `src/reconcile/relayout.ts:58-60`

**Interfaces:**
- Consumes: `SPEC_DEFINED_PATHS` (Task 1); `splitFile` from `./parse.js`.
- Produces:
  - `hasHumanText(human: string): boolean` exported from `src/reconcile/parse.ts`
  - `pruneBundle(existing: ReadonlyMap<string, string>): PruneResult` where `PruneResult = { files: ReadonlyMap<string, string>; pruned: readonly string[] }`

- [ ] **Step 1: Write the failing tests**

Create `src/reconcile/prune.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleFile, EMPTY_HUMAN, GENERATED_HINT, HUMAN_HINT } from "../emit/render/seam.js";
import { pruneBundle } from "./prune.js";

/** A spec-defined concept file as a pre-#23 release wrote it. */
function builtInFile(title: string, human = EMPTY_HUMAN): string {
  return assembleFile(
    {
      preamble: `---\ntype: "GraphQL Scalar Type"\ntitle: ${JSON.stringify(title)}\n---\n\n`,
      generated: `\n${GENERATED_HINT}\n\n# ${title}\n\nBuilt-in GraphQL scalar.\n\n`,
    },
    human,
  );
}

describe("pruneBundle", () => {
  it("deletes every spec-defined concept file the bundle holds", () => {
    const existing = new Map([
      ["types/ID.md", builtInFile("ID")],
      ["types/String.md", builtInFile("String")],
      ["directives/skip.md", builtInFile("skip")],
      ["types/Product.md", builtInFile("Product")],
    ]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual([
      "directives/skip.md",
      "types/ID.md",
      "types/String.md",
    ]);
    expect(result.files.has("types/ID.md")).toBe(false);
    expect(result.files.has("types/Product.md")).toBe(true);
  });

  it("leaves the input map untouched", () => {
    const existing = new Map([["types/ID.md", builtInFile("ID")]]);

    pruneBundle(existing);

    expect(existing.has("types/ID.md")).toBe(true);
  });

  it("keeps a file carrying human-authored text", () => {
    const existing = new Map([
      ["types/ID.md", builtInFile("ID", `\n\n${HUMAN_HINT}\n\nWe mint these as UUIDv7.\n`)],
    ]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual([]);
    expect(result.files.has("types/ID.md")).toBe(true);
  });

  it("never touches a file graphql-okf does not own", () => {
    const existing = new Map([["types/ID.md", "# ID\n\nSomeone's own notes.\n"]]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual([]);
    expect(result.files.has("types/ID.md")).toBe(true);
  });

  it("prunes a built-in an intermediate release already tombstoned", () => {
    const tombstoned = assembleFile(
      {
        preamble: `---\ntitle: "ID"\ngraphql_okf_status: "removed"\n---\n\n`,
        generated: "\n> **Removed.**\n\n# Last known definition\n\n# ID\n\n",
      },
      EMPTY_HUMAN,
    );

    const result = pruneBundle(new Map([["types/ID.md", tombstoned]]));

    expect([...result.pruned]).toEqual(["types/ID.md"]);
  });

  it("is a no-op on a bundle that has already been pruned", () => {
    const existing = new Map([["types/Product.md", builtInFile("Product")]]);

    const result = pruneBundle(existing);

    expect([...result.pruned]).toEqual([]);
    expect([...result.files]).toEqual([...existing]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/reconcile/prune.test.ts`

Expected: FAIL — `./prune.js` does not exist.

- [ ] **Step 3: Move `hasHumanText` to `parse.ts`**

Both pre-passes need it, so it moves to the module that already owns the split. In `src/reconcile/parse.ts`, add `HUMAN_HINT` to the existing `../emit/render/seam.js` import and append:

```ts
/**
 * Whether a file's human region holds anything the machine did not put there.
 * The single predicate every pre-pass uses to decide whether a file is safe to
 * delete: a human's words are never destroyed, however the generated region
 * looks (GOAL-8.3).
 */
export function hasHumanText(human: string): boolean {
  return human.replace(HUMAN_HINT, "").trim() !== "";
}
```

In `src/reconcile/relayout.ts`, delete the local `hasHumanText` definition (lines 58–60) and add `hasHumanText` to the existing `./parse.js` import. If `HUMAN_HINT` is now unused in `relayout.ts`, drop it from the `../emit/render/seam.js` import there.

- [ ] **Step 4: Write the pre-pass**

Create `src/reconcile/prune.ts`:

```ts
import { SPEC_DEFINED_PATHS } from "../model/naming.js";
import { hasHumanText, splitFile } from "./parse.js";

export interface PruneResult {
  readonly files: ReadonlyMap<string, string>;
  /** Paths removed from the bundle, sorted — the plan's action order must not depend on map order. */
  readonly pruned: readonly string[];
}

/**
 * Deletes the concept files of spec-defined elements from an existing bundle, in
 * memory, before reconciliation sees it. A pre-pass rather than the normal
 * removal path on purpose: reconcile would tombstone these files, and a tombstone
 * is *larger* than the file it replaces — it keeps the last known definition plus
 * a removal banner — which is the exact opposite of what issue #23 is for.
 *
 * Runs after `relayoutBundle`, which is what turns a legacy `types/scalars/ID.md`
 * into the flat `types/ID.md` these paths are stated in, and before
 * `migrateBundle`, so no frontmatter is converted on a file about to disappear.
 *
 * Deletes only files graphql-okf owns and only when nobody has written into them.
 * A file failing either guard stays, is absent from the IR, and is tombstoned by
 * the normal path — the human's words survive under a removal banner rather than
 * vanishing.
 */
export function pruneBundle(existing: ReadonlyMap<string, string>): PruneResult {
  const files = new Map(existing);
  const pruned: string[] = [];

  // SPEC_DEFINED_PATHS is sorted, so `pruned` comes out sorted for free.
  for (const path of SPEC_DEFINED_PATHS) {
    const text = existing.get(path);
    if (text === undefined) {
      continue;
    }
    // None of these paths is an index, so "splits" and "is owned" are the same
    // question here — `isOwnedFile` would just ask it twice.
    const split = splitFile(text, path);
    if (split === null || hasHumanText(split.human)) {
      continue;
    }
    files.delete(path);
    pruned.push(path);
  }

  return { files, pruned };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/reconcile/prune.test.ts src/reconcile/relayout.test.ts`

Expected: PASS, both files. `relayout.test.ts` must be untouched by the `hasHumanText` move.

- [ ] **Step 6: Verify nothing else moved**

Run: `pnpm test && pnpm run typecheck`

Expected: PASS. `pruneBundle` has no callers yet, so no bundle changes.

- [ ] **Step 7: Commit**

```bash
git add src/reconcile/prune.ts src/reconcile/prune.test.ts src/reconcile/parse.ts src/reconcile/relayout.ts && git commit -m "feat(reconcile): add the prune pre-pass (#23)"
```

---

### Task 6: Wire prune into reconciliation

The pre-pass starts running, its deletes reach disk, and the run says what it did.

**Files:**
- Modify: `src/reconcile/plan.ts`
- Modify: `src/reconcile/log.ts`
- Modify: `src/index.ts:20-31,54-63`
- Test: `src/reconcile/plan.test.ts`, `src/reconcile/log.test.ts`

**Interfaces:**
- Consumes: `pruneBundle`, `PruneResult` (Task 5).
- Produces: `BundlePlan.migrated.pruned: readonly string[]`; `SyncResult.pruned: readonly string[]`; a `delete` action per pruned path.

- [ ] **Step 1: Write the failing tests**

Add to `src/reconcile/plan.test.ts`:

```ts
describe("pruning spec-defined concepts", () => {
  it("plans a delete, not a tombstone, and reports it", () => {
    const ir: SchemaIr = {
      resource: "https://x.example/graphql",
      origin: "sdl",
      concepts: [
        {
          kind: "object",
          name: "Product",
          path: "types/Product.md",
          description: null,
          appliedDirectives: [],
          interfaces: [],
          fields: [],
        },
      ],
    };
    const existing = new Map([
      ["index.md", "# API interface\n"],
      [
        "types/ID.md",
        assembleFile(
          { preamble: '---\ntitle: "ID"\n---\n\n', generated: "\n# ID\n\n" },
          EMPTY_HUMAN,
        ),
      ],
    ]);

    const plan = reconcile(ir, existing, emitContext("0.2", "2026-08-03T00:00:00.000Z"));

    expect(plan.migrated.pruned).toEqual(["types/ID.md"]);
    expect(plan.actions).toContainEqual({ kind: "delete", path: "types/ID.md" });
    expect(plan.actions.some((action) => action.kind === "tombstone")).toBe(false);
    expect(plan.removed).toEqual([]);
  });
});
```

Add to `src/reconcile/log.test.ts`:

```ts
describe("the prune migration line", () => {
  it("reports the count and makes the run loggable", () => {
    const plan = {
      actions: [],
      added: [],
      changed: [],
      removed: [],
      unchanged: 0,
      indexes: 0,
      migrated: { frontmatter: [], relocated: [], pruned: ["types/ID.md", "types/Int.md"] },
    } satisfies BundlePlan;

    expect(hasLoggableChanges(plan)).toBe(true);
    expect(renderRunBlock(plan, "2026-08-03T09:00:00.000Z")).toContain(
      "* Built-in scalars and spec directives: 2 concepts no longer emitted (GOAL-7.3).",
    );
  });
});
```

Every other construction of a `BundlePlan` literal in these two test files needs `pruned: []` added to its `migrated` object, or it will not typecheck.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/reconcile/plan.test.ts src/reconcile/log.test.ts`

Expected: FAIL — `migrated.pruned` does not exist on `BundlePlan`.

- [ ] **Step 3: Run prune in the chain and carry its result**

In `src/reconcile/plan.ts`, add the import:

```ts
import { pruneBundle } from "./prune.js";
```

Extend `BundlePlan.migrated` with a doc line matching the two beside it:

```ts
  readonly migrated: {
    readonly frontmatter: readonly string[];
    readonly relocated: readonly string[];
    /** `pruned` — spec-defined concepts deleted because they are no longer emitted (#23). */
    readonly pruned: readonly string[];
  };
```

Insert the pre-pass between relayout and migrate — the order the spec fixes:

```ts
  const relayout = relayoutBundle(existing);
  const pruned = pruneBundle(relayout.files);
  const { files, migrated } = migrateBundle(pruned.files, ctx);
  const owned = ownedFiles(files);
```

Emit the deletes alongside relayout's, and report the paths. Replace the `relayout.deletes` loop and the `return`:

```ts
  for (const path of [...relayout.deletes, ...pruned.pruned]) {
    actions.push({ kind: "delete", path });
  }

  return {
    actions,
    added,
    changed,
    removed,
    unchanged,
    indexes,
    migrated: {
      frontmatter: migrated,
      relocated: relayout.moves.map((move) => move.to),
      pruned: pruned.pruned,
    },
  };
```

Both source arrays are internally sorted, so the action order stays deterministic.

- [ ] **Step 4: Report it in the log**

In `src/reconcile/log.ts`, add the count to `hasLoggableChanges`:

```ts
export function hasLoggableChanges(plan: BundlePlan): boolean {
  return (
    plan.added.length +
      plan.changed.length +
      plan.removed.length +
      plan.migrated.frontmatter.length +
      plan.migrated.relocated.length +
      plan.migrated.pruned.length >
    0
  );
}
```

And a third line in `migrationGroup`, after the relocated one:

```ts
  if (plan.migrated.pruned.length > 0) {
    lines.push(
      `* Built-in scalars and spec directives: ${plan.migrated.pruned.length} concepts no longer emitted (GOAL-7.3).`,
    );
  }
```

- [ ] **Step 5: Expose it on the public result**

In `src/index.ts`, add the field to `SyncResult` beside `relocated`:

```ts
  /** Spec-defined concepts this run deleted because they are no longer emitted. */
  readonly pruned: readonly string[];
```

and to the returned object:

```ts
    pruned: [...plan.migrated.pruned],
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/`

Expected: PASS.

- [ ] **Step 7: Verify the determinism guarantee still holds**

Run: `pnpm test`

Expected: PASS — in particular `test/reconcile.test.ts`'s "is a byte-for-byte no-op with no new log entry". `pruned` now feeds `hasLoggableChanges`, so a bundle with nothing to prune must still produce an empty list.

- [ ] **Step 8: Commit**

```bash
git add src/reconcile/plan.ts src/reconcile/log.ts src/index.ts src/reconcile/plan.test.ts src/reconcile/log.test.ts && git commit -m "feat(reconcile): prune spec-defined concepts on an existing bundle (#23)"
```

---

### Task 7: Prove the migration end to end

The load-bearing test. Neither committed bundle proves this in CI: `okf/shop-api/` is rebuilt from scratch and never reaches the prune path, and `okf/countries-api/` passes through it exactly once, in this PR, and needs the network.

**Files:**
- Modify: `test/reconcile.test.ts`

**Interfaces:**
- Consumes: `syncOkfBundle` from `../src/index.js`; `readTree`, `writeTree` from `./support/bundle-tree.js`; `assembleFile`, `EMPTY_HUMAN`, `GENERATED_HINT`, `HUMAN_HINT` from `../src/emit/render/seam.js`.
- Produces: no code.

- [ ] **Step 1: Write the failing tests**

Add to `test/reconcile.test.ts`. The fixture is built from the real seam helpers rather than hand-written Markdown, so it cannot drift if the marker format ever changes.

```ts
/** A spec-defined concept file as a pre-#23 release wrote it. */
function builtInFile(title: string, kindLabel: string, human = EMPTY_HUMAN): string {
  return assembleFile(
    {
      preamble: `---\ntype: ${JSON.stringify(kindLabel)}\ntitle: ${JSON.stringify(title)}\n---\n\n`,
      generated: `\n${GENERATED_HINT}\n\n# ${title}\n\nSpecification prose.\n\n`,
    },
    human,
  );
}

describe("a bundle written before spec-defined concepts were pruned", () => {
  it("deletes them outright rather than tombstoning them", async () => {
    const outDir = await freshBundle(BASE);
    const tree = await readTree(outDir);
    tree.set("types/ID.md", builtInFile("ID", "GraphQL Scalar Type"));
    tree.set("directives/skip.md", builtInFile("skip", "GraphQL Directive"));
    await writeTree(outDir, tree);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect([...result.pruned].sort()).toEqual(["directives/skip.md", "types/ID.md"]);
    expect(result.removed).toEqual([]);

    const after = await readTree(outDir);
    expect(after.has("types/ID.md")).toBe(false);
    expect(after.has("directives/skip.md")).toBe(false);
    expect(after.get("log.md")).toContain(
      "* Built-in scalars and spec directives: 2 concepts no longer emitted (GOAL-7.3).",
    );
  });

  it("finds the built-in under the pre-flatten layout too", async () => {
    const outDir = await freshBundle(BASE);
    const tree = await readTree(outDir);
    tree.set("types/scalars/ID.md", builtInFile("ID", "GraphQL Scalar Type"));
    await writeTree(outDir, tree);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect([...result.pruned]).toEqual(["types/ID.md"]);

    const after = await readTree(outDir);
    expect(after.has("types/scalars/ID.md")).toBe(false);
    expect(after.has("types/ID.md")).toBe(false);
  });

  it("keeps a built-in someone wrote into, as a tombstone", async () => {
    const outDir = await freshBundle(BASE);
    const tree = await readTree(outDir);
    tree.set(
      "types/ID.md",
      builtInFile("ID", "GraphQL Scalar Type", `\n\n${HUMAN_HINT}\n\nWe mint UUIDv7 here.\n`),
    );
    await writeTree(outDir, tree);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });

    expect(result.pruned).toEqual([]);
    expect(result.removed).toEqual(["types/ID.md"]);

    const survivor = (await readTree(outDir)).get("types/ID.md") ?? "";
    expect(survivor).toContain("We mint UUIDv7 here.");
    expect(survivor).toContain("**Removed.**");
  });

  it("is a byte-for-byte no-op on the next run", async () => {
    const outDir = await freshBundle(BASE);
    const tree = await readTree(outDir);
    tree.set("types/ID.md", builtInFile("ID", "GraphQL Scalar Type"));
    await writeTree(outDir, tree);
    await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T2 });
    const before = await readTree(outDir);

    const result = await syncOkfBundle({ source: { kind: "sdl", path: BASE }, outDir, now: T3 });

    expect(result.pruned).toEqual([]);
    expect(await readTree(outDir)).toEqual(before);
  });
});
```

Extend the file's existing `../src/emit/render/seam.js` import (or add one) to cover `assembleFile`, `EMPTY_HUMAN`, `GENERATED_HINT`, `HUMAN_HINT`.

- [ ] **Step 2: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/reconcile.test.ts`

Expected: PASS. This task adds no production code — Tasks 5 and 6 built the behaviour, and this is the proof it composes correctly with relayout, with tombstoning, and with the no-op guarantee. If the second test fails, prune is running before relayout instead of after.

- [ ] **Step 3: Full verification**

```bash
pnpm run coverage && pnpm run lint && pnpm run typecheck
```

Expected: all pass, coverage above lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.

- [ ] **Step 4: Commit**

```bash
git add test/reconcile.test.ts && git commit -m "test: prove spec-defined concepts are pruned, not tombstoned (#23)"
```

---

### Task 8: Document the convention, then migrate countries-api

The `GOAL-7.3` obligation — "documented and consistent" — and the one committed bundle that actually runs the pre-pass.

**Files:**
- Modify: `README.md`
- Modify: `docs/northstar-specs/GOAL-M1.md`
- Regenerate: `okf/countries-api/**`

**Interfaces:**
- Consumes: the built CLI at `dist/cli.mjs`.
- Produces: no code.

- [ ] **Step 1: Document the convention in the README**

Add a subsection to `README.md` at the end of the "How it works" section, immediately before the `## Milestones` heading:

```markdown
### Built-in scalars and spec directives

The bundle describes *your* schema, not GraphQL itself. The five built-in scalars
(`Boolean`, `Float`, `ID`, `Int`, `String`) and the five spec directives
(`@deprecated`, `@include`, `@oneOf`, `@skip`, `@specifiedBy`) therefore get no
concept files, and references to them render as plain code — `` `ID!` `` rather
than a link. Their meaning comes from the GraphQL specification, which every
consumer of the bundle already has; a page restating it is bytes an agent pays
for and a link inviting a turn spent re-reading what it knew.

Everything schema-specific is unaffected: custom scalars keep their files
(including their `@specifiedBy` URL), custom directives keep theirs, and an
*applied* spec directive still appears — `PaymentInput` renders
``Directives: `@oneOf`.`` — because which types carry it is a fact about your
schema. `OKF §6.1` and this project's `GOAL-7.3` both allow the omission provided
the convention is consistent and documented; the bundle's own root `index.md`
states it too, so an agent traversing the tree reads it before it can notice
anything missing.
```

- [ ] **Step 2: Document the prune in the migration section**

In the `#### Migrating a v0.1 bundle` section of `README.md`, add a paragraph after the sample `**Migrated**` log block:

```markdown
A bundle written before this convention has its built-in concept files removed on
the next run — deleted outright rather than marked removed, since a tombstone is
larger than the page it replaces. A file you have written into is never deleted:
it keeps your text and is marked removed like any other retired concept. The run
records the count:

    **Migrated**

    * Built-in scalars and spec directives: 10 concepts no longer emitted (GOAL-7.3).
```

- [ ] **Step 3: Record the reading in the northstar spec**

`GOAL-7.3` already permits this and does not change. `GOAL-4.1` requires the concept model to represent "scalar types (built-in and custom)", and the reading belongs on record. Add a sub-bullet under `GOAL-4.1` in `docs/northstar-specs/GOAL-M1.md`, matching the style `GOAL-4.3` already uses for issue #22:

```markdown
  - Recorded per issue #23: representation in the model does not imply a concept
    file. The five specified scalars and five specified directives are
    represented as *references* — every field naming one carries its name and
    wrappers — but get no concept file and are never link targets, under the
    convention `GOAL-7.3` permits. Custom scalars and custom directives are
    unaffected.
```

- [ ] **Step 4: Verify the docs make no claim the code contradicts**

Run: `pnpm run lint`

Then re-read the two README additions against `okf/shop-api/index.md` and `okf/shop-api/types/PaymentInput.md` as regenerated in Task 4. The `` `@oneOf` `` example must match the file byte for byte.

- [ ] **Step 5: Build the CLI**

```bash
pnpm run build
```

- [ ] **Step 6: Reconcile the committed countries-api bundle in place**

Do **not** delete the directory first. Reconciling in place is the entire point — it is what exercises the prune pre-pass on a real bundle, and a fresh generation would discard the bundle's `log.md` history. This bundle uses all five built-in scalars, `Float` included, so it prunes ten files where shop-api would have pruned nine.

```bash
node dist/cli.mjs https://countries.trevorblades.com/graphql --out okf/countries-api
```

If the endpoint is unreachable, stop and say so in the PR rather than hand-editing the bundle. Hand-edited generated output is exactly what `M1/GOAL-4.5` exists to prevent.

- [ ] **Step 7: Inspect the diff before trusting it**

```bash
git status --short okf/countries-api
```

Expected: ten deletions — `types/Boolean.md`, `types/Float.md`, `types/ID.md`, `types/Int.md`, `types/String.md`, `directives/deprecated.md`, `directives/include.md`, `directives/oneOf.md`, `directives/skip.md`, `directives/specifiedBy.md` — plus modified indexes, modified concepts, and a new `log.md` entry.

```bash
head -20 okf/countries-api/log.md
```

Expected: a run block containing
`* Built-in scalars and spec directives: 10 concepts no longer emitted (GOAL-7.3).`

This log line is the only place in the repository where the pre-pass's work is visible on a real bundle. Confirm it is there before committing.

- [ ] **Step 8: Final verification**

```bash
pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add README.md docs/northstar-specs/GOAL-M1.md okf/countries-api && git commit -m "docs: document the spec-defined concept convention, migrate countries-api (#23)"
```

- [ ] **Step 10: Open the PR**

Reference issue #23 and the spec. Report the measured byte reduction from Task 4 Step 10 against the issue's 7,289 / 16% claim, and note that `okf/countries-api/log.md` is where the migration is visible.

---

## Verification

Every check CI enforces, in one run:

```bash
pnpm install --frozen-lockfile && pnpm run coverage && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Behavioural guarantees this plan must leave intact:

- Re-running against an unchanged schema is byte-identical with no `log.md` entry (`GOAL-8.1`) — `test/reconcile.test.ts`, and again after a prune in Task 7 Step 1.
- Every internal link resolves to a file the bundle contains (`GOAL-7.2`) — `src/conformance.test.ts:120`, unchanged and still passing.
- No bundle path is a spec-defined concept path (`GOAL-7.3`) — the assertion added in Task 4.
- A human's text is never destroyed (`GOAL-8.3`) — Task 5 Step 1 and Task 7 Step 1.
