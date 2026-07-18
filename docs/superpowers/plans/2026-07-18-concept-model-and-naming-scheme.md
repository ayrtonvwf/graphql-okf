# Concept Model and Naming Scheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `readSchema(SourceSpec) → Promise<SchemaIr>` — loading a GraphQL schema from an SDL file or a live endpoint and normalizing it into a deterministic, plain-data intermediate representation in which every element carries its resolved concept file path.

**Architecture:** Three layers. `src/source/*` loads and validates a schema with graphql-js, producing a `LoadedSchema`. `src/model/naming.ts` maps a complete set of `{ kind, name }` elements to concept file paths, resolving case-fold collisions per directory. `src/model/project.ts` runs a two-pass walk — collect names, resolve paths, then build IR nodes with paths baked in. Nothing writes files.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), graphql-js v16, Vitest, Biome, knip, tsdown, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-18-concept-model-and-naming-scheme-design.md`

## Global Constraints

- Node.js `>=24`. CI also runs Node 26.
- ESM-first, `"module": "NodeNext"` — **all relative imports must carry a `.js` extension**, even when importing a `.ts` file.
- `"verbatimModuleSyntax": true` — type-only imports **must** use `import type { … }`.
- `"strict": true` and `"noUncheckedIndexedAccess": true` — indexing an array or record yields `T | undefined` and must be narrowed.
- Biome formatting: double quotes, semicolons always, 2-space indent, line width 100, trailing commas everywhere. Run `pnpm run format` before committing if unsure.
- Tests are colocated as `src/**/*.test.ts`, or live under `test/**/*.test.ts`. Both are picked up by Vitest.
- Coverage thresholds are enforced gates, not aspirations: lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.
- **Determinism is load-bearing (`M1/GOAL-8.1`, `M1/NG-6`).** No runtime LLM calls, no wall-clock values, no reliance on `Map`/`Set` iteration order for anything observable. Same input must always produce byte-identical output.
- **No file writing anywhere in this plan.** The deliverable is an in-memory value. Markdown, frontmatter, `index.md` and `log.md` belong to later sub-projects.
- Every task ends green on `pnpm test`. Before the final commit of the last task, `pnpm run coverage`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run knip` and `pnpm run build` must all pass.
- The existing `createOkfBundle` export and `src/cli.ts` are **left untouched**. Wiring the CLI is sub-project D.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/errors.ts` | `GraphqlOkfError` class and the `GraphqlOkfErrorCode` union. Shared by source and model layers. |
| `src/source/types.ts` | `SourceSpec`, `LoadedSchema`, `FetchLike` type declarations. Types only. |
| `src/source/sdl.ts` | `loadFromSdl` — read file, `buildSchema`, `validateSchema`. |
| `src/source/endpoint.ts` | `loadFromEndpoint` — POST introspection query via injectable fetch, `buildClientSchema`. |
| `src/source/index.ts` | `loadSchema` — dispatch on `SourceSpec.kind`. |
| `src/model/ir.ts` | IR type declarations. Types only, no logic. |
| `src/model/naming.ts` | `ConceptKind`, `DIRECTORY_BY_KIND`, `resolvePaths`. Imports nothing from graphql-js. |
| `src/model/project.ts` | `project(LoadedSchema) → SchemaIr`. Two-pass walk. |
| `src/index.ts` | `readSchema` plus IR and error type re-exports. The only supported surface. |
| `test/fixtures/kitchen-sink.graphql` | Fixture schema exercising every element kind and edge case. |
| `test/equivalence.test.ts` | `DOD-G-6` SDL-vs-introspection equality, and determinism. |

---

## Task 1: Dependency and error type

**Files:**
- Modify: `package.json` (add `graphql` dependency)
- Create: `src/errors.ts`
- Test: `src/errors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `GraphqlOkfError` class with `readonly code: GraphqlOkfErrorCode`, `message: string`, `cause: unknown`, `name === "GraphqlOkfError"`. Type `GraphqlOkfErrorCode` — a union of the nine string literals below.

- [ ] **Step 1: Add the graphql dependency**

```bash
pnpm add graphql@^16.11.0
```

This plan targets graphql-js **v16**. Task 9 uses `astFromValue`, which v17 removes.

- [ ] **Step 2: Write the failing test**

Create `src/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GraphqlOkfError } from "./errors.js";

describe("GraphqlOkfError", () => {
  it("carries its code, message, and cause", () => {
    const cause = new Error("underlying");
    const error = new GraphqlOkfError("SOURCE_NOT_FOUND", "no such file: a.graphql", { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GraphqlOkfError");
    expect(error.code).toBe("SOURCE_NOT_FOUND");
    expect(error.message).toBe("no such file: a.graphql");
    expect(error.cause).toBe(cause);
  });

  it("does not require a cause", () => {
    const error = new GraphqlOkfError("SCHEMA_INVALID", "bad schema");

    expect(error.cause).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run src/errors.test.ts`
Expected: FAIL — `Failed to resolve import "./errors.js"`.

- [ ] **Step 4: Write the minimal implementation**

Create `src/errors.ts`:

```ts
export type GraphqlOkfErrorCode =
  | "SOURCE_NOT_FOUND"
  | "SOURCE_UNREADABLE"
  | "SDL_PARSE_ERROR"
  | "SCHEMA_INVALID"
  | "ENDPOINT_UNREACHABLE"
  | "ENDPOINT_HTTP_ERROR"
  | "ENDPOINT_INVALID_RESPONSE"
  | "INTROSPECTION_DISABLED"
  | "NAME_HASH_COLLISION";

export class GraphqlOkfError extends Error {
  readonly code: GraphqlOkfErrorCode;

  constructor(code: GraphqlOkfErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GraphqlOkfError";
    this.code = code;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/errors.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/errors.ts src/errors.test.ts
git commit -m "feat: add GraphqlOkfError and graphql dependency"
```

---

## Task 2: SDL loader

**Files:**
- Create: `src/source/types.ts`, `src/source/sdl.ts`
- Test: `src/source/sdl.test.ts`

**Interfaces:**
- Consumes: `GraphqlOkfError` from `../errors.js`.
- Produces:
  - `type LoadedSchema = { schema: GraphQLSchema; resource: string; origin: "sdl" | "introspection" }`
  - `type FetchLike = (url: string, init: RequestInit) => Promise<Response>`
  - `type SourceSpec = { kind: "sdl"; path: string } | { kind: "endpoint"; url: string; headers?: Record<string, string>; fetch?: FetchLike }`
  - `loadFromSdl(filePath: string): Promise<LoadedSchema>`

- [ ] **Step 1: Write the failing test**

Create `src/source/sdl.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphqlOkfError } from "../errors.js";
import { loadFromSdl } from "./sdl.js";

async function writeSdl(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "graphql-okf-"));
  const path = join(dir, "schema.graphql");
  await writeFile(path, contents, "utf8");
  return path;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as GraphqlOkfError).code;
  }
  throw new Error("expected the promise to reject");
}

describe("loadFromSdl", () => {
  it("builds a schema and reports its origin", async () => {
    const path = await writeSdl("type Query { hello: String }");

    const loaded = await loadFromSdl(path);

    expect(loaded.origin).toBe("sdl");
    expect(loaded.resource).toBe(path);
    expect(loaded.schema.getQueryType()?.name).toBe("Query");
  });

  it("reports a missing file as SOURCE_NOT_FOUND", async () => {
    await expect(codeOf(loadFromSdl("/definitely/missing.graphql"))).resolves.toBe(
      "SOURCE_NOT_FOUND",
    );
  });

  it("reports a directory as SOURCE_UNREADABLE", async () => {
    const dir = await mkdtemp(join(tmpdir(), "graphql-okf-"));

    await expect(codeOf(loadFromSdl(dir))).resolves.toBe("SOURCE_UNREADABLE");
  });

  it("reports a syntax error as SDL_PARSE_ERROR", async () => {
    const path = await writeSdl("type Query {");

    await expect(codeOf(loadFromSdl(path))).resolves.toBe("SDL_PARSE_ERROR");
  });

  it("reports a schema without a query root as SCHEMA_INVALID", async () => {
    const path = await writeSdl("type Thing { name: String }");

    await expect(codeOf(loadFromSdl(path))).resolves.toBe("SCHEMA_INVALID");
  });

  it("names the offending file in the message", async () => {
    const path = await writeSdl("type Query {");

    await expect(loadFromSdl(path)).rejects.toThrow(path);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/source/sdl.test.ts`
Expected: FAIL — `Failed to resolve import "./sdl.js"`.

- [ ] **Step 3: Write the shared source types**

Create `src/source/types.ts`:

```ts
import type { GraphQLSchema } from "graphql";

export type LoadedSchema = {
  readonly schema: GraphQLSchema;
  readonly resource: string;
  readonly origin: "sdl" | "introspection";
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type SourceSpec =
  | { readonly kind: "sdl"; readonly path: string }
  | {
      readonly kind: "endpoint";
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly fetch?: FetchLike;
    };
```

