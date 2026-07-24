# Example schemas and committed demo bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a realistic three-version example GraphQL API (`examples/shop-api/v1..v3.graphql`) and commit the OKF bundle it produces (`okf/shop-api/`), guarded by a golden-file test that regenerates the whole v1 → v2 → v3 sequence and asserts it byte-for-byte.

**Architecture:** Two new library options (`resource`, validated `now`) make a bundle generated from a local SDL reproducible across machines. One Vitest golden test drives the three-run sequence with pinned timestamps into a temp directory, injects a human edit between runs, and compares against the committed bundle; `UPDATE_EXAMPLE=1` rewrites the committed bundle instead of asserting. The existing `test` CI job is therefore the gate — no new job, no script, no build step.

**Tech Stack:** TypeScript (strict, ESM), Vitest, graphql-js 16, pnpm, Biome, knip.

**Spec:** `docs/superpowers/specs/2026-07-24-example-schemas-design.md`

## Global Constraints

- Node.js `>=24`; CI also runs Node 26. Package manager is pnpm (pinned `10.14.0`).
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`. Relative imports use the `.js` extension.
- Determinism is load-bearing (`M1/GOAL-8.1`, `M1/NG-6`): no runtime LLM calls, no non-deterministic ordering, no wall-clock output beyond the spec's ISO-8601 timestamps.
- Coverage thresholds are enforced gates: lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.
- Everything public flows through `src/index.ts`. Nothing else is supported API.
- The naming scheme in `src/model/` is the single source of truth for paths (`M1/GOAL-4.5`).
- TDD: write the failing test, watch it fail, write minimal code to pass. Do not backfill tests.
- Pinned timestamps used throughout: `2026-01-15T09:00:00.000Z` (v1), `2026-03-02T09:00:00.000Z` (v2), `2026-05-20T09:00:00.000Z` (v3).
- Pinned resource identity: `https://shop.example/graphql`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/index.ts` (modify) | Add `resource?: string` and validate/normalize `now` in `SyncOkfBundleOptions`. |
| `src/errors.ts` (modify) | Add the `INVALID_TIMESTAMP` error code. |
| `src/cli.ts` (modify) | Parse `--now` and `--resource`; forward them. |
| `test/support/bundle-tree.ts` (create) | `readTree` / `writeTree` helpers shared by the reconcile and golden tests. |
| `examples/shop-api/v1.graphql` (create) | The showcase schema. |
| `examples/shop-api/v2.graphql` (create) | Additions + deprecation cycle begins. |
| `examples/shop-api/v3.graphql` (create) | Deprecated members removed. |
| `test/example-bundle.test.ts` (create) | Golden test: runs the sequence, compares against `okf/shop-api/`. |
| `okf/shop-api/**` (create, generated) | The committed bundle — written by `UPDATE_EXAMPLE=1`, never by hand. |
| `README.md` (modify) | Document the example and the two new flags. |

Task order matters: Tasks 1–2 add the options the golden test depends on, Task 3 adds the shared helper, Tasks 4–6 add the schemas, Task 7 adds the test and generates the bundle, Task 8 documents.

---

### Task 1: `resource` option

Overriding `resource` is what makes a committed bundle reproducible. Without it, `ir.resource` records the caller's absolute SDL path, so (a) a bundle committed from one machine never matches another, and (b) renaming the source file marks **all 43 concepts changed** — verified against the built tool.

**Files:**
- Modify: `src/index.ts:10-14` (options type), `src/index.ts:35-38` (body)
- Test: `src/index.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SyncOkfBundleOptions.resource?: string`. When supplied it replaces `SchemaIr.resource` before rendering; when omitted, behavior is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/index.test.ts`:

```ts
describe("the resource option", () => {
  it("overrides the resource recorded in concept frontmatter", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-resource-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      resource: "https://shop.example/graphql",
    });

    const concept = await readFile(join(outDir, "queries/hello.md"), "utf8");
    expect(concept).toContain('resource: "https://shop.example/graphql"');
    expect(concept).not.toContain(workspace);
  });

  it("falls back to the source path when omitted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-resource-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await syncOkfBundle({ source: { kind: "sdl", path: sdlPath }, outDir });

    expect(await readFile(join(outDir, "queries/hello.md"), "utf8")).toContain(
      `resource: "${sdlPath}"`,
    );
  });
});
```

If `src/index.test.ts` does not already import them, add at the top of the file:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/index.test.ts -t "overrides the resource"`
Expected: FAIL — TypeScript rejects the unknown property `resource`, or the assertion fails because the frontmatter still holds the temp path.

- [ ] **Step 3: Write the minimal implementation**

In `src/index.ts`, add the field to the options interface:

```ts
export interface SyncOkfBundleOptions {
  readonly source: SourceSpec;
  readonly outDir: string;
  readonly now?: string;
  readonly resource?: string;
}
```

