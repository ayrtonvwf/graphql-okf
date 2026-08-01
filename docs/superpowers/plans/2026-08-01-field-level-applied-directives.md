# Field-Level Applied Directives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface applied directives on fields, arguments, input fields, and enum values in the emitted markdown, so a field-level `@auth` gate is visible in the bundle instead of silently absent.

**Architecture:** The IR already carries `appliedDirectives` on every one of those node kinds, already sorts them, and already excludes `@deprecated`/`@specifiedBy`. Only `src/emit/render/body.ts` drops them: `descriptionCell()` ignores the data. It gains two parameters — the row's applied directives and the enclosing concept's path — and appends them to the cell after the existing `(deprecated: …)` suffix, reusing the same `appliedInline()` formatter the concept-level `Directives:` line uses. Nothing in `src/model/` changes.

**Tech Stack:** TypeScript (strict, ESM), Vitest, Biome, pnpm. Node 24 floor.

Spec: `docs/superpowers/specs/2026-08-01-field-level-applied-directives-design.md`.
Issue: [#15](https://github.com/ayrtonvwf/graphql-okf/issues/15).

## Global Constraints

- **Determinism is load-bearing** (`M1/GOAL-8.1`, `M1/NG-6`). Introduce no ordering of your own — directive order and each directive's argument order already come sorted from `appliedDirectivesOf` in `src/model/project.ts:95`. No wall-clock reads, no runtime model calls.
- **A row with no applied directives must render byte-identically to today.** This is what keeps the regenerated bundle diff limited to rows that gained information.
- **`@deprecated` and `@specifiedBy` must never render as applied directives.** They are already filtered by `MODELED_AS_FIELDS` (`src/model/project.ts:64`); do not remove that filter, and do not add a second deprecation path.
- **Do not change `src/model/`.** The IR is correct. If you find yourself editing it, stop — you have misread the bug.
- **Do not touch `okf/countries-api/`.** It is introspection-sourced, carries no applied directives, and is out of scope.
- **Do not run anything in `bench/`.** It makes paid model calls and never runs in CI.
- Coverage thresholds are the merge gate: lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/emit/render/body.ts` | Modify | `descriptionCell` composition; `appliedInline` cell mode; four table call sites |
| `src/emit/render/body.test.ts` | Modify | All new tests |
| `okf/shop-api/**` | Regenerate | Committed demo bundle, asserted byte-for-byte by `test/example-bundle.test.ts:165` |

No new files. `src/emit/render/text.ts` is consumed unchanged (`cell()` already collapses newlines and escapes pipes).

## Reference: the current code

`src/emit/render/body.ts`, the two functions you will change:

```typescript
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

function descriptionCell(description: string | null, deprecation: Deprecation | null): string {
  const text = description === null ? "" : cell(description);
  const suffix = deprecatedSuffix(deprecation);
  return `${text}${suffix}`.trim();
}
```

`descriptionCell` has exactly four callers: `fieldsTable` (line 82), `argumentsTable` (line 93), the input-fields table inside `inputFieldsSchema` (line 133), and the enum-values table inside `renderEnumBody` (line 203).

---

### Task 1: Field-level directives in the object/interface fields table

This is the issue's reproduction case. It also establishes the cell composition every later task reuses.

**Files:**
- Modify: `src/emit/render/body.ts:63-67` (`descriptionCell`), `src/emit/render/body.ts:82-91` (`fieldsTable`)
- Test: `src/emit/render/body.test.ts`

**Interfaces:**
- Consumes: `AppliedDirective` from `../../model/ir.js` (already imported in `body.ts`), shape `{ name: string; path: string; args: readonly { name: string; value: string }[] }`. `appliedInline(applied, fromPath)` and `cell(text)` as they exist today.
- Produces: `descriptionCell(description: string | null, deprecation: Deprecation | null, applied: readonly AppliedDirective[], fromPath: string): string`. Tasks 2 and 3 depend on this exact signature and parameter order.

- [ ] **Step 1: Write the failing tests**

Add both tests to `src/emit/render/body.test.ts` inside the existing `describe("renderObjectBody", …)` block (it ends at line 107), after the `"renders an applied directive's arguments inline"` test. They reuse the module-level `country` fixture and `scalarRef` helper already defined at the top of the file.

```typescript
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
```

Why `../../directives/auth.md`: `relLink` resolves from the concept's own path, `types/objects/Country.md`, so the link climbs two directories. This matches the existing concept-level assertion at line 98.

The spec's "no-op guard" obligation needs no new test — it is discharged by existing assertions that pin directive-free cells byte-for-byte: `body.test.ts:74`, `:76`, `:133`, `:180-182`, `:208`, `:589`, `:604`. Those must keep passing untouched.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/body.test.ts -t "applied directives in its description cell"
```

Expected: FAIL. The received body contains `| \`email\` | [\`EmailAddress!\`](../scalars/EmailAddress.md) |  |` — an empty description cell, no `@auth`.

- [ ] **Step 3: Widen `descriptionCell` and wire up `fieldsTable`**

Replace `descriptionCell` (`src/emit/render/body.ts:63-67`) with:

```typescript
function descriptionCell(
  description: string | null,
  deprecation: Deprecation | null,
  applied: readonly AppliedDirective[],
  fromPath: string,
): string {
  const parts = [
    description === null ? "" : cell(description),
    deprecatedSuffix(deprecation).trim(),
    appliedInline(applied, fromPath),
  ];
  return parts.filter((part) => part !== "").join(" ");
}
```

`deprecatedSuffix` returns a leading-space-prefixed string (`" (deprecated: …)"`); `.trim()` removes that space so the join owns all spacing. With no applied directives the third part is `""` and the result is identical to the old `` `${text}${suffix}`.trim() ``.

Then update `fieldsTable` (`src/emit/render/body.ts:82-91`):

```typescript
function fieldsTable(fields: readonly FieldNode[], fromPath: string): string[] {
  return table(
    ["Field", "Type", "Description"],
    fields.map((field) => [
      `\`${field.name}\``,
      typeLink(fromPath, field.type),
      descriptionCell(field.description, field.deprecation, field.appliedDirectives, fromPath),
    ]),
  );
}
```

The other three call sites will not compile yet — that is expected and Task 2 fixes them. To keep this task's test run green, pass the empty case at each of them now: in `argumentsTable` (line 93) use `descriptionCell(arg.description, arg.deprecation, [], fromPath)`, in `inputFieldsSchema` (line 133) use `descriptionCell(value.description, value.deprecation, [], fromPath)`, and in `renderEnumBody` (line 203) use `descriptionCell(value.description, value.deprecation, [], node.path)`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/body.test.ts
```

Expected: PASS, all tests in the file, including the pre-existing directive-free cell assertions.

- [ ] **Step 5: Commit**

```bash
git add src/emit/render/body.ts src/emit/render/body.test.ts
git commit -m "fix: render applied directives on object and interface fields"
```

---

### Task 2: Extend to arguments, input fields, and enum values

`fieldsTable` covers object and interface fields. The remaining three tables still pass `[]`. This task makes them pass real data.

**Files:**
- Modify: `src/emit/render/body.ts` — `argumentsTable` (line 93), `inputFieldsSchema` (line 133), `renderEnumBody` (line 203)
- Test: `src/emit/render/body.test.ts`

**Interfaces:**
- Consumes: `descriptionCell(description, deprecation, applied, fromPath)` from Task 1.
- Produces: nothing new. `InputValueNode` (arguments and input fields) and enum value nodes each carry `appliedDirectives: readonly AppliedDirective[]`, defined in `src/model/ir.ts`.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to the end of `src/emit/render/body.test.ts`:

```typescript
describe("applied directives on non-field rows", () => {
  const auth = {
    name: "auth",
    path: "directives/auth.md",
    args: [{ name: "requires", value: "STAFF" }],
  };

  it("renders an argument's applied directives", () => {
    const body = renderObjectBody({
      kind: "object",
      name: "Query",
      path: "types/objects/Query.md",
      description: null,
      appliedDirectives: [],
      interfaces: [],
      fields: [
        {
          name: "orders",
          description: null,
          type: { wrappers: [], name: "Order", path: "types/objects/Order.md" },
          args: [
            {
              name: "customerId",
              description: "Whose orders.",
              type: { wrappers: [], name: "ID", path: "types/scalars/ID.md" },
              defaultValue: null,
              deprecation: null,
              appliedDirectives: [auth],
            },
          ],
          deprecation: null,
          appliedDirectives: [],
        },
      ],
    });

    expect(body).toContain(
      "| `customerId` | [`ID`](../scalars/ID.md) |  | Whose orders. [`@auth`](../../directives/auth.md)(requires: STAFF) |",
    );
  });

  it("renders an input field's applied directives", () => {
    const body = renderInputBody({
      kind: "input",
      name: "OrderFilter",
      path: "types/inputs/OrderFilter.md",
      description: null,
      appliedDirectives: [],
      fields: [
        {
          name: "customerId",
          description: null,
          type: { wrappers: [], name: "ID", path: "types/scalars/ID.md" },
          defaultValue: null,
          deprecation: null,
          appliedDirectives: [auth],
        },
      ],
    });

    expect(body).toContain(
      "| `customerId` | [`ID`](../scalars/ID.md) |  | [`@auth`](../../directives/auth.md)(requires: STAFF) |",
    );
  });

  it("renders an enum value's applied directives", () => {
    const body = renderEnumBody({
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [],
      values: [
        { name: "STAFF", description: "Internal.", deprecation: null, appliedDirectives: [auth] },
      ],
    });

    expect(body).toContain(
      "| `STAFF` | Internal. [`@auth`](../../directives/auth.md)(requires: STAFF) |",
    );
  });

  it("renders an operation argument's applied directives", () => {
    const body = renderOperationBody({
      kind: "query",
      name: "orders",
      rootTypeName: "Query",
      path: "queries/orders.md",
      description: null,
      appliedDirectives: [],
      deprecation: null,
      type: { wrappers: [], name: "Order", path: "types/objects/Order.md" },
      args: [
        {
          name: "customerId",
          description: null,
          type: { wrappers: [], name: "ID", path: "types/scalars/ID.md" },
          defaultValue: null,
          deprecation: null,
          appliedDirectives: [auth],
        },
      ],
    });

    expect(body).toContain(
      "| `customerId` | [`ID`](../types/scalars/ID.md) |  | [`@auth`](../directives/auth.md)(requires: STAFF) |",
    );
  });
});
```

Note the last test's shorter link prefixes: an operation lives at `queries/orders.md`, one directory deep, so `relLink` climbs once, not twice.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/body.test.ts -t "applied directives on non-field rows"
```

Expected: FAIL, all four — each received cell ends without the `@auth` link, because these call sites still pass `[]`.

- [ ] **Step 3: Pass the real directives at all three remaining call sites**

In `argumentsTable` (`src/emit/render/body.ts:93`):

```typescript
function argumentsTable(args: readonly InputValueNode[], fromPath: string): string[] {
  return table(
    ["Argument", "Type", "Default", "Description"],
    args.map((arg) => [
      `\`${arg.name}\``,
      typeLink(fromPath, arg.type),
      defaultCell(arg.defaultValue),
      descriptionCell(arg.description, arg.deprecation, arg.appliedDirectives, fromPath),
    ]),
  );
}
```

In `inputFieldsSchema` (`src/emit/render/body.ts:133`), the row mapper becomes:

```typescript
      fields.map((value) => [
        `\`${value.name}\``,
        typeLink(fromPath, value.type),
        defaultCell(value.defaultValue),
        descriptionCell(value.description, value.deprecation, value.appliedDirectives, fromPath),
      ]),
```

In `renderEnumBody` (`src/emit/render/body.ts:203`), the row mapper becomes:

```typescript
            node.values.map((value) => [
              `\`${value.name}\``,
              descriptionCell(value.description, value.deprecation, value.appliedDirectives, node.path),
            ]),
```

`argumentsTable` serves operations, directive definitions, and the per-field `## Arguments` subsection, so one edit covers all three.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/body.test.ts
```

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add src/emit/render/body.ts src/emit/render/body.test.ts
git commit -m "fix: render applied directives on arguments, input fields, and enum values"
```

---

### Task 3: Escape directive argument values inside table cells

A directive argument's value is `print(arg.value)` from `graphql-js`. For a string or block-string argument that text can contain `|` or newlines, which breaks the markdown row. This never mattered before because `appliedInline` only ever rendered outside a table.

**Files:**
- Modify: `src/emit/render/body.ts:27-37` (`appliedInline`), plus its two callers, `directivesLine` (line 43) and `descriptionCell`
- Test: `src/emit/render/body.test.ts`

**Interfaces:**
- Consumes: `cell(text: string): string` from `./text.js`, already imported.
- Produces: `appliedInline(applied: readonly AppliedDirective[], fromPath: string, escapeArgs: boolean): string`. The third parameter is required, not defaulted, so both call sites state their intent.

- [ ] **Step 1: Write the failing tests**

Append to the `describe("applied directives on non-field rows", …)` block from Task 2:

```typescript
  it("escapes a pipe in a directive argument value so the row survives", () => {
    const body = renderEnumBody({
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [],
      values: [
        {
          name: "STAFF",
          description: null,
          deprecation: null,
          appliedDirectives: [
            {
              name: "note",
              path: "directives/note.md",
              args: [{ name: "text", value: '"a | b"' }],
            },
          ],
        },
      ],
    });

    expect(body).toContain(
      '| `STAFF` | [`@note`](../../directives/note.md)(text: "a \\| b") |',
    );
  });

  it("collapses a newline in a directive argument value", () => {
    const body = renderEnumBody({
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [],
      values: [
        {
          name: "STAFF",
          description: null,
          deprecation: null,
          appliedDirectives: [
            {
              name: "note",
              path: "directives/note.md",
              args: [{ name: "text", value: '"""\nmulti\nline\n"""' }],
            },
          ],
        },
      ],
    });

    expect(body).toContain('| `STAFF` | [`@note`](../../directives/note.md)(text: """ multi line """) |');
  });

  it("leaves the concept-level Directives line unescaped", () => {
    const body = renderEnumBody({
      kind: "enum",
      name: "Role",
      path: "types/enums/Role.md",
      description: null,
      appliedDirectives: [
        {
          name: "note",
          path: "directives/note.md",
          args: [{ name: "text", value: '"a | b"' }],
        },
      ],
      values: [],
    });

    expect(body).toContain('Directives: [`@note`](../../directives/note.md)(text: "a | b").');
  });
```

In these single-quoted JavaScript strings `\\|` is a literal backslash followed by a pipe — exactly what `cell()` emits.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run src/emit/render/body.test.ts -t "escapes a pipe in a directive argument"
```

Expected: FAIL — the received row contains an unescaped `a | b`, which also means the row has one column too many. The third test ("leaves the concept-level Directives line unescaped") passes already; it is a regression guard for this step, not a driver.

- [ ] **Step 3: Add the cell mode**

Replace `appliedInline` (`src/emit/render/body.ts:27-37`):

```typescript
function appliedInline(
  applied: readonly AppliedDirective[],
  fromPath: string,
  escapeArgs: boolean,
): string {
  return applied
    .map((directive) => {
      const args =
        directive.args.length === 0
          ? ""
          : `(${directive.args
              .map((arg) => `${arg.name}: ${escapeArgs ? cell(arg.value) : arg.value}`)
              .join(", ")})`;
      return `[\`@${directive.name}\`](${relLink(fromPath, directive.path)})${args}`;
    })
    .join(", ");
}
```

Only the argument *value* is escaped. The directive name is a GraphQL name and the path is derived from it, so neither can contain a reserved character; escaping them would corrupt the link.

Update the two callers. In `directivesLine` (`src/emit/render/body.ts:43`) — this one is not in a table, so it keeps rendering values verbatim:

```typescript
function directivesLine(applied: readonly AppliedDirective[], fromPath: string): string[] {
  return applied.length === 0 ? [] : ["", `Directives: ${appliedInline(applied, fromPath, false)}.`];
}
```

And in `descriptionCell`, the third part becomes `appliedInline(applied, fromPath, true)`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run src/emit/render/body.test.ts
```

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add src/emit/render/body.ts src/emit/render/body.test.ts
git commit -m "fix: escape directive argument values rendered inside table cells"
```

---

### Task 4: Regenerate the committed shop-api bundle

`test/example-bundle.test.ts:165` asserts `okf/shop-api` byte-for-byte against a freshly built bundle, so it is failing right now — every task above changed the renderer. Regeneration is deterministic: the test replays v1 → v2 → v3 from local SDL at fixed timestamps, with no network and no wall-clock reads.

**Files:**
- Modify: `okf/shop-api/**` (generated — do not hand-edit)
- Test: `test/example-bundle.test.ts` (run, not edited)

**Interfaces:**
- Consumes: the renderer from Tasks 1–3. Nothing consumes this task.

- [ ] **Step 1: Confirm the bundle test currently fails**

```bash
pnpm exec vitest run test/example-bundle.test.ts -t "matches okf/shop-api"
```

Expected: FAIL — the built tree differs from the committed tree. This is the gate proving the renderer change actually reaches the bundle.

- [ ] **Step 2: Regenerate**

```bash
UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts -t "matches okf/shop-api"
```

Expected: PASS. `UPDATE_EXAMPLE=1` makes the test write the built tree over `okf/shop-api` instead of asserting against it.

- [ ] **Step 3: Verify the issue's reproduction case is fixed**

```bash
grep -n "auth" okf/shop-api/types/objects/Customer.md
```

Expected: the `email` row now carries the directive, e.g.
`| \`email\` | [\`EmailAddress!\`](../scalars/EmailAddress.md) | [\`@auth\`](../../directives/auth.md)(requires: STAFF) |`

If `email` still has an empty description cell, stop — the renderer change did not take effect and Tasks 1–3 need revisiting.

- [ ] **Step 4: Review the diff for unexpected churn**

```bash
git diff --stat okf/shop-api
```

Expected: only concept files that genuinely gained a directive annotation. If files with no directive changed, or if `okf/countries-api` appears in `git status`, stop and investigate — a directive-free row must render byte-identically.

- [ ] **Step 5: Run the full suite**

```bash
pnpm exec vitest run
```

Expected: PASS, including `test/example-bundle.test.ts`, `src/conformance.test.ts`, and the referential-integrity checks.

- [ ] **Step 6: Commit**

```bash
git add okf/shop-api
git commit -m "chore: regenerate shop-api bundle with field-level directives"
```

---

### Task 5: Gates and pull request

**Files:**
- No source changes expected. Fix anything the gates surface.

- [ ] **Step 1: Run coverage**

```bash
pnpm run coverage
```

Expected: PASS with lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%. If branch coverage dipped, the likely gap is an unexercised path in `descriptionCell`'s `filter` or `appliedInline`'s `escapeArgs` — add the missing case rather than lowering the threshold.

- [ ] **Step 2: Run lint, typecheck, build, and knip**

```bash
pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run knip
```

Expected: all PASS. If Biome reformats anything, run `pnpm run format` and amend.

- [ ] **Step 3: Commit any gate fixes**

```bash
git add -A && git commit -m "chore: satisfy lint and coverage gates"
```

Skip if the working tree is clean.

- [ ] **Step 4: Open the pull request**

```bash
git push -u origin claude/issue-15-spec-fix-c00f4a
```

Then open a PR titled `fix: surface field-level applied directives (#15)`, referencing issue #15, the spec at `docs/superpowers/specs/2026-08-01-field-level-applied-directives-design.md`, and this plan. In the body, call out the two scope decisions a reviewer would otherwise question: the inline-suffix rendering was chosen because the table format is slated for replacement, and `okf/countries-api` is excluded because introspection sources carry no applied directives.

Note in the PR that confirming the bench `customer-email-staff-only` criterion now passes is a manual post-merge step — `bench/` makes paid model calls and never runs in CI.

---

## Self-Review

**Spec coverage.** Rendering shape and cell composition → Task 1. Application to all four table kinds → Tasks 1 and 2. Link format via `appliedInline` with the concept's own `fromPath` → Tasks 1–3. Escaping → Task 3. The seven spec test obligations map as: (1) Task 1 step 1; (2), (3), (4) Task 2 step 1; (5) Task 1 step 1; (6) Task 3 step 1; (7) discharged by existing assertions, listed in Task 1. Bundle regeneration and the `Customer.md` result → Task 4. Gates → Task 5. Determinism needs no task — ordering already comes sorted from the IR, which Task 1's "do not change `src/model/`" constraint protects.

**Placeholder scan.** Every code step carries complete code. No TBDs, no "similar to Task N", no "add error handling".

**Type consistency.** `descriptionCell(description, deprecation, applied, fromPath)` is defined in Task 1 and used with that exact arity and order in Tasks 2 and 3. `appliedInline(applied, fromPath, escapeArgs)` is defined in Task 3 and its two callers are both updated in the same step, so no call site is left at the old arity. `AppliedDirective` and `cell` are already imported in `body.ts`; no import changes are needed.