- [ ] **Step 4: Write the minimal implementation**

Create `src/source/sdl.ts`:

```ts
import { readFile } from "node:fs/promises";
import { buildSchema, validateSchema } from "graphql";
import { GraphqlOkfError } from "../errors.js";
import type { LoadedSchema } from "./types.js";

export async function loadFromSdl(filePath: string): Promise<LoadedSchema> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new GraphqlOkfError("SOURCE_NOT_FOUND", `SDL file not found: ${filePath}`, { cause });
    }
    throw new GraphqlOkfError("SOURCE_UNREADABLE", `Could not read SDL file: ${filePath}`, {
      cause,
    });
  }

  let schema: LoadedSchema["schema"];
  try {
    schema = buildSchema(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new GraphqlOkfError(
      "SDL_PARSE_ERROR",
      `Could not parse SDL file ${filePath}: ${detail}`,
      { cause },
    );
  }

  const errors = validateSchema(schema);
  if (errors.length > 0) {
    throw new GraphqlOkfError(
      "SCHEMA_INVALID",
      `Schema in ${filePath} is not valid: ${errors.map((error) => error.message).join("; ")}`,
    );
  }

  return { schema, resource: filePath, origin: "sdl" };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/source/sdl.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/source/types.ts src/source/sdl.ts src/source/sdl.test.ts
git commit -m "feat: load and validate a schema from an SDL file"
```

---

## Task 3: Endpoint loader

**Files:**
- Create: `src/source/endpoint.ts`
- Test: `src/source/endpoint.test.ts`

**Interfaces:**
- Consumes: `GraphqlOkfError`, `LoadedSchema`, `FetchLike`.
- Produces: `loadFromEndpoint(url: string, options?: { headers?: Readonly<Record<string, string>>; fetch?: FetchLike }): Promise<LoadedSchema>`, and `INTROSPECTION_OPTIONS`.

Every test builds its introspection payload in-process with graphql-js — **no network, no local HTTP server**.

> **Critical:** graphql-js v16 defaults `specifiedByUrl`, `directiveIsRepeatable`, `inputValueDeprecation` and `schemaDescription` to **false** in `getIntrospectionQuery()`. Left at their defaults, the introspection path silently loses `specifiedByURL`, `isRepeatable` and input-value deprecation, and the §5.3 equivalence assertion in Task 12 cannot hold. The exported `INTROSPECTION_OPTIONS` constant below turns them all on, and both the loader and every test must use it.

- [ ] **Step 1: Write the failing test**

Create `src/source/endpoint.test.ts`:

```ts
import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { GraphqlOkfError } from "../errors.js";
import { INTROSPECTION_OPTIONS, loadFromEndpoint } from "./endpoint.js";
import type { FetchLike } from "./types.js";

function introspectionPayload(sdl: string): unknown {
  const schema = buildSchema(sdl);
  return graphqlSync({ schema, source: getIntrospectionQuery(INTROSPECTION_OPTIONS) });
}

function respondWith(payload: unknown, init?: { status?: number }): FetchLike {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as GraphqlOkfError).code;
  }
  throw new Error("expected the promise to reject");
}

describe("loadFromEndpoint", () => {
  it("builds a schema from an introspection response", async () => {
    const fetch = respondWith(introspectionPayload("type Query { hello: String }"));

    const loaded = await loadFromEndpoint("https://api.example.com/graphql", { fetch });

    expect(loaded.origin).toBe("introspection");
    expect(loaded.resource).toBe("https://api.example.com/graphql");
    expect(loaded.schema.getQueryType()?.name).toBe("Query");
  });

  it("POSTs the introspection query with the supplied headers", async () => {
    const fetch = respondWith(introspectionPayload("type Query { hello: String }"));

    await loadFromEndpoint("https://api.example.com/graphql", {
      fetch,
      headers: { authorization: "Bearer token" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer token",
    });
    expect(String(init?.body)).toContain("IntrospectionQuery");
  });

  it("reports a network failure as ENDPOINT_UNREACHABLE", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };

    await expect(codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch }))).resolves.toBe(
      "ENDPOINT_UNREACHABLE",
    );
  });

  it("reports a non-2xx response as ENDPOINT_HTTP_ERROR including the status", async () => {
    const fetch = respondWith({}, { status: 503 });

    await expect(loadFromEndpoint("https://api.example.com/graphql", { fetch })).rejects.toThrow(
      "503",
    );
  });

  it("reports a non-JSON body as ENDPOINT_INVALID_RESPONSE", async () => {
    const fetch: FetchLike = async () => new Response("<html>nope</html>", { status: 200 });

    await expect(codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch }))).resolves.toBe(
      "ENDPOINT_INVALID_RESPONSE",
    );
  });

  it("reports a payload without __schema as ENDPOINT_INVALID_RESPONSE", async () => {
    const fetch = respondWith({ data: { something: "else" } });

    await expect(codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch }))).resolves.toBe(
      "ENDPOINT_INVALID_RESPONSE",
    );
  });

  it("recognises a disabled-introspection error", async () => {
    const fetch = respondWith({
      errors: [{ message: "GraphQL introspection is not allowed by this server" }],
    });

    await expect(codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch }))).resolves.toBe(
      "INTROSPECTION_DISABLED",
    );
  });

  it("reports other GraphQL errors as ENDPOINT_INVALID_RESPONSE", async () => {
    const fetch = respondWith({ errors: [{ message: "rate limited" }] });

    await expect(codeOf(loadFromEndpoint("https://api.example.com/graphql", { fetch }))).resolves.toBe(
      "ENDPOINT_INVALID_RESPONSE",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/source/endpoint.test.ts`
Expected: FAIL — `Failed to resolve import "./endpoint.js"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/source/endpoint.ts`:

```ts
import { buildClientSchema, getIntrospectionQuery } from "graphql";
import type { IntrospectionOptions, IntrospectionQuery } from "graphql";
import { GraphqlOkfError } from "../errors.js";
import type { FetchLike, LoadedSchema } from "./types.js";

/**
 * graphql-js v16 defaults every one of these to false. Without them the
 * introspection path loses specifiedByURL, directive repeatability and
 * input-value deprecation, breaking SDL/introspection equivalence (spec §5.3).
 */
export const INTROSPECTION_OPTIONS: IntrospectionOptions = {
  descriptions: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
  schemaDescription: true,
  inputValueDeprecation: true,
};

type GraphqlResponse = {
  readonly data?: unknown;
  readonly errors?: readonly { readonly message?: unknown }[];
};

function errorMessages(payload: GraphqlResponse): readonly string[] {
  if (!Array.isArray(payload.errors)) {
    return [];
  }
  return payload.errors.map((error) => String(error?.message ?? ""));
}

export async function loadFromEndpoint(
  url: string,
  options: { headers?: Readonly<Record<string, string>>; fetch?: FetchLike } = {},
): Promise<LoadedSchema> {
  const doFetch = options.fetch ?? globalThis.fetch;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ query: getIntrospectionQuery(INTROSPECTION_OPTIONS) }),
    });
  } catch (cause) {
    throw new GraphqlOkfError(
      "ENDPOINT_UNREACHABLE",
      `Could not reach GraphQL endpoint ${url}`,
      { cause },
    );
  }

  if (!response.ok) {
    throw new GraphqlOkfError(
      "ENDPOINT_HTTP_ERROR",
      `GraphQL endpoint ${url} responded with HTTP ${response.status}`,
    );
  }

  let payload: GraphqlResponse;
  try {
    payload = (await response.json()) as GraphqlResponse;
  } catch (cause) {
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} did not return JSON`,
      { cause },
    );
  }

  const messages = errorMessages(payload);
  if (messages.length > 0) {
    const disabled = messages.some((message) => /introspection/i.test(message));
    if (disabled) {
      throw new GraphqlOkfError(
        "INTROSPECTION_DISABLED",
        `GraphQL endpoint ${url} has introspection disabled (${messages.join("; ")}). ` +
          "Supply an SDL file instead.",
      );
    }
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} returned errors: ${messages.join("; ")}`,
    );
  }

  const data = payload.data;
  if (typeof data !== "object" || data === null || !("__schema" in data)) {
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} did not return an introspection result`,
    );
  }

  try {
    const schema = buildClientSchema(data as unknown as IntrospectionQuery);
    return { schema, resource: url, origin: "introspection" };
  } catch (cause) {
    throw new GraphqlOkfError(
      "ENDPOINT_INVALID_RESPONSE",
      `GraphQL endpoint ${url} returned an introspection result that could not be built`,
      { cause },
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/source/endpoint.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/source/endpoint.ts src/source/endpoint.test.ts
git commit -m "feat: load a schema by introspecting a live endpoint"
```

---

## Task 4: Source dispatch

**Files:**
- Create: `src/source/index.ts`
- Test: `src/source/index.test.ts`

**Interfaces:**
- Consumes: `loadFromSdl`, `loadFromEndpoint`, `SourceSpec`, `LoadedSchema`.
- Produces: `loadSchema(spec: SourceSpec): Promise<LoadedSchema>`, plus re-exports of `SourceSpec`, `LoadedSchema`, `FetchLike`.

- [ ] **Step 1: Write the failing test**

Create `src/source/index.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import { describe, expect, it } from "vitest";
import { loadSchema } from "./index.js";
import type { FetchLike } from "./types.js";

describe("loadSchema", () => {
  it("dispatches an sdl spec to the file loader", async () => {
    const dir = await mkdtemp(join(tmpdir(), "graphql-okf-"));
    const path = join(dir, "schema.graphql");
    await writeFile(path, "type Query { hello: String }", "utf8");

    const loaded = await loadSchema({ kind: "sdl", path });

    expect(loaded.origin).toBe("sdl");
  });

  it("dispatches an endpoint spec to the introspection loader", async () => {
    const payload = graphqlSync({
      schema: buildSchema("type Query { hello: String }"),
      source: getIntrospectionQuery(),
    });
    const fetch: FetchLike = async () => new Response(JSON.stringify(payload), { status: 200 });

    const loaded = await loadSchema({ kind: "endpoint", url: "https://x.test/graphql", fetch });

    expect(loaded.origin).toBe("introspection");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/source/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index.js"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/source/index.ts`:

```ts
import { loadFromEndpoint } from "./endpoint.js";
import { loadFromSdl } from "./sdl.js";
import type { LoadedSchema, SourceSpec } from "./types.js";

export type { FetchLike, LoadedSchema, SourceSpec } from "./types.js";

export async function loadSchema(spec: SourceSpec): Promise<LoadedSchema> {
  if (spec.kind === "sdl") {
    return loadFromSdl(spec.path);
  }
  return loadFromEndpoint(spec.url, { headers: spec.headers, fetch: spec.fetch });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/source/index.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/source/index.ts src/source/index.test.ts
git commit -m "feat: dispatch a source spec to the matching loader"
```

---

## Task 5: Naming — kind to directory

**Files:**
- Create: `src/model/naming.ts`
- Test: `src/model/naming.test.ts`

**Interfaces:**
- Consumes: nothing (this module imports **nothing from graphql-js** — that is a design constraint, not an accident).
- Produces:
  - `type ConceptKind = "object" | "interface" | "union" | "enum" | "input" | "scalar" | "query" | "mutation" | "subscription" | "directive"`
  - `const DIRECTORY_BY_KIND: Record<ConceptKind, string>`
  - `type ElementName = { readonly kind: ConceptKind; readonly name: string }`
  - `function elementId(element: ElementName): string` — returns `` `${kind}:${name}` ``
  - `function resolvePaths(elements: readonly ElementName[]): ReadonlyMap<string, string>` — keyed by `elementId`, valued by concept path.

This task implements the happy path only. Collisions come in Task 6.

- [ ] **Step 1: Write the failing test**

Create `src/model/naming.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIRECTORY_BY_KIND, elementId, resolvePaths } from "./naming.js";

describe("DIRECTORY_BY_KIND", () => {
  it("maps every concept kind to its documented directory", () => {
    expect(DIRECTORY_BY_KIND).toEqual({
      object: "types/objects",
      interface: "types/interfaces",
      union: "types/unions",
      enum: "types/enums",
      input: "types/inputs",
      scalar: "types/scalars",
      query: "queries",
      mutation: "mutations",
      subscription: "subscriptions",
      directive: "directives",
    });
  });
});

describe("resolvePaths", () => {
  it("uses the exact GraphQL name as the filename", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "enum", name: "Role" },
      { kind: "query", name: "user" },
      { kind: "directive", name: "auth" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe("types/objects/User.md");
    expect(paths.get(elementId({ kind: "enum", name: "Role" }))).toBe("types/enums/Role.md");
    expect(paths.get(elementId({ kind: "query", name: "user" }))).toBe("queries/user.md");
    expect(paths.get(elementId({ kind: "directive", name: "auth" }))).toBe("directives/auth.md");
  });

  it("does not suffix names that collide only across different directories", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "enum", name: "User" },
      { kind: "input", name: "user" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe("types/objects/User.md");
    expect(paths.get(elementId({ kind: "enum", name: "User" }))).toBe("types/enums/User.md");
    expect(paths.get(elementId({ kind: "input", name: "user" }))).toBe("types/inputs/user.md");
  });

  it("returns one entry per input element", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "Post" },
    ]);

    expect(paths.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/model/naming.test.ts`
Expected: FAIL — `Failed to resolve import "./naming.js"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/model/naming.ts`:

```ts
export type ConceptKind =
  | "object"
  | "interface"
  | "union"
  | "enum"
  | "input"
  | "scalar"
  | "query"
  | "mutation"
  | "subscription"
  | "directive";

export const DIRECTORY_BY_KIND: Record<ConceptKind, string> = {
  object: "types/objects",
  interface: "types/interfaces",
  union: "types/unions",
  enum: "types/enums",
  input: "types/inputs",
  scalar: "types/scalars",
  query: "queries",
  mutation: "mutations",
  subscription: "subscriptions",
  directive: "directives",
};

export type ElementName = {
  readonly kind: ConceptKind;
  readonly name: string;
};

export function elementId(element: ElementName): string {
  return `${element.kind}:${element.name}`;
}

export function resolvePaths(elements: readonly ElementName[]): ReadonlyMap<string, string> {
  const paths = new Map<string, string>();
  for (const element of elements) {
    const directory = DIRECTORY_BY_KIND[element.kind];
    paths.set(elementId(element), `${directory}/${element.name}.md`);
  }
  return paths;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/model/naming.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/model/naming.ts src/model/naming.test.ts
git commit -m "feat: map each concept kind to its bundle directory"
```

---

## Task 6: Naming — collision and reserved-name resolution

**Files:**
- Modify: `src/model/naming.ts`
- Test: `src/model/naming.test.ts` (append)

**Interfaces:**
- Consumes: `ConceptKind`, `ElementName`, `elementId`, `DIRECTORY_BY_KIND` from Task 5. `GraphqlOkfError` from `../errors.js`.
- Produces: `resolvePaths` with the same signature, now suffixing colliding and reserved names.

**The rules (spec §4.5):**
- Resolution is scoped **per directory**.
- A name is suffixed with `-<first 8 hex chars of SHA-256 of the exact name>` when, within its directory, either (a) another name case-folds to the same string, or (b) its own case-fold equals `index` or `log`.
- When (a) fires, **all** members of the colliding set are suffixed — never just one.
- Suffixed names can never collide with unsuffixed ones, because `-` cannot appear in a GraphQL name.
- If two distinct names still case-fold to the same final basename, throw `NAME_HASH_COLLISION`.

- [ ] **Step 1: Write the failing tests**

Append to `src/model/naming.test.ts`:

```ts
import { createHash } from "node:crypto";

function hashOf(name: string): string {
  return createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8);
}

describe("resolvePaths collisions", () => {
  it("suffixes every member of a case-fold collision set", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
    ]);

    expect(paths.get(elementId({ kind: "object", name: "User" }))).toBe(
      `types/objects/User-${hashOf("User")}.md`,
    );
    expect(paths.get(elementId({ kind: "object", name: "user" }))).toBe(
      `types/objects/user-${hashOf("user")}.md`,
    );
  });

  it("suffixes names that would shadow the reserved index.md", () => {
    const paths = resolvePaths([{ kind: "object", name: "index" }]);

    expect(paths.get(elementId({ kind: "object", name: "index" }))).toBe(
      `types/objects/index-${hashOf("index")}.md`,
    );
  });

  it("suffixes names that would shadow the reserved log.md, case-insensitively", () => {
    const paths = resolvePaths([{ kind: "query", name: "Log" }]);

    expect(paths.get(elementId({ kind: "query", name: "Log" }))).toBe(
      `queries/Log-${hashOf("Log")}.md`,
    );
  });

  it("is independent of input order", () => {
    const elements: { kind: "object"; name: string }[] = [
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
      { kind: "object", name: "Post" },
      { kind: "object", name: "index" },
      { kind: "object", name: "Comment" },
    ];
    const forward = resolvePaths(elements);
    const reversed = resolvePaths([...elements].reverse());

    for (const element of elements) {
      expect(reversed.get(elementId(element))).toBe(forward.get(elementId(element)));
    }
  });

  it("does not suffix a name merely because another directory has a collision", () => {
    const paths = resolvePaths([
      { kind: "object", name: "User" },
      { kind: "object", name: "user" },
      { kind: "enum", name: "User" },
    ]);

    expect(paths.get(elementId({ kind: "enum", name: "User" }))).toBe("types/enums/User.md");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/model/naming.test.ts`
Expected: FAIL — 5 new failures, e.g. `expected 'types/objects/User.md' to be 'types/objects/User-<hash>.md'`.

- [ ] **Step 3: Rewrite the implementation**

Replace the `resolvePaths` function in `src/model/naming.ts` with the following, and add the two imports at the top of the file:

```ts
import { createHash } from "node:crypto";
import { GraphqlOkfError } from "../errors.js";
```

```ts
const RESERVED_BASENAMES = new Set(["index", "log"]);

function shortHash(name: string): string {
  return createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8);
}

export function resolvePaths(elements: readonly ElementName[]): ReadonlyMap<string, string> {
  const byDirectory = new Map<string, ElementName[]>();
  for (const element of elements) {
    const directory = DIRECTORY_BY_KIND[element.kind];
    const bucket = byDirectory.get(directory);
    if (bucket === undefined) {
      byDirectory.set(directory, [element]);
    } else {
      bucket.push(element);
    }
  }

  const paths = new Map<string, string>();

  for (const [directory, bucket] of byDirectory) {
    const foldCounts = new Map<string, number>();
    for (const element of bucket) {
      const fold = element.name.toLowerCase();
      foldCounts.set(fold, (foldCounts.get(fold) ?? 0) + 1);
    }

    const takenFolds = new Map<string, string>();

    for (const element of bucket) {
      const fold = element.name.toLowerCase();
      const collides = (foldCounts.get(fold) ?? 0) > 1;
      const reserved = RESERVED_BASENAMES.has(fold);
      const basename = collides || reserved ? `${element.name}-${shortHash(element.name)}` : element.name;

      const basenameFold = basename.toLowerCase();
      const previous = takenFolds.get(basenameFold);
      /* v8 ignore next 7 -- defensive: unreachable for any legal GraphQL schema, see note below */
      if (previous !== undefined && previous !== element.name) {
        throw new GraphqlOkfError(
          "NAME_HASH_COLLISION",
          `"${previous}" and "${element.name}" both resolve to ${directory}/${basename}.md. ` +
            "Rename one of them in the schema.",
        );
      }
      takenFolds.set(basenameFold, element.name);

      paths.set(elementId(element), `${directory}/${basename}.md`);
    }
  }

  return paths;
}
```

Note the two-stage check: `collides` is computed from counts gathered over the **whole** bucket before any decision is made, which is what makes the result order-independent.

> **On `NAME_HASH_COLLISION` and the spec's DoD.** This guard is unreachable for any legal GraphQL schema. GraphQL names match `/[_A-Za-z][_0-9A-Za-z]*/`, so `-` cannot occur in a name, meaning a suffixed basename can never collide with an unsuffixed one; and two suffixed siblings collide only if SHA-256 yields identical 8-character prefixes for two distinct strings. It is kept as defence in depth against a future change to the suffix rule, and excluded from coverage with `/* v8 ignore */` — matching the existing convention in `src/cli.ts`.
>
> This contradicts the spec's §8 line "Every error code in §6 is reachable and tested." **Amend that DoD line to exempt `NAME_HASH_COLLISION`** as a documented defensive guard. Do not attempt to satisfy it by mocking `createHash` — a test that fakes a hash collision verifies the mock, not the code.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/model/naming.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/model/naming.ts src/model/naming.test.ts
git commit -m "feat: resolve case-fold and reserved-name collisions in concept paths"
```

---

## Task 7: IR types and projection of scalars and enums

**Files:**
- Create: `src/model/ir.ts`, `src/model/project.ts`
- Test: `src/model/project.test.ts`

**Interfaces:**
- Consumes: `LoadedSchema`, `resolvePaths`, `elementId`, `ConceptKind`.
- Produces:
  - The full IR type surface in `src/model/ir.ts` (declared now, populated across Tasks 7–11).
  - `project(loaded: LoadedSchema): SchemaIr`

Declaring every IR type now — rather than growing it task by task — means later tasks never have to revisit the type file, and every task's code type-checks against the final shape.

- [ ] **Step 1: Write the IR types**

Create `src/model/ir.ts`:

```ts
import type { ConceptKind } from "./naming.js";

export type TypeRef = {
  readonly wrappers: readonly ("nonNull" | "list")[];
  readonly name: string;
  readonly path: string;
};

export type Deprecation = { readonly reason: string | null };

export type AppliedDirective = {
  readonly name: string;
  readonly path: string;
  readonly args: readonly { readonly name: string; readonly value: string }[];
};

type ConceptBase = {
  readonly kind: ConceptKind;
  readonly name: string;
  readonly path: string;
  readonly description: string | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type InputValueNode = {
  readonly name: string;
  readonly description: string | null;
  readonly type: TypeRef;
  readonly defaultValue: string | null;
  readonly deprecation: Deprecation | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type FieldNode = {
  readonly name: string;
  readonly description: string | null;
  readonly type: TypeRef;
  readonly args: readonly InputValueNode[];
  readonly deprecation: Deprecation | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type EnumValueNode = {
  readonly name: string;
  readonly description: string | null;
  readonly deprecation: Deprecation | null;
  readonly appliedDirectives: readonly AppliedDirective[];
};

export type ObjectTypeNode = ConceptBase & {
  readonly kind: "object";
  readonly fields: readonly FieldNode[];
  readonly interfaces: readonly TypeRef[];
};

export type InterfaceTypeNode = ConceptBase & {
  readonly kind: "interface";
  readonly fields: readonly FieldNode[];
  readonly interfaces: readonly TypeRef[];
  readonly implementedBy: readonly TypeRef[];
};

export type UnionTypeNode = ConceptBase & {
  readonly kind: "union";
  readonly members: readonly TypeRef[];
};

export type EnumTypeNode = ConceptBase & {
  readonly kind: "enum";
  readonly values: readonly EnumValueNode[];
};

export type InputObjectTypeNode = ConceptBase & {
  readonly kind: "input";
  readonly fields: readonly InputValueNode[];
};

export type ScalarTypeNode = ConceptBase & {
  readonly kind: "scalar";
  readonly specifiedByUrl: string | null;
  readonly isBuiltIn: boolean;
};

export type OperationNode = ConceptBase & {
  readonly kind: "query" | "mutation" | "subscription";
  readonly args: readonly InputValueNode[];
  readonly type: TypeRef;
  readonly deprecation: Deprecation | null;
};

export type DirectiveDefinitionNode = ConceptBase & {
  readonly kind: "directive";
  readonly locations: readonly string[];
  readonly args: readonly InputValueNode[];
  readonly isRepeatable: boolean;
  readonly isBuiltIn: boolean;
};

export type ConceptNode =
  | ObjectTypeNode
  | InterfaceTypeNode
  | UnionTypeNode
  | EnumTypeNode
  | InputObjectTypeNode
  | ScalarTypeNode
  | OperationNode
  | DirectiveDefinitionNode;

export type SchemaIr = {
  readonly resource: string;
  readonly origin: "sdl" | "introspection";
  readonly concepts: readonly ConceptNode[];
};
```

- [ ] **Step 2: Write the failing test**

Create `src/model/project.test.ts`:

```ts
import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { LoadedSchema } from "../source/types.js";
import type { ConceptNode, EnumTypeNode, ScalarTypeNode } from "./ir.js";
import { project } from "./project.js";

export function loadedFrom(sdl: string): LoadedSchema {
  return { schema: buildSchema(sdl), resource: "test.graphql", origin: "sdl" };
}

export function conceptAt(concepts: readonly ConceptNode[], path: string): ConceptNode {
  const found = concepts.find((concept) => concept.path === path);
  if (found === undefined) {
    throw new Error(`no concept at ${path}; have ${concepts.map((c) => c.path).join(", ")}`);
  }
  return found;
}

describe("project", () => {
  it("carries the resource and origin through", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));

    expect(ir.resource).toBe("test.graphql");
    expect(ir.origin).toBe("sdl");
  });

  it("emits built-in scalars as concepts", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));
    const scalar = conceptAt(ir.concepts, "types/scalars/String.md") as ScalarTypeNode;

    expect(scalar.kind).toBe("scalar");
    expect(scalar.isBuiltIn).toBe(true);
  });

  it("emits custom scalars with their specifiedBy url", () => {
    const ir = project(
      loadedFrom(`
        scalar DateTime @specifiedBy(url: "https://scalars.test/datetime")
        type Query { at: DateTime }
      `),
    );
    const scalar = conceptAt(ir.concepts, "types/scalars/DateTime.md") as ScalarTypeNode;

    expect(scalar.isBuiltIn).toBe(false);
    expect(scalar.specifiedByUrl).toBe("https://scalars.test/datetime");
    expect(scalar.appliedDirectives).toEqual([]);
  });

  it("emits enums with alphabetically sorted values and their descriptions", () => {
    const ir = project(
      loadedFrom(`
        """Access level."""
        enum Role {
          "Full access."
          OWNER
          ADMIN
          VIEWER @deprecated(reason: "use READER")
        }
        type Query { role: Role }
      `),
    );
    const role = conceptAt(ir.concepts, "types/enums/Role.md") as EnumTypeNode;

    expect(role.description).toBe("Access level.");
    expect(role.values.map((value) => value.name)).toEqual(["ADMIN", "OWNER", "VIEWER"]);
    expect(role.values[1]?.description).toBe("Full access.");
    expect(role.values[2]?.deprecation).toEqual({ reason: "use READER" });
    expect(role.values[0]?.deprecation).toBeNull();
  });

  it("excludes introspection meta types", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));

    expect(ir.concepts.some((concept) => concept.name.startsWith("__"))).toBe(false);
  });

  it("sorts concepts by path", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));
    const paths = ir.concepts.map((concept) => concept.path);

    expect(paths).toEqual([...paths].sort());
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: FAIL — `Failed to resolve import "./project.js"`.

- [ ] **Step 4: Write the minimal implementation**

Create `src/model/project.ts`:

```ts
import {
  type GraphQLEnumType,
  type GraphQLNamedType,
  type GraphQLScalarType,
  isEnumType,
  isScalarType,
  isSpecifiedScalarType,
} from "graphql";
import type { LoadedSchema } from "../source/types.js";
import type { ConceptNode, EnumTypeNode, ScalarTypeNode, SchemaIr } from "./ir.js";
import { type ConceptKind, type ElementName, elementId, resolvePaths } from "./naming.js";

function byName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function deprecationOf(reason: string | null | undefined) {
  return reason === null || reason === undefined ? null : { reason };
}

function kindOfNamedType(type: GraphQLNamedType): ConceptKind | null {
  if (isScalarType(type)) return "scalar";
  if (isEnumType(type)) return "enum";
  return null;
}

export function project(loaded: LoadedSchema): SchemaIr {
  const { schema } = loaded;

  const namedTypes = Object.values(schema.getTypeMap()).filter(
    (type) => !type.name.startsWith("__"),
  );

  const elements: ElementName[] = [];
  for (const type of namedTypes) {
    const kind = kindOfNamedType(type);
    if (kind !== null) {
      elements.push({ kind, name: type.name });
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

  const concepts: ConceptNode[] = [];

  for (const type of namedTypes) {
    if (isScalarType(type)) {
      concepts.push(scalarConcept(type, pathFor({ kind: "scalar", name: type.name })));
    } else if (isEnumType(type)) {
      concepts.push(enumConcept(type, pathFor({ kind: "enum", name: type.name })));
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/model/ir.ts src/model/project.ts src/model/project.test.ts
git commit -m "feat: project scalar and enum types into the concept IR"
```

---

## Task 8: Type references and object/interface types

**Files:**
- Modify: `src/model/project.ts`
- Test: `src/model/project.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 7.
- Produces: `project` additionally emitting `ObjectTypeNode` and `InterfaceTypeNode`, with `TypeRef` values carrying `wrappers` outermost-first.

Root operation types are still emitted as objects at this stage; Task 10 excludes them. Do not try to handle that here.

- [ ] **Step 1: Write the failing tests**

Append to `src/model/project.test.ts`:

```ts
import type { InterfaceTypeNode, ObjectTypeNode } from "./ir.js";

describe("project object and interface types", () => {
  it("records wrappers outermost-first and links to the named type", () => {
    const ir = project(
      loadedFrom(`
        type User { tags: [[String!]]! }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields[0]?.type).toEqual({
      wrappers: ["nonNull", "list", "list", "nonNull"],
      name: "String",
      path: "types/scalars/String.md",
    });
  });

  it("sorts fields and arguments alphabetically", () => {
    const ir = project(
      loadedFrom(`
        type User {
          name(upper: Boolean, locale: String): String
          age: Int
        }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields.map((field) => field.name)).toEqual(["age", "name"]);
    expect(user.fields[1]?.args.map((arg) => arg.name)).toEqual(["locale", "upper"]);
  });

  it("surfaces field deprecation", () => {
    const ir = project(
      loadedFrom(`
        type User { nickname: String @deprecated }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.fields[0]?.deprecation).toEqual({ reason: "No longer supported" });
  });

  it("links an object to the interfaces it implements", () => {
    const ir = project(
      loadedFrom(`
        interface Node { id: ID! }
        type User implements Node { id: ID! }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.interfaces).toEqual([
      { wrappers: [], name: "Node", path: "types/interfaces/Node.md" },
    ]);
  });

  it("records implementedBy on an interface, including interfaces implementing interfaces", () => {
    const ir = project(
      loadedFrom(`
        interface Node { id: ID! }
        interface Entity implements Node { id: ID! }
        type User implements Node & Entity { id: ID! }
        type Query { user: User }
      `),
    );
    const node = conceptAt(ir.concepts, "types/interfaces/Node.md") as InterfaceTypeNode;

    expect(node.implementedBy.map((ref) => ref.name)).toEqual(["Entity", "User"]);
    expect(node.implementedBy.map((ref) => ref.path)).toEqual([
      "types/interfaces/Entity.md",
      "types/objects/User.md",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: FAIL — `no concept at types/objects/User.md`.

- [ ] **Step 3: Extend the implementation**

In `src/model/project.ts`, extend the graphql import list and add the new helpers.

Replace the import block with:

```ts
import {
  type GraphQLArgument,
  type GraphQLEnumType,
  type GraphQLField,
  type GraphQLInterfaceType,
  type GraphQLNamedType,
  type GraphQLObjectType,
  type GraphQLScalarType,
  type GraphQLType,
  isEnumType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isSpecifiedScalarType,
} from "graphql";
```

Extend the IR import to include the new node types:

```ts
import type {
  ConceptNode,
  EnumTypeNode,
  FieldNode,
  InputValueNode,
  InterfaceTypeNode,
  ObjectTypeNode,
  ScalarTypeNode,
  SchemaIr,
  TypeRef,
} from "./ir.js";
```

Extend `kindOfNamedType`:

```ts
function kindOfNamedType(type: GraphQLNamedType): ConceptKind | null {
  if (isScalarType(type)) return "scalar";
  if (isEnumType(type)) return "enum";
  if (isObjectType(type)) return "object";
  if (isInterfaceType(type)) return "interface";
  return null;
}
```

Add these functions to the module:

```ts
function toTypeRef(type: GraphQLType, pathFor: (element: ElementName) => string): TypeRef {
  const wrappers: ("nonNull" | "list")[] = [];
  let current: GraphQLType = type;
  while (isNonNullType(current) || isListType(current)) {
    wrappers.push(isNonNullType(current) ? "nonNull" : "list");
    current = current.ofType;
  }
  const named = current as GraphQLNamedType;
  const kind = kindOfNamedType(named);
  if (kind === null) {
    throw new Error(`unsupported named type ${named.name}`);
  }
  return { wrappers, name: named.name, path: pathFor({ kind, name: named.name }) };
}

function argNode(arg: GraphQLArgument, pathFor: (element: ElementName) => string): InputValueNode {
  return {
    name: arg.name,
    description: arg.description ?? null,
    type: toTypeRef(arg.type, pathFor),
    defaultValue: null,
    deprecation: deprecationOf(arg.deprecationReason),
    appliedDirectives: [],
  };
}

function fieldNode(
  field: GraphQLField<unknown, unknown>,
  pathFor: (element: ElementName) => string,
): FieldNode {
  return {
    name: field.name,
    description: field.description ?? null,
    type: toTypeRef(field.type, pathFor),
    args: byName(field.args).map((arg) => argNode(arg, pathFor)),
    deprecation: deprecationOf(field.deprecationReason),
    appliedDirectives: [],
  };
}
```

Inside `project`, after `const pathFor = …`, add the implementors index:

```ts
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
```

Then extend the concept-building loop with two more branches:

```ts
    } else if (isObjectType(type)) {
      concepts.push(objectConcept(type, pathFor({ kind: "object", name: type.name }), pathFor));
    } else if (isInterfaceType(type)) {
      concepts.push(
        interfaceConcept(
          type,
          pathFor({ kind: "interface", name: type.name }),
          pathFor,
          implementorsByInterface.get(type.name) ?? [],
        ),
      );
    }
```

And add the two builders:

```ts
function objectConcept(
  type: GraphQLObjectType,
  path: string,
  pathFor: (element: ElementName) => string,
): ObjectTypeNode {
  return {
    kind: "object",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    fields: byName(Object.values(type.getFields())).map((field) => fieldNode(field, pathFor)),
    interfaces: byName(type.getInterfaces()).map((each) => toTypeRef(each, pathFor)),
  };
}

function interfaceConcept(
  type: GraphQLInterfaceType,
  path: string,
  pathFor: (element: ElementName) => string,
  implementors: readonly ElementName[],
): InterfaceTypeNode {
  return {
    kind: "interface",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    fields: byName(Object.values(type.getFields())).map((field) => fieldNode(field, pathFor)),
    interfaces: byName(type.getInterfaces()).map((each) => toTypeRef(each, pathFor)),
    implementedBy: byName([...implementors]).map((implementor) => ({
      wrappers: [],
      name: implementor.name,
      path: pathFor(implementor),
    })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/model/project.ts src/model/project.test.ts
git commit -m "feat: project object and interface types with linked type references"
```

---

## Task 9: Unions, input objects, and default values

**Files:**
- Modify: `src/model/project.ts`
- Test: `src/model/project.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 8.
- Produces: `project` additionally emitting `UnionTypeNode` and `InputObjectTypeNode`, and populating `InputValueNode.defaultValue` as a printed GraphQL literal string on both arguments and input fields.

- [ ] **Step 1: Write the failing tests**

Append to `src/model/project.test.ts`:

```ts
import type { InputObjectTypeNode, UnionTypeNode } from "./ir.js";

describe("project unions, inputs, and default values", () => {
  it("links a union to each of its members, sorted", () => {
    const ir = project(
      loadedFrom(`
        type Post { id: ID! }
        type Comment { id: ID! }
        union Content = Post | Comment
        type Query { content: Content }
      `),
    );
    const content = conceptAt(ir.concepts, "types/unions/Content.md") as UnionTypeNode;

    expect(content.members).toEqual([
      { wrappers: [], name: "Comment", path: "types/objects/Comment.md" },
      { wrappers: [], name: "Post", path: "types/objects/Post.md" },
    ]);
  });

  it("projects input object fields with links", () => {
    const ir = project(
      loadedFrom(`
        input OrderInput { sku: String!, quantity: Int }
        type Query { order(input: OrderInput): String }
      `),
    );
    const input = conceptAt(ir.concepts, "types/inputs/OrderInput.md") as InputObjectTypeNode;

    expect(input.fields.map((field) => field.name)).toEqual(["quantity", "sku"]);
    expect(input.fields[1]?.type).toEqual({
      wrappers: ["nonNull"],
      name: "String",
      path: "types/scalars/String.md",
    });
  });

  it("prints default values as GraphQL literals", () => {
    const ir = project(
      loadedFrom(`
        enum Role { ADMIN VIEWER }
        input Filter {
          limit: Int = 10
          label: String = "all"
          active: Boolean = true
          role: Role = VIEWER
          tags: [String!] = ["a", "b"]
          missing: String
        }
        type Query { search(filter: Filter): String }
      `),
    );
    const filter = conceptAt(ir.concepts, "types/inputs/Filter.md") as InputObjectTypeNode;
    const defaults = Object.fromEntries(
      filter.fields.map((field) => [field.name, field.defaultValue]),
    );

    expect(defaults).toEqual({
      active: "true",
      label: '"all"',
      limit: "10",
      missing: null,
      role: "VIEWER",
      tags: '["a", "b"]',
    });
  });

  it("prints default values on field arguments too", () => {
    const ir = project(
      loadedFrom(`
        type Query { search(limit: Int = 25): String }
        type Wrapper { search(limit: Int = 25): String }
      `),
    );
    const wrapper = conceptAt(ir.concepts, "types/objects/Wrapper.md") as ObjectTypeNode;

    expect(wrapper.fields[0]?.args[0]?.defaultValue).toBe("25");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: FAIL — `no concept at types/unions/Content.md`.

- [ ] **Step 3: Extend the implementation**

Add to the graphql import list in `src/model/project.ts`:

```ts
  type GraphQLInputField,
  type GraphQLInputObjectType,
  type GraphQLUnionType,
  astFromValue,
  isInputObjectType,
  isUnionType,
  print,
```

Add to the IR import list:

```ts
  InputObjectTypeNode,
  UnionTypeNode,
```

Extend `kindOfNamedType` with two more branches, placed before the final `return null`:

```ts
  if (isUnionType(type)) return "union";
  if (isInputObjectType(type)) return "input";
```

Add the default-value printer:

```ts
function printDefaultValue(
  input: GraphQLArgument | GraphQLInputField,
): string | null {
  if (input.defaultValue === undefined) {
    return null;
  }
  const ast = astFromValue(input.defaultValue, input.type);
  return ast === null ? null : print(ast);
}
```

Replace `argNode`'s `defaultValue: null,` with `defaultValue: printDefaultValue(arg),`.

Add the input-field builder:

```ts
function inputFieldNode(
  field: GraphQLInputField,
  pathFor: (element: ElementName) => string,
): InputValueNode {
  return {
    name: field.name,
    description: field.description ?? null,
    type: toTypeRef(field.type, pathFor),
    defaultValue: printDefaultValue(field),
    deprecation: deprecationOf(field.deprecationReason),
    appliedDirectives: [],
  };
}
```

Extend the concept-building loop with two more branches:

```ts
    } else if (isUnionType(type)) {
      concepts.push(unionConcept(type, pathFor({ kind: "union", name: type.name }), pathFor));
    } else if (isInputObjectType(type)) {
      concepts.push(inputConcept(type, pathFor({ kind: "input", name: type.name }), pathFor));
    }
```

And the two builders:

```ts
function unionConcept(
  type: GraphQLUnionType,
  path: string,
  pathFor: (element: ElementName) => string,
): UnionTypeNode {
  return {
    kind: "union",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    members: byName(type.getTypes()).map((member) => toTypeRef(member, pathFor)),
  };
}

function inputConcept(
  type: GraphQLInputObjectType,
  path: string,
  pathFor: (element: ElementName) => string,
): InputObjectTypeNode {
  return {
    kind: "input",
    name: type.name,
    path,
    description: type.description ?? null,
    appliedDirectives: [],
    fields: byName(Object.values(type.getFields())).map((field) => inputFieldNode(field, pathFor)),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/model/project.ts src/model/project.test.ts
git commit -m "feat: project unions, input objects, and printed default values"
```

---

## Task 10: Root operations

**Files:**
- Modify: `src/model/project.ts`
- Test: `src/model/project.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 9.
- Produces: `project` emitting one `OperationNode` per root field, excluding root operation types from `types/objects/`, and resolving references to a root type to that operation directory's `index.md`.

**Rules (spec §4.4):** the root types are whatever `schema.getQueryType()`, `getMutationType()` and `getSubscriptionType()` return — they need not be named `Query`. They are excluded from `types/objects/`. A `TypeRef` pointing at a root type resolves to `queries/index.md`, `mutations/index.md` or `subscriptions/index.md`.

- [ ] **Step 1: Write the failing tests**

Append to `src/model/project.test.ts`:

```ts
import type { OperationNode } from "./ir.js";

describe("project root operations", () => {
  it("emits one concept per root field under the matching directory", () => {
    const ir = project(
      loadedFrom(`
        type User { id: ID! }
        type Query { user(id: ID!): User, users: [User!]! }
        type Mutation { createUser(name: String!): User }
        type Subscription { userChanged: User }
      `),
    );

    const user = conceptAt(ir.concepts, "queries/user.md") as OperationNode;
    expect(user.kind).toBe("query");
    expect(user.args.map((arg) => arg.name)).toEqual(["id"]);
    expect(user.type).toEqual({ wrappers: [], name: "User", path: "types/objects/User.md" });

    expect(conceptAt(ir.concepts, "queries/users.md").kind).toBe("query");
    expect(conceptAt(ir.concepts, "mutations/createUser.md").kind).toBe("mutation");
    expect(conceptAt(ir.concepts, "subscriptions/userChanged.md").kind).toBe("subscription");
  });

  it("does not emit root operation types as object concepts", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));

    expect(ir.concepts.some((concept) => concept.path === "types/objects/Query.md")).toBe(false);
  });

  it("honours non-default root type names", () => {
    const ir = project(
      loadedFrom(`
        schema { query: RootQuery }
        type RootQuery { hello: String }
      `),
    );

    expect(conceptAt(ir.concepts, "queries/hello.md").kind).toBe("query");
    expect(ir.concepts.some((concept) => concept.path === "types/objects/RootQuery.md")).toBe(false);
  });

  it("links a reference to a root type at the operation directory index", () => {
    const ir = project(
      loadedFrom(`
        type Query { hello: String, self: Query }
      `),
    );
    const self = conceptAt(ir.concepts, "queries/self.md") as OperationNode;

    expect(self.type).toEqual({ wrappers: [], name: "Query", path: "queries/index.md" });
  });

  it("surfaces operation deprecation", () => {
    const ir = project(loadedFrom('type Query { old: String @deprecated(reason: "gone") }'));
    const old = conceptAt(ir.concepts, "queries/old.md") as OperationNode;

    expect(old.deprecation).toEqual({ reason: "gone" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: FAIL — `no concept at queries/user.md`.

- [ ] **Step 3: Extend the implementation**

Add to the IR import list in `src/model/project.ts`:

```ts
  OperationNode,
```

At the top of `project`, before `namedTypes` is filtered, build the root-type index:

```ts
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
```

Import `DIRECTORY_BY_KIND` from `./naming.js` alongside the existing imports.

Change the `namedTypes` filter to also drop root types:

```ts
  const namedTypes = Object.values(schema.getTypeMap()).filter(
    (type) => !type.name.startsWith("__") && !rootDirectoryByTypeName.has(type.name),
  );
```

Add each root field to `elements`, after the named-type loop:

```ts
  for (const root of roots) {
    if (!root.type) {
      continue;
    }
    for (const field of Object.values(root.type.getFields())) {
      elements.push({ kind: root.kind, name: field.name });
    }
  }
```

Make `toTypeRef` aware of root types. Change its signature to accept the root directory map and return the index path when the named type is a root:

```ts
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
```

Thread `rootDirectoryByTypeName` through `argNode`, `fieldNode`, `inputFieldNode`, `objectConcept`, `interfaceConcept`, `unionConcept` and `inputConcept` as a trailing parameter of the same name and type, passing it to every `toTypeRef` call.

Finally, emit the operation concepts after the named-type loop:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/model/project.ts src/model/project.test.ts
git commit -m "feat: project root operations as individual concepts"
```

---

## Task 11: Directive definitions and applied directives

**Files:**
- Modify: `src/model/project.ts`
- Test: `src/model/project.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 10.
- Produces: `project` emitting `DirectiveDefinitionNode` for every directive definition (built-in and custom, distinguished by `isBuiltIn`), and populating `appliedDirectives` on every concept, field, argument, input field and enum value.

**Rules (spec §5.2, §5.3):**
- `@deprecated` and `@specifiedBy` are modeled as `deprecation` / `specifiedByUrl` and are **excluded** from `appliedDirectives` — never represented twice.
- Applied directives are read from `astNode`, which only SDL-built schemas have. An introspection-built schema has no `astNode`, so `appliedDirectives` comes out empty — that is exactly the §5.3 equivalence property, and it falls out for free.
- Argument values are printed with graphql-js's `print`.

- [ ] **Step 1: Write the failing tests**

Append to `src/model/project.test.ts`:

```ts
import type { DirectiveDefinitionNode } from "./ir.js";

describe("project directives", () => {
  it("emits directive definitions with locations and args", () => {
    const ir = project(
      loadedFrom(`
        """Requires a role."""
        directive @auth(requires: String! = "USER") repeatable on FIELD_DEFINITION | OBJECT
        type Query { hello: String }
      `),
    );
    const auth = conceptAt(ir.concepts, "directives/auth.md") as DirectiveDefinitionNode;

    expect(auth.description).toBe("Requires a role.");
    expect(auth.isRepeatable).toBe(true);
    expect(auth.isBuiltIn).toBe(false);
    expect(auth.locations).toEqual(["FIELD_DEFINITION", "OBJECT"]);
    expect(auth.args[0]?.name).toBe("requires");
    expect(auth.args[0]?.defaultValue).toBe('"USER"');
  });

  it("emits built-in directives flagged as such", () => {
    const ir = project(loadedFrom("type Query { hello: String }"));
    const deprecated = conceptAt(ir.concepts, "directives/deprecated.md") as DirectiveDefinitionNode;

    expect(deprecated.isBuiltIn).toBe(true);
  });

  it("records applied custom directives with printed argument values", () => {
    const ir = project(
      loadedFrom(`
        directive @auth(requires: String!) on FIELD_DEFINITION | OBJECT
        type User @auth(requires: "ADMIN") { id: ID! @auth(requires: "SELF") }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.appliedDirectives).toEqual([
      { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: '"ADMIN"' }] },
    ]);
    expect(user.fields[0]?.appliedDirectives).toEqual([
      { name: "auth", path: "directives/auth.md", args: [{ name: "requires", value: '"SELF"' }] },
    ]);
  });

  it("excludes @deprecated and @specifiedBy from appliedDirectives", () => {
    const ir = project(
      loadedFrom(`
        scalar DateTime @specifiedBy(url: "https://scalars.test/dt")
        type User { old: String @deprecated(reason: "gone") }
        type Query { user: User }
      `),
    );
    const scalar = conceptAt(ir.concepts, "types/scalars/DateTime.md") as ScalarTypeNode;
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(scalar.appliedDirectives).toEqual([]);
    expect(scalar.specifiedByUrl).toBe("https://scalars.test/dt");
    expect(user.fields[0]?.appliedDirectives).toEqual([]);
    expect(user.fields[0]?.deprecation).toEqual({ reason: "gone" });
  });

  it("sorts applied directives by name", () => {
    const ir = project(
      loadedFrom(`
        directive @zed on OBJECT
        directive @alpha on OBJECT
        type User @zed @alpha { id: ID! }
        type Query { user: User }
      `),
    );
    const user = conceptAt(ir.concepts, "types/objects/User.md") as ObjectTypeNode;

    expect(user.appliedDirectives.map((applied) => applied.name)).toEqual(["alpha", "zed"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: FAIL — `no concept at directives/auth.md`.

- [ ] **Step 3: Extend the implementation**

Add to the graphql import list in `src/model/project.ts`:

```ts
  type GraphQLDirective,
  type ASTNode,
  isSpecifiedDirective,
```

Add to the IR import list:

```ts
  AppliedDirective,
  DirectiveDefinitionNode,
```

Add the applied-directive reader. `MODELED_AS_FIELDS` names the two directives that already have first-class representation:

```ts
const MODELED_AS_FIELDS = new Set(["deprecated", "specifiedBy"]);

type HasAstNode = {
  readonly astNode?: (ASTNode & { readonly directives?: readonly unknown[] }) | null;
};

function appliedDirectivesOf(
  holder: HasAstNode,
  pathFor: (element: ElementName) => string,
): readonly AppliedDirective[] {
  const nodes = holder.astNode?.directives;
  if (!nodes) {
    return [];
  }
  const applied: AppliedDirective[] = [];
  for (const node of nodes as readonly {
    name: { value: string };
    arguments?: readonly { name: { value: string }; value: ASTNode }[];
  }[]) {
    const name = node.name.value;
    if (MODELED_AS_FIELDS.has(name)) {
      continue;
    }
    applied.push({
      name,
      path: pathFor({ kind: "directive", name }),
      args: byName(
        (node.arguments ?? []).map((arg) => ({ name: arg.name.value, value: print(arg.value) })),
      ),
    });
  }
  return byName(applied);
}
```

Register directive definitions in `elements`, after the root-field loop:

```ts
  for (const directive of schema.getDirectives()) {
    elements.push({ kind: "directive", name: directive.name });
  }
```

Emit them as concepts, after the operation loop:

```ts
  for (const directive of schema.getDirectives()) {
    concepts.push(directiveConcept(directive, pathFor, rootDirectoryByTypeName));
  }
```

And add the builder:

```ts
function directiveConcept(
  directive: GraphQLDirective,
  pathFor: (element: ElementName) => string,
  rootDirectoryByTypeName: ReadonlyMap<string, string>,
): DirectiveDefinitionNode {
  return {
    kind: "directive",
    name: directive.name,
    path: pathFor({ kind: "directive", name: directive.name }),
    description: directive.description ?? null,
    appliedDirectives: [],
    locations: [...directive.locations].sort(),
    args: byName(directive.args).map((arg) => argNode(arg, pathFor, rootDirectoryByTypeName)),
    isRepeatable: directive.isRepeatable,
    isBuiltIn: isSpecifiedDirective(directive),
  };
}
```

Finally, replace every remaining literal `appliedDirectives: []` in `scalarConcept`, `enumConcept` (both on the enum and on each value), `objectConcept`, `interfaceConcept`, `unionConcept`, `inputConcept`, `fieldNode`, `argNode`, `inputFieldNode`, and the operation-concept block with `appliedDirectives: appliedDirectivesOf(<the graphql-js object>, pathFor)`. Thread `pathFor` into `enumConcept` and `scalarConcept`, which do not currently take it.

`directiveConcept` keeps `appliedDirectives: []` — a directive definition cannot itself carry applied directives.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/model/project.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
git add src/model/project.ts src/model/project.test.ts
git commit -m "feat: project directive definitions and applied directives"
```

---

## Task 12: Public entry point, equivalence, and determinism

**Files:**
- Modify: `src/index.ts`
- Create: `test/fixtures/kitchen-sink.graphql`, `test/equivalence.test.ts`
- Test: `test/equivalence.test.ts`

**Interfaces:**
- Consumes: `loadSchema`, `project`, all IR types.
- Produces: `readSchema(spec: SourceSpec): Promise<SchemaIr>` exported from `src/index.ts`, alongside re-exports of the IR types, `SourceSpec`, `GraphqlOkfError` and `GraphqlOkfErrorCode`.

This task closes `DOD-G-6` (SDL/introspection equivalence) and the unit-level precursor to `GOAL-8.1` (determinism).

- [ ] **Step 1: Write the kitchen-sink fixture**

Create `test/fixtures/kitchen-sink.graphql`:

```graphql
directive @auth(requires: Role! = VIEWER) repeatable on OBJECT | FIELD_DEFINITION

"An ISO-8601 timestamp."
scalar DateTime @specifiedBy(url: "https://scalars.test/datetime")

"Access level."
enum Role {
  "Full control."
  OWNER
  ADMIN
  VIEWER @deprecated(reason: "use READER")
}

interface Node {
  id: ID!
}

interface Entity implements Node {
  id: ID!
  createdAt: DateTime!
}

"A person."
type User implements Node & Entity @auth(requires: ADMIN) {
  id: ID!
  createdAt: DateTime!
  email: String! @auth(requires: OWNER)
  nickname: String @deprecated
  tags: [[String!]]!
  role: Role!
}

type Post implements Node {
  id: ID!
  author: User!
}

union Content = User | Post

input Filter {
  limit: Int = 10
  label: String = "all"
  active: Boolean = true
  role: Role = VIEWER
  tags: [String!] = ["a", "b"]
  missing: String
}

"A type whose name shadows the reserved index.md."
type index {
  value: String
}

type User_case {
  value: String
}

schema {
  query: RootQuery
  mutation: RootMutation
}

type RootQuery {
  node(id: ID!): Node
  content(filter: Filter): [Content!]!
  me: User
}

type RootMutation {
  createUser(email: String!, role: Role = VIEWER): User!
  deleteUser(id: ID!): Boolean @deprecated(reason: "use archiveUser")
}
```

- [ ] **Step 2: Write the failing test**

Create `test/equivalence.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildClientSchema, buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import type { IntrospectionQuery } from "graphql";
import { describe, expect, it } from "vitest";
import type { ConceptNode, SchemaIr } from "../src/index.js";
import { readSchema } from "../src/index.js";
import { project } from "../src/model/project.js";
import { INTROSPECTION_OPTIONS } from "../src/source/endpoint.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/kitchen-sink.graphql", import.meta.url));

async function fixtureSdl(): Promise<string> {
  return readFile(FIXTURE, "utf8");
}

function stripAppliedDirectives(ir: SchemaIr): unknown {
  return JSON.parse(
    JSON.stringify(ir, (key, value) => (key === "appliedDirectives" ? [] : value)),
  );
}

describe("readSchema", () => {
  it("reads an SDL file into an IR", async () => {
    const ir = await readSchema({ kind: "sdl", path: FIXTURE });

    expect(ir.origin).toBe("sdl");
    expect(ir.resource).toBe(FIXTURE);
    expect(ir.concepts.length).toBeGreaterThan(0);
  });

  it("suffixes the reserved and case-folding names from the fixture", async () => {
    const ir = await readSchema({ kind: "sdl", path: FIXTURE });
    const paths = ir.concepts.map((concept: ConceptNode) => concept.path);

    expect(paths).not.toContain("types/objects/index.md");
    expect(paths.some((path) => path.startsWith("types/objects/index-"))).toBe(true);
  });

  it("does not emit the custom root types as objects", async () => {
    const ir = await readSchema({ kind: "sdl", path: FIXTURE });
    const paths = ir.concepts.map((concept: ConceptNode) => concept.path);

    expect(paths).not.toContain("types/objects/RootQuery.md");
    expect(paths).toContain("queries/me.md");
    expect(paths).toContain("mutations/createUser.md");
  });
});

describe("determinism", () => {
  it("produces a deeply equal IR when run twice on the same source", async () => {
    const first = await readSchema({ kind: "sdl", path: FIXTURE });
    const second = await readSchema({ kind: "sdl", path: FIXTURE });

    expect(second).toEqual(first);
  });
});

describe("SDL and introspection equivalence (DOD-G-6)", () => {
  it("agrees on everything but applied directives", async () => {
    const sdl = await fixtureSdl();

    const fromSdl = project({
      schema: buildSchema(sdl),
      resource: "kitchen-sink",
      origin: "sdl",
    });

    const payload = graphqlSync({
      schema: buildSchema(sdl),
      source: getIntrospectionQuery(INTROSPECTION_OPTIONS),
    });
    const introspected = project({
      schema: buildClientSchema(payload.data as unknown as IntrospectionQuery),
      resource: "kitchen-sink",
      origin: "sdl",
    });

    expect(stripAppliedDirectives(introspected)).toEqual(stripAppliedDirectives(fromSdl));
  });

  it("populates applied directives on the SDL path only", async () => {
    const sdl = await fixtureSdl();

    const fromSdl = project({ schema: buildSchema(sdl), resource: "k", origin: "sdl" });
    const payload = graphqlSync({
      schema: buildSchema(sdl),
      source: getIntrospectionQuery(INTROSPECTION_OPTIONS),
    });
    const introspected = project({
      schema: buildClientSchema(payload.data as unknown as IntrospectionQuery),
      resource: "k",
      origin: "introspection",
    });

    const appliedCount = (ir: SchemaIr): number =>
      ir.concepts.reduce((total, concept) => total + concept.appliedDirectives.length, 0);

    expect(appliedCount(fromSdl)).toBeGreaterThan(0);
    expect(appliedCount(introspected)).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run test/equivalence.test.ts`
Expected: FAIL — `readSchema is not exported from ../src/index.js`.

- [ ] **Step 4: Extend the public entry point**

Modify `src/index.ts` — **keep the existing `createOkfBundle` export untouched** (sub-project D replaces it) and add:

```ts
import { project } from "./model/project.js";
import { loadSchema } from "./source/index.js";
import type { SourceSpec } from "./source/types.js";

export { GraphqlOkfError } from "./errors.js";
export type { GraphqlOkfErrorCode } from "./errors.js";
export type { FetchLike, LoadedSchema, SourceSpec } from "./source/types.js";
export type {
  AppliedDirective,
  ConceptNode,
  Deprecation,
  DirectiveDefinitionNode,
  EnumTypeNode,
  EnumValueNode,
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
} from "./model/ir.js";
export type { ConceptKind } from "./model/naming.js";

export async function readSchema(spec: SourceSpec): Promise<SchemaIr> {
  return project(await loadSchema(spec));
}
```

Add the `SchemaIr` type import alongside the others:

```ts
import type { SchemaIr } from "./model/ir.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run test/equivalence.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the full enforced gate**

Run each and confirm it passes before committing:

```bash
pnpm run coverage
pnpm run lint
pnpm run typecheck
pnpm run knip
pnpm run build
```

Expected: all green. Coverage must meet lines ≥ 90%, functions ≥ 90%, branches ≥ 85%, statements ≥ 90%.

If `knip` reports unused exports from `src/index.ts`, that is expected for a public API surface — add the affected names to an `ignoreExportsUsedInFile`/`ignore` entry in `knip.json` rather than deleting the exports, and note the change in the commit message.

If coverage falls short, the likely gap is an unexercised error branch in `src/source/endpoint.ts` — add a targeted test rather than lowering the threshold. The `NAME_HASH_COLLISION` branch is already excluded via `/* v8 ignore */` (see the note in Task 6) and should not be counted against you.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts test/fixtures/kitchen-sink.graphql test/equivalence.test.ts
git commit -m "feat: expose readSchema and verify SDL/introspection equivalence"
```

---

## Verification against the spec

| Spec requirement | Task |
|---|---|
| `GOAL-3.1` SDL input | 2 |
| `GOAL-3.2` introspection input | 3 |
| `GOAL-3.3` request headers | 3 |
| `GOAL-3.4` / `DOD-G-6` equivalence | 12 |
| `GOAL-3.5` canonical library | 2, 3 |
| `GOAL-3.6` actionable errors | 1, 2, 3 |
| `GOAL-4.1` model coverage | 7, 8, 9, 10, 11 |
| `GOAL-4.2` deterministic paths | 5, 6, 12 |
| `GOAL-4.3` grouping | 5 |
| `GOAL-4.4` collisions and case safety | 6 |
| `GOAL-4.5` single source of truth | 5, 6, 7 (paths only ever come from `resolvePaths`) |
| Spec §4.3 built-in scalars emitted | 7 |
| Spec §4.4 root operation types | 10 |
| Spec §5.2 deprecation first-class | 7, 8, 10, 11 |
| Spec §5.4 printed default values | 9 |
| Spec §5.5 alphabetical ordering | 7, 8, 9, 11 |
| Spec §6 error codes | 1, 2, 3 |