Then, in `syncOkfBundle`, replace the single `const ir = await readSchema(options.source);` line with:

```ts
  const loaded = await readSchema(options.source);
  const ir = options.resource === undefined ? loaded : { ...loaded, resource: options.resource };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/index.test.ts`
Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: allow overriding the resource recorded in frontmatter"
```

---

### Task 2: validated `now`, and the `--now` / `--resource` CLI flags

**Files:**
- Modify: `src/errors.ts:1-13`, `src/index.ts` (`syncOkfBundle` body), `src/cli.ts:6-34`
- Test: `src/index.test.ts`, `src/cli.test.ts`

**Interfaces:**
- Consumes: `SyncOkfBundleOptions.resource` from Task 1.
- Produces: `parseArgs(argv) => { source: SourceSpec; outDir: string; now?: string; resource?: string }`; the error code `"INVALID_TIMESTAMP"`; `now` normalized through `toISOString()` inside `syncOkfBundle`.

- [ ] **Step 1: Write the failing tests**

Append to `src/index.test.ts`:

```ts
describe("the now option", () => {
  it("rejects a value that is not a parseable timestamp", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-now-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");

    const code = await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir: join(workspace, "bundle"),
      now: "yesterday",
    }).then(
      () => "no-error",
      (error: GraphqlOkfError) => error.code,
    );

    expect(code).toBe("INVALID_TIMESTAMP");
  });

  it("normalizes an accepted value to a canonical ISO-8601 string", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-now-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await syncOkfBundle({
      source: { kind: "sdl", path: sdlPath },
      outDir,
      now: "2026-01-15T09:00:00Z",
    });

    expect(await readFile(join(outDir, "queries/hello.md"), "utf8")).toContain(
      "timestamp: 2026-01-15T09:00:00.000Z",
    );
  });
});
```

Add `import type { GraphqlOkfError } from "./errors.js";` to the top of `src/index.test.ts` if it is not already imported.

Append to `src/cli.test.ts`, inside the existing `describe("parseArgs", ...)` block:

```ts
  it("parses --now and --resource", () => {
    expect(
      parseArgs([
        "./schema.graphql",
        "--out",
        "bundle",
        "--now",
        "2026-01-15T09:00:00.000Z",
        "--resource",
        "https://shop.example/graphql",
      ]),
    ).toEqual({
      source: { kind: "sdl", path: "./schema.graphql" },
      outDir: "bundle",
      now: "2026-01-15T09:00:00.000Z",
      resource: "https://shop.example/graphql",
    });
  });

  it("rejects a --now with no value", () => {
    const code = (() => {
      try {
        parseArgs(["./schema.graphql", "--out", "bundle", "--now"]);
      } catch (error) {
        return (error as GraphqlOkfError).code;
      }
      return "no-error";
    })();
    expect(code).toBe("CLI_USAGE");
  });
```

And add, inside the existing `describe("main", ...)` block:

```ts
  it("forwards --now to the bundle it writes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "okf-cli-now-"));
    const sdlPath = join(workspace, "schema.graphql");
    await writeFile(sdlPath, "type Query { hello: String }");
    const outDir = join(workspace, "bundle");

    await main([sdlPath, "--out", outDir, "--now", "2026-01-15T09:00:00.000Z"]);

    expect(await readFile(join(outDir, "queries/hello.md"), "utf8")).toContain(
      "timestamp: 2026-01-15T09:00:00.000Z",
    );
  });
```

The existing test at `src/cli.test.ts:56-65` asserts the exact usage string and **will** break in Step 3. That is expected; Step 3 updates it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/cli.test.ts src/index.test.ts`
Expected: FAIL — `INVALID_TIMESTAMP` is not an assignable error code, `parseArgs` returns no `now`/`resource`, and the timestamp assertions fail.

- [ ] **Step 3: Write the minimal implementation**

In `src/errors.ts`, add the new code to the union (after `"CLI_USAGE"`):

```ts
  | "CLI_USAGE"
  | "INVALID_TIMESTAMP"
```

In `src/index.ts`, replace the `const timestamp = options.now ?? new Date().toISOString();` line with:

```ts
  const timestamp = normalizeTimestamp(options.now);
```

and add this function to the same file, below `syncOkfBundle`:

```ts
function normalizeTimestamp(now: string | undefined): string {
  if (now === undefined) return new Date().toISOString();
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new GraphqlOkfError(
      "INVALID_TIMESTAMP",
      `"${now}" is not a valid ISO-8601 timestamp. Pass something like 2026-01-15T09:00:00.000Z.`,
    );
  }
  return parsed.toISOString();
}
```

Replace the whole of `src/cli.ts:6-34` with:

```ts
export function parseArgs(argv: readonly string[]): {
  source: SourceSpec;
  outDir: string;
  now?: string;
  resource?: string;
} {
  const positionals: string[] = [];
  const options = new Map<string, string | undefined>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--out" || arg === "--now" || arg === "--resource") {
      options.set(arg, argv[i + 1]);
      i += 1;
    } else {
      positionals.push(arg);
    }
  }
  const source = positionals[0];
  const outDir = options.get("--out");
  const now = options.get("--now");
  const resource = options.get("--resource");
  if (
    source === undefined ||
    outDir === undefined ||
    (options.has("--now") && now === undefined) ||
    (options.has("--resource") && resource === undefined)
  ) {
    throw new GraphqlOkfError(
      "CLI_USAGE",
      "Usage: graphql-okf <sdl-path-or-endpoint-url> --out <dir> [--now <iso-8601>] [--resource <url-or-id>]",
    );
  }
  const spec: SourceSpec = /^https?:\/\//.test(source)
    ? { kind: "endpoint", url: source }
    : { kind: "sdl", path: source };
  return { source: spec, outDir, now, resource };
}

export async function main(argv: readonly string[]): Promise<void> {
  try {
    const { source, outDir, now, resource } = parseArgs(argv);
    await syncOkfBundle({ source, outDir, now, resource });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
```

Update the expected usage string in the existing test at `src/cli.test.ts:62-64` to match:

```ts
    expect(errorSpy).toHaveBeenCalledWith(
      "Usage: graphql-okf <sdl-path-or-endpoint-url> --out <dir> [--now <iso-8601>] [--resource <url-or-id>]",
    );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/cli.test.ts src/index.test.ts`
Expected: PASS, all tests in both files.

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts src/index.ts src/cli.ts src/cli.test.ts src/index.test.ts
git commit -m "feat: validate now and add --now/--resource CLI flags"
```

---

### Task 3: shared bundle-tree test helper

`test/reconcile.test.ts:16-30` already has a private `snapshot` walker. The golden test needs the same walk plus a writer; extracting one helper avoids two tree-walkers drifting apart.

**Files:**
- Create: `test/support/bundle-tree.ts`
- Modify: `test/reconcile.test.ts:1-30`

**Interfaces:**
- Consumes: nothing.
- Produces: `readTree(dir: string): Promise<Map<string, string>>` — every file under `dir`, keyed by forward-slash relative path. `writeTree(dir: string, tree: ReadonlyMap<string, string>): Promise<void>` — removes `dir` entirely, then writes every entry, creating parent directories.

- [ ] **Step 1: Write the failing test**

Create `test/support/bundle-tree.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTree, writeTree } from "./bundle-tree.js";

describe("writeTree then readTree", () => {
  it("round-trips a nested tree", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "okf-tree-")), "bundle");
    const tree = new Map([
      ["index.md", "# root\n"],
      ["types/objects/User.md", "# User\n"],
    ]);

    await writeTree(dir, tree);

    expect(await readTree(dir)).toEqual(tree);
  });

  it("replaces whatever was there before", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "okf-tree-")), "bundle");
    await writeTree(dir, new Map([["stale.md", "old\n"]]));

    await writeTree(dir, new Map([["fresh.md", "new\n"]]));

    expect(await readTree(dir)).toEqual(new Map([["fresh.md", "new\n"]]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/support/bundle-tree.test.ts`
Expected: FAIL — cannot resolve `./bundle-tree.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `test/support/bundle-tree.ts`:

```ts
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function readTree(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (relative: string): Promise<void> => {
    for (const entry of await readdir(join(dir, relative), { withFileTypes: true })) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(child);
      } else {
        files.set(child, await readFile(join(dir, child), "utf8"));
      }
    }
  };
  await walk("");
  return files;
}

export async function writeTree(dir: string, tree: ReadonlyMap<string, string>): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  for (const [relative, contents] of tree) {
    const target = join(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/support/bundle-tree.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Point the existing reconcile test at the helper**

In `test/reconcile.test.ts`, delete the local `snapshot` function (lines 16-30) and its now-unused imports, then import the helper. The top of the file becomes:

```ts
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSchema, syncOkfBundle } from "../src/index.js";
import { applyPlan } from "../src/reconcile/apply.js";
import { reconcile } from "../src/reconcile/plan.js";
import { readExistingBundle } from "../src/reconcile/read.js";
import { readTree as snapshot } from "./support/bundle-tree.js";
```

Note `readdir` is dropped from the `node:fs/promises` import; the rest of the file is unchanged because the helper is aliased to `snapshot`.

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `pnpm test`
Expected: PASS, all files.

- [ ] **Step 7: Commit**

```bash
git add test/support/bundle-tree.ts test/support/bundle-tree.test.ts test/reconcile.test.ts
git commit -m "test: extract shared bundle-tree helper"
```

---

### Task 4: the v1 example schema

**Files:**
- Create: `examples/shop-api/v1.graphql`
- Test: `test/example-bundle.test.ts` (created here, extended in Tasks 5-7)

**Interfaces:**
- Consumes: `resource` and `now` from Tasks 1-2.
- Produces: `examples/shop-api/v1.graphql`, which yields exactly 43 concept files plus directory indexes and `log.md`.

- [ ] **Step 1: Write the failing test**

Create `test/example-bundle.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncOkfBundle } from "../src/index.js";

