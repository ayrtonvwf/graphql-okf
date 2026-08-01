import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  generatedRegionOf,
  internalLinkTargets,
  resolveBundleLink,
} from "../test/support/bundle-links.js";
import { buildBundle } from "./emit/bundle.js";
import { emitContext } from "./emit/context.js";
import { assembleFile, EMPTY_HUMAN } from "./emit/render/seam.js";
import { readSchema, syncOkfBundle } from "./index.js";

const TIMESTAMP = "2026-07-25T00:00:00.000Z";

async function bundleFor(path: string): Promise<Map<string, string>> {
  const ir = await readSchema({ kind: "sdl", path });
  const files = new Map<string, string>();
  for (const [filePath, parts] of buildBundle(ir, emitContext("0.2", TIMESTAMP))) {
    files.set(filePath, assembleFile(parts, EMPTY_HUMAN));
  }
  return files;
}

async function bundleForV1(path: string): Promise<Map<string, string>> {
  const ir = await readSchema({ kind: "sdl", path });
  const files = new Map<string, string>();
  for (const [filePath, parts] of buildBundle(ir, emitContext("0.1", TIMESTAMP))) {
    files.set(filePath, assembleFile(parts, EMPTY_HUMAN));
  }
  return files;
}

function frontmatterOf(text: string): Record<string, unknown> | null {
  if (!text.startsWith("---\n")) {
    return null;
  }
  const closing = text.indexOf("\n---\n", 3);
  if (closing === -1) {
    return null;
  }
  return parse(text.slice(4, closing + 1)) as Record<string, unknown>;
}

describe("OKF §9 conformance", () => {
  it("gives every concept file parseable frontmatter with a non-empty type", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const concepts = [...files].filter(([path]) => !path.endsWith("index.md"));

    expect(concepts.length).toBeGreaterThan(0);

    for (const [path, text] of concepts) {
      const frontmatter = frontmatterOf(text);
      expect(frontmatter, `${path} has no parseable frontmatter`).not.toBeNull();
      expect(typeof frontmatter?.type, `${path} type is not a string`).toBe("string");
      expect(frontmatter?.type, `${path} has an empty type`).not.toBe("");
    }
  });

  it("keeps every generated.at a string under YAML 1.1", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");

    for (const [path, text] of files) {
      if (path.endsWith("index.md")) continue;
      const closing = text.indexOf("\n---\n", 3);
      const parsed = parse(text.slice(4, closing + 1), { version: "1.1" }) as {
        generated?: { at?: unknown };
      };
      expect(typeof parsed.generated?.at, `${path} generated.at is not a string`).toBe("string");
    }
  });

  it("keeps every timestamp a string under YAML 1.1 (legacy v0.1 output)", async () => {
    const files = await bundleForV1("examples/shop-api/v1.graphql");

    for (const [path, text] of files) {
      if (path.endsWith("index.md")) continue;
      const closing = text.indexOf("\n---\n", 3);
      const parsed = parse(text.slice(4, closing + 1), { version: "1.1" }) as {
        timestamp?: unknown;
      };
      expect(typeof parsed.timestamp, `${path} timestamp is not a string`).toBe("string");
    }
  });

  it("keeps a tombstone's removedAt a string under YAML 1.1", async () => {
    // v1.graphql has no removed elements, so exercising a tombstone needs a
    // real reconcile across two schema versions rather than a single build.
    const outDir = join(await mkdtemp(join(tmpdir(), "okf-conformance-")), "bundle");
    await syncOkfBundle({
      source: { kind: "sdl", path: "examples/shop-api/v1.graphql" },
      outDir,
      now: "2026-01-15T09:00:00.000Z",
    });
    await syncOkfBundle({
      source: { kind: "sdl", path: "examples/shop-api/v2.graphql" },
      outDir,
      now: "2026-03-02T09:00:00.000Z",
    });

    // v2 tombstones queries/searchProducts.md (removed in favor of Money/Review).
    const text = await readFile(join(outDir, "queries/searchProducts.md"), "utf8");
    const closing = text.indexOf("\n---\n", 3);
    const parsed = parse(text.slice(4, closing + 1), { version: "1.1" }) as {
      removedAt?: unknown;
    };

    expect(typeof parsed.removedAt).toBe("string");
  });

  it("declares okf_version on the bundle root index and nowhere else", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");

    expect(frontmatterOf(files.get("index.md") ?? "")?.okf_version).toBe("0.2");
    expect(frontmatterOf(files.get("types/objects/index.md") ?? "")).toBeNull();
  });

  it("resolves every internal link to a file in the bundle", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const broken: string[] = [];

    for (const [path, text] of files) {
      for (const target of internalLinkTargets(text)) {
        if (!files.has(resolveBundleLink(path, target))) {
          broken.push(`${path} -> ${target}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  /**
   * The guard rail for issue #22's flatten: an emitted link must not depend on
   * how deep its file sits. Scoped to the generated region because human
   * content below the seam is not ours. Note that a *description* preserved
   * under GOAL-6.3 can carry a relative link and render inside a generated
   * table cell; no current fixture does, and if one ever does the fix is to
   * narrow this scan, not to relax the rule.
   */
  it("emits no relative internal link", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const relative: string[] = [];

    for (const [path, text] of files) {
      // `buildBundle` never emits log.md (it's written only by the reconciler
      // on subsequent runs), so every file here is a concept file and is
      // expected to carry the generated-region markers. A file that silently
      // lost them would make `generatedRegionOf` return "", scanning zero
      // links and vacuously passing the check below — assert the markers are
      // present so that failure mode is caught here instead.
      const region = generatedRegionOf(text);
      expect(region, `${path} has no generated-region markers`).not.toBe("");

      for (const target of internalLinkTargets(region)) {
        if (!target.startsWith("/")) {
          relative.push(`${path} -> ${target}`);
        }
      }
    }

    expect(relative).toEqual([]);
  });

  it("emits a top-level # Schema section the reference tooling can parse", async () => {
    const files = await bundleFor("examples/shop-api/v1.graphql");
    const product = files.get("types/objects/Product.md");

    expect(product).toContain("\n# Schema\n");
    expect(product).toContain("| Field | Type | Description |");
  });
});