const V1 = new URL("../examples/shop-api/v1.graphql", import.meta.url).pathname;

const RESOURCE = "https://shop.example/graphql";
const T1 = "2026-01-15T09:00:00.000Z";

describe("the v1 example schema", () => {
  it("emits every concept kind the model supports", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: V1 },
      outDir,
      now: T1,
      resource: RESOURCE,
    });

    expect(result.added).toHaveLength(43);
    for (const path of [
      "types/objects/Product.md",
      "types/interfaces/Purchasable.md",
      "types/unions/PaymentMethod.md",
      "types/enums/OrderStatus.md",
      "types/inputs/PaymentInput.md",
      "types/scalars/DateTime.md",
      "directives/auth.md",
      "directives/tag.md",
      "queries/searchProducts.md",
      "mutations/placeOrder.md",
      "subscriptions/orderStatusChanged.md",
      "subscriptions/productPriceChanged.md",
    ]) {
      expect(result.added).toContain(path);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/example-bundle.test.ts`
Expected: FAIL — `examples/shop-api/v1.graphql` does not exist (`SOURCE_NOT_FOUND`).

- [ ] **Step 3: Create the schema**

Create `examples/shop-api/v1.graphql` with exactly this content:

```graphql
"""
Access levels a caller can hold.

Used by the `@auth` directive to gate fields.
"""
enum Role {
  "Anyone, including unauthenticated callers."
  GUEST
  "A signed-in shopper."
  CUSTOMER
  "A member of shop staff."
  STAFF
}

"Restricts a field or type to callers holding at least the given role."
directive @auth(requires: Role! = CUSTOMER) on OBJECT | FIELD_DEFINITION

"Attaches a free-form classification label. May be applied more than once."
directive @tag(name: String!) repeatable on OBJECT | FIELD_DEFINITION

"An ISO-8601 instant, e.g. `2026-01-15T09:00:00Z`."
scalar DateTime @specifiedBy(url: "https://scalars.graphql.org/andimarek/date-time")

"An RFC 5322 email address."
scalar EmailAddress

"An ISO-4217 currency code."
enum Currency {
  BRL
  EUR
  USD
}

"The lifecycle stage of an order."
enum OrderStatus {
  "Created but not yet paid."
  PENDING
  PAID
  SHIPPED
  DELIVERED
  CANCELLED
  "Payment failed irrecoverably."
  FAILED @deprecated(reason: "Merged into CANCELLED.")
}

"Anything addressable by a globally unique identifier."
interface Node {
  "The globally unique identifier."
  id: ID!
}

"Anything that records when it was created and last modified."
interface Timestamped {
  createdAt: DateTime!
  updatedAt: DateTime
}

"""
Anything a customer can put in an order.

Implementors are guaranteed to expose a price in the shop's base currency.
"""
interface Purchasable implements Node {
  id: ID!
  "The price in the smallest unit of the base currency, e.g. cents."
  priceCents: Int!
}

"A postal address."
type Address {
  line1: String!
  line2: String
  city: String!
  postalCode: String!
  "An ISO-3166-1 alpha-2 country code."
  country: String!
}

"An item offered for sale."
type Product implements Node & Purchasable & Timestamped @tag(name: "catalog") @tag(name: "public") {
  id: ID!
  createdAt: DateTime!
  updatedAt: DateTime
  "The customer-facing name."
  name: String!
  """
  A long-form description.

  May contain Markdown, including **bold** text and [links](https://example.test).
  """
  description: String
  priceCents: Int!
  "Free-form merchandising labels."
  labels: [String!]!
  "Whether the product can currently be ordered."
  inStock: Boolean!
  "The internal SKU. Not stable across catalog migrations."
  sku: String @deprecated
}

"A person who can place orders."
type Customer implements Node & Timestamped {
  id: ID!
  createdAt: DateTime!
  updatedAt: DateTime
  email: EmailAddress! @auth(requires: STAFF)
  displayName: String!
  "Where orders are shipped by default."
  defaultAddress: Address
}

"One line of an order: a product and how many of it were bought."
type OrderLine {
  product: Product!
  quantity: Int!
  "The price of a single unit at the time the order was placed."
  unitPriceCents: Int!
}

"A payment card."
type CreditCard {
  brand: String!
  "The last four digits of the card number."
  last4: String!
  expiryMonth: Int!
  expiryYear: Int!
}

"A linked PayPal account."
type PayPalAccount {
  email: EmailAddress!
}

"A prepaid gift card redeemed against an order."
type GiftCard {
  code: String!
  balanceCents: Int!
}

"How an order was paid for."
union PaymentMethod = CreditCard | PayPalAccount | GiftCard

"A customer's purchase."
type Order implements Node & Timestamped @auth(requires: CUSTOMER) {
  id: ID!
  createdAt: DateTime!
  updatedAt: DateTime
  customer: Customer!
  status: OrderStatus!
  lines: [OrderLine!]!
  "The order total in the smallest unit of the base currency."
  totalCents: Int!
  currency: Currency!
  paidWith: PaymentMethod
  shipTo: Address!
}

"Narrows a product listing. Every field is optional; omitted fields do not filter."
input ProductFilter {
  "Case-insensitive substring match against the product name."
  nameContains: String = ""
  minPriceCents: Int = 0
  maxPriceCents: Int
  inStockOnly: Boolean = false
  "Only products carrying all of these labels."
  labels: [String!] = []
  "Only products a caller of this role may see."
  visibleTo: Role = GUEST
}

"A postal address supplied by a client."
input AddressInput {
  line1: String!
  line2: String
  city: String!
  postalCode: String!
  country: String!
}

"""
Exactly one payment instrument.

Supply exactly one field; supplying zero or more than one is an error.
"""
input PaymentInput @oneOf {
  creditCardToken: String
  payPalToken: String
  giftCardCode: String
}

"Everything needed to turn a basket into an order."
input PlaceOrderInput {
  productIds: [ID!]!
  shipTo: AddressInput!
  payWith: PaymentInput!
}

type Query {
  "Looks up any node by its globally unique identifier."
  node(id: ID!): Node
  "Looks up a single product."
  product(id: ID!): Product
  "Lists products, most recently created first."
  products(filter: ProductFilter): [Product!]!
  "Looks up a single order."
  order(id: ID!): Order @auth(requires: CUSTOMER)
  "The currently authenticated customer, if any."
  me: Customer
  "Full-text search across the catalog."
  searchProducts(
    query: String!
    "Ignored since the search backend migration."
    fuzzy: Boolean = false @deprecated(reason: "The backend always matches fuzzily.")
  ): [Product!]! @deprecated(reason: "Use products(filter:) instead.")
}

type Mutation {
  "Places an order for the given products."
  placeOrder(input: PlaceOrderInput!): Order! @auth(requires: CUSTOMER)
  "Cancels an order that has not yet shipped."
  cancelOrder(id: ID!, reason: String): Order! @auth(requires: CUSTOMER)
  "Replaces a customer's default shipping address."
  updateDefaultAddress(customerId: ID!, address: AddressInput!): Customer!
}

type Subscription {
  "Emits the order each time its status changes."
  orderStatusChanged(orderId: ID!): Order! @auth(requires: CUSTOMER)
  "Emits a product each time its price changes."
  productPriceChanged: Product!
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/example-bundle.test.ts`
Expected: PASS — `result.added` has length 43 and contains every listed path.

- [ ] **Step 5: Commit**

```bash
git add examples/shop-api/v1.graphql test/example-bundle.test.ts
git commit -m "test: add the v1 shop-api example schema"
```

---

### Task 5: the v2 example schema

**Files:**
- Create: `examples/shop-api/v2.graphql`
- Modify: `test/example-bundle.test.ts`

**Interfaces:**
- Consumes: `examples/shop-api/v1.graphql` from Task 4.
- Produces: `examples/shop-api/v2.graphql`. Reconciling v1 → v2 yields exactly 4 added, 8 changed, 1 removed, 34 unchanged.

- [ ] **Step 1: Write the failing test**

Add to `test/example-bundle.test.ts` — first extend the constants at the top:

```ts
const V2 = new URL("../examples/shop-api/v2.graphql", import.meta.url).pathname;
const T2 = "2026-03-02T09:00:00.000Z";
```

then append this block:

```ts
describe("reconciling v1 to v2", () => {
  it("adds Money and Review, deprecates the cents fields, tombstones searchProducts", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");
    await syncOkfBundle({
      source: { kind: "sdl", path: V1 },
      outDir,
      now: T1,
      resource: RESOURCE,
    });

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: V2 },
      outDir,
      now: T2,
      resource: RESOURCE,
    });

    expect([...result.added].sort()).toEqual([
      "mutations/addReview.md",
      "subscriptions/reviewPosted.md",
      "types/objects/Money.md",
      "types/objects/Review.md",
    ]);
    expect(result.removed).toEqual(["queries/searchProducts.md"]);
    expect(result.changed).toHaveLength(8);
    expect(result.unchanged).toBe(34);
  });
});
```

The `added` list is sorted before comparison: the reconciler's emission order is deterministic but is not part of the contract this test is pinning, and the golden test in Task 7 already covers exact output.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/example-bundle.test.ts -t "reconciling v1 to v2"`
Expected: FAIL — `examples/shop-api/v2.graphql` does not exist (`SOURCE_NOT_FOUND`).

- [ ] **Step 3: Create the schema**

Copy `examples/shop-api/v1.graphql` to `examples/shop-api/v2.graphql`, then apply exactly these seven edits.

**(a)** In `enum OrderStatus`, insert two lines between `CANCELLED` and the `"Payment failed irrecoverably."` comment:

```graphql
  CANCELLED
  "Paid, then fully refunded."
  REFUNDED
  "Payment failed irrecoverably."
```

**(b)** Replace the body of `interface Purchasable`:

```graphql
interface Purchasable implements Node {
  id: ID!
  "The price in the smallest unit of the base currency, e.g. cents."
  priceCents: Int! @deprecated(reason: "Use price, which carries its currency.")
  "The price, including the currency it is denominated in."
  price: Money!
}
```

**(c)** Insert two new types immediately before `"A postal address."` / `type Address {`:

```graphql
"An amount of money in a specific currency."
type Money {
  "The amount in the smallest unit of the currency, e.g. cents."
  amountCents: Int!
  currency: Currency!
}

"A customer's written opinion of a product."
type Review implements Node & Timestamped {
  id: ID!
  createdAt: DateTime!
  updatedAt: DateTime
  product: Product!
  author: Customer!
  "A rating from 1 to 5 inclusive."
  rating: Int!
  body: String
}

```

**(d)** In `type Product`, replace the lone `  priceCents: Int!` line with:

```graphql
  priceCents: Int! @deprecated(reason: "Use price, which carries its currency.")
  price: Money!
  "Reviews left by customers, newest first."
  reviews: [Review!]!
```

**(e)** Replace the one-line description above `type Customer` with a block description:

```graphql
"""
A person who can place orders.

A customer is created on first sign-in and is never hard-deleted.
"""
type Customer implements Node & Timestamped {
```

**(f)** In `type Order`, replace `  totalCents: Int!` with:

```graphql
  totalCents: Int! @deprecated(reason: "Use total, which carries its currency.")
  "The order total, including the currency it is denominated in."
  total: Money!
```

**(g)** In `type Query`, replace the `products` field and delete `searchProducts` entirely, so the tail of the type reads:

```graphql
  "Lists products, most recently created first."
  products(filter: ProductFilter, "Maximum number of products to return." first: Int = 20): [Product!]!
  "Looks up a single order."
  order(id: ID!): Order @auth(requires: CUSTOMER)
  "The currently authenticated customer, if any."
  me: Customer
}
```

**(h)** In `type Mutation`, insert `addReview` before `updateDefaultAddress`:

```graphql
  "Adds a review to a product."
  addReview(productId: ID!, rating: Int!, body: String): Review! @auth(requires: CUSTOMER)
  "Replaces a customer's default shipping address."
```

**(i)** In `type Subscription`, append after `productPriceChanged`:

```graphql
  "Emits each new review as it is posted."
  reviewPosted(productId: ID!): Review!
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/example-bundle.test.ts`
Expected: PASS — 4 added, 8 changed, 1 removed, 34 unchanged.

If `changed` is 43 rather than 8, the `resource` option from Task 1 is not being applied; the source path is leaking into frontmatter.

- [ ] **Step 5: Commit**

```bash
git add examples/shop-api/v2.graphql test/example-bundle.test.ts
git commit -m "test: add the v2 shop-api example schema"
```

---

### Task 6: the v3 example schema

**Files:**
- Create: `examples/shop-api/v3.graphql`
- Modify: `test/example-bundle.test.ts`

**Interfaces:**
- Consumes: `examples/shop-api/v2.graphql` from Task 5.
- Produces: `examples/shop-api/v3.graphql`. Reconciling v2 → v3 yields 0 added, 5 changed, 1 removed, 40 unchanged, and leaves the `searchProducts` tombstone byte-identical.

- [ ] **Step 1: Write the failing test**

Extend the constants at the top of `test/example-bundle.test.ts`:

```ts
const V3 = new URL("../examples/shop-api/v3.graphql", import.meta.url).pathname;
const T3 = "2026-05-20T09:00:00.000Z";
```

Add `import { readFile } from "node:fs/promises";` to the existing `node:fs/promises` import, then append:

```ts
describe("reconciling v2 to v3", () => {
  it("removes the deprecated members and leaves the earlier tombstone untouched", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T1, resource: RESOURCE });
    await syncOkfBundle({ source: { kind: "sdl", path: V2 }, outDir, now: T2, resource: RESOURCE });
    const tombstoneAfterV2 = await readFile(join(outDir, "queries/searchProducts.md"), "utf8");

    const result = await syncOkfBundle({
      source: { kind: "sdl", path: V3 },
      outDir,
      now: T3,
      resource: RESOURCE,
    });

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(["types/objects/GiftCard.md"]);
    expect(result.changed).toHaveLength(5);
    expect(result.unchanged).toBe(40);
    expect(await readFile(join(outDir, "queries/searchProducts.md"), "utf8")).toBe(
      tombstoneAfterV2,
    );
  });

  it("records both removals as tombstones rather than deletions", async () => {
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-")), "bundle");
    await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T1, resource: RESOURCE });
    await syncOkfBundle({ source: { kind: "sdl", path: V2 }, outDir, now: T2, resource: RESOURCE });
    await syncOkfBundle({ source: { kind: "sdl", path: V3 }, outDir, now: T3, resource: RESOURCE });

    const giftCard = await readFile(join(outDir, "types/objects/GiftCard.md"), "utf8");
    expect(giftCard).toContain("status: removed");
    expect(giftCard).toContain(`removedAt: ${T3}`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/example-bundle.test.ts -t "reconciling v2 to v3"`
Expected: FAIL — `examples/shop-api/v3.graphql` does not exist (`SOURCE_NOT_FOUND`).

- [ ] **Step 3: Create the schema**

Copy `examples/shop-api/v2.graphql` to `examples/shop-api/v3.graphql`, then apply exactly these six deletions.

**(a)** In `enum OrderStatus`, delete the two lines:

```graphql
  "Payment failed irrecoverably."
  FAILED @deprecated(reason: "Merged into CANCELLED.")
```

**(b)** In `interface Purchasable`, delete the two `priceCents` lines so the body reads:

```graphql
interface Purchasable implements Node {
  id: ID!
  "The price, including the currency it is denominated in."
  price: Money!
}
```

**(c)** In `type Product`, delete the line:

```graphql
  priceCents: Int! @deprecated(reason: "Use price, which carries its currency.")
```

**(d)** Delete the entire `GiftCard` type and its description:

```graphql
"A prepaid gift card redeemed against an order."
type GiftCard {
  code: String!
  balanceCents: Int!
}
```

**(e)** Narrow the union:

```graphql
union PaymentMethod = CreditCard | PayPalAccount
```

**(f)** In `type Order`, delete the two `totalCents` lines so the total reads only:

```graphql
  "The order total, including the currency it is denominated in."
  total: Money!
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/example-bundle.test.ts`
Expected: PASS, all four tests in the file.

- [ ] **Step 5: Commit**

```bash
git add examples/shop-api/v3.graphql test/example-bundle.test.ts
git commit -m "test: add the v3 shop-api example schema"
```

---

### Task 7: the golden bundle

**Files:**
- Modify: `test/example-bundle.test.ts`
- Create: `okf/shop-api/**` (generated — never hand-written)

**Interfaces:**
- Consumes: all three schemas, `readTree`/`writeTree` from Task 3, both options from Tasks 1-2.
- Produces: the committed `okf/shop-api/` bundle and the test that guards it.

- [ ] **Step 1: Write the failing test**

Append to `test/example-bundle.test.ts`. Add `import { appendFile } from "node:fs/promises";` to the existing import and `import { readTree, writeTree } from "./support/bundle-tree.js";`:

```ts
const COMMITTED = new URL("../okf/shop-api", import.meta.url).pathname;

const HUMAN_SECTION =
  "\n## Ownership\n\nOwned by the Catalog team. Ping #catalog before changing pricing fields.\n";

/**
 * Runs the full v1 -> v2 -> v3 sequence with pinned timestamps, injecting a
 * human-authored section after v1. The injection is deliberate: it is what makes
 * GOAL-8.3 (human edits survive regeneration) verifiable by opening the committed
 * bundle rather than by trusting a test name.
 */
async function buildExampleBundle(): Promise<Map<string, string>> {
  const outDir = join(await mkdtemp(join(tmpdir(), "okf-shop-golden-")), "bundle");

  await syncOkfBundle({ source: { kind: "sdl", path: V1 }, outDir, now: T1, resource: RESOURCE });
  await appendFile(join(outDir, "types/objects/Product.md"), HUMAN_SECTION);
  await syncOkfBundle({ source: { kind: "sdl", path: V2 }, outDir, now: T2, resource: RESOURCE });
  await syncOkfBundle({ source: { kind: "sdl", path: V3 }, outDir, now: T3, resource: RESOURCE });

  return readTree(outDir);
}

describe("the committed example bundle", () => {
  it("matches okf/shop-api byte-for-byte", async () => {
    const built = await buildExampleBundle();

    if (process.env.UPDATE_EXAMPLE === "1") {
      await writeTree(COMMITTED, built);
      return;
    }

    expect(await readTree(COMMITTED)).toEqual(built);
  });

  it("carries three dated log entries and the surviving human section", async () => {
    const built = await buildExampleBundle();

    const log = built.get("log.md") ?? "";
    expect(log).toContain(`## ${T1}`);
    expect(log).toContain(`## ${T2}`);
    expect(log).toContain(`## ${T3}`);
    expect(built.get("types/objects/Product.md")).toContain("Ping #catalog");
  });

  it("records no absolute filesystem path anywhere in the bundle", async () => {
    const built = await buildExampleBundle();

    const offenders = [...built.entries()]
      .filter(([, contents]) => contents.includes("/private/") || contents.includes("/home/"))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/example-bundle.test.ts -t "matches okf/shop-api"`
Expected: FAIL — `okf/shop-api` does not exist, so `readTree` throws `ENOENT`.

- [ ] **Step 3: Generate the committed bundle**

Run: `UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts`
Expected: PASS. `okf/shop-api/` now exists.

- [ ] **Step 4: Verify the generated bundle by hand**

```bash
grep -c '^## ' okf/shop-api/log.md
grep -l 'status: removed' -r okf/shop-api
grep -A2 '## Ownership' okf/shop-api/types/objects/Product.md
grep -r 'resource:' okf/shop-api | grep -v 'https://shop.example/graphql' | head
```

Expected: `3`; exactly two files listed (`okf/shop-api/queries/searchProducts.md` and `okf/shop-api/types/objects/GiftCard.md`); the Ownership section printed; and the last command printing nothing.

- [ ] **Step 5: Run the test again without the env var to confirm it now asserts green**

Run: `pnpm exec vitest run test/example-bundle.test.ts`
Expected: PASS, all seven tests.

- [ ] **Step 6: Commit**

```bash
git add test/example-bundle.test.ts okf/shop-api
git commit -m "test: commit the shop-api golden bundle"
```

---

### Task 8: documentation and full verification

**Files:**
- Modify: `README.md:110-180` (the CLI usage and Examples sections)

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Document the flags and the example**

In `README.md`, in the Examples section alongside the existing `okf/countries-api/` entry, add:

```markdown
- [`okf/shop-api/`](okf/shop-api/) — a bundle for the example shop API in
  [`examples/shop-api/`](examples/shop-api/), generated by running the tool
  against three successive versions of that schema. Start at
  [`okf/shop-api/log.md`](okf/shop-api/log.md) to see what each version changed,
  then browse from [`okf/shop-api/index.md`](okf/shop-api/index.md). Unlike the
  Countries bundle it needs no network access, so `pnpm test` reproduces it
  exactly.
```

In the CLI usage section, document both flags:

```markdown
Two optional flags make a run reproducible, which matters when the bundle is
committed to git:

- `--now <iso-8601>` pins the timestamp written to new and changed concepts
  instead of using the wall clock.
- `--resource <url-or-id>` sets the `resource` field recorded in frontmatter.
  Without it, an SDL source records its own file path, which differs between
  machines.

```bash
graphql-okf examples/shop-api/v1.graphql \
  --out okf/shop-api \
  --now 2026-01-15T09:00:00.000Z \
  --resource https://shop.example/graphql
```
```

- [ ] **Step 2: Run every gate**

```bash
pnpm run lint && pnpm run typecheck && pnpm run knip && pnpm run build && pnpm run coverage
```

Expected: all pass; coverage at or above lines 90 / functions 90 / branches 85 / statements 90.

If Biome reports formatting on the new `.graphql` files, run `pnpm run format` and re-run. If that reformats a schema, regenerate the bundle (`UPDATE_EXAMPLE=1 pnpm exec vitest run test/example-bundle.test.ts`) and commit both, since the SDL text feeds the bundle.

- [ ] **Step 3: Confirm the golden test is genuinely load-bearing**

Temporarily append a space to a description in `examples/shop-api/v3.graphql`, then run:

Run: `pnpm exec vitest run test/example-bundle.test.ts -t "matches okf/shop-api"`
Expected: FAIL, showing the mismatched concept. Revert the edit and confirm it passes again.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the shop-api example and the --now/--resource flags"
```

---

## Verification checklist

Against the spec's definition of done:

| Spec | Verified by |
|---|---|
| `DONE-1` v1 covers every concept kind | Task 4 Step 4 |
| `DONE-2` reconcile behaviors observable | Tasks 5-6 Step 4 |
| `DONE-3` bundle committed with 3 log entries, 2 tombstones, human section | Task 7 Steps 4-5 |
| `DONE-4` passes on Node 24 and 26; re-runs are no-ops | Task 8 Step 2 (CI matrix) |
| `DONE-5` `--now` / `--resource` work; bad `--now` errors | Task 2 Step 4 |
| `DONE-6` all gates pass | Task 8 Step 2 |
| `DONE-7` README documents both examples and flags | Task 8 Step 1 |
| `DONE-8` no absolute paths in the bundle | Task 7 Step 4, and the third test in Task 7 |
