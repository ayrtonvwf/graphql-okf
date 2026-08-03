import { describe, expect, it } from "vitest";
import { hasLoggableChanges, LOG_HEADER, renderRunBlock, updateLog } from "./log.js";
import type { BundlePlan } from "./plan.js";

const T = "2026-07-24T09:00:00.000Z";

const plan: BundlePlan = {
  actions: [],
  added: [
    { name: "Invoice", path: "types/objects/Invoice.md" },
    { name: "invoices", path: "queries/invoices.md" },
  ],
  changed: [{ name: "User", path: "types/objects/User.md" }],
  removed: [{ name: "LegacyOrder", path: "types/objects/LegacyOrder.md" }],
  unchanged: 12,
  indexes: 0,
  migrated: [],
};

describe("renderRunBlock", () => {
  it("heads the run with its time of day and groups by kind of change", () => {
    expect(renderRunBlock(plan, T)).toBe(
      [
        "### 09:00:00.000Z",
        "",
        "**Added**",
        "",
        "* [`Invoice`](/types/objects/Invoice.md)",
        "* [`invoices`](/queries/invoices.md)",
        "",
        "**Changed**",
        "",
        "* [`User`](/types/objects/User.md)",
        "",
        "**Removed**",
        "",
        "* [`LegacyOrder`](/types/objects/LegacyOrder.md)",
      ].join("\n"),
    );
  });

  it("omits groups that are empty", () => {
    const block = renderRunBlock({ ...plan, changed: [], removed: [] }, T);

    expect(block).toContain("**Added**");
    expect(block).not.toContain("**Changed**");
    expect(block).not.toContain("**Removed**");
  });
});

describe("updateLog", () => {
  it("creates the file with frontmatter, an H1 and an ISO date heading", () => {
    const out = updateLog(null, plan, T);

    expect(out.startsWith(`${LOG_HEADER}\n\n## 2026-07-24\n\n`)).toBe(true);
    expect(out).toContain("---\ntype: Log\n---");
    expect(out).toContain("# Update Log");
    expect(out).toMatch(/\n$/);
  });

  it("uses an ISO 8601 date heading, never a full timestamp", () => {
    expect(updateLog(null, plan, T)).not.toContain(`## ${T}`);
  });

  it("adds a second run on the same day under the existing date heading", () => {
    const first = updateLog(null, plan, T);
    const second = updateLog(first, plan, "2026-07-24T17:30:00.000Z");

    expect(second.match(/^## 2026-07-24$/gm)).toHaveLength(1);
    expect(second.indexOf("### 17:30:00.000Z")).toBeLessThan(second.indexOf("### 09:00:00.000Z"));
  });

  it("puts a new day above the previous one, newest first", () => {
    const first = updateLog(null, plan, T);
    const second = updateLog(first, plan, "2026-08-01T09:00:00.000Z");

    expect(second.indexOf("## 2026-08-01")).toBeLessThan(second.indexOf("## 2026-07-24"));
  });

  it("keeps every earlier entry", () => {
    const first = updateLog(null, plan, T);
    const second = updateLog(first, plan, "2026-08-01T09:00:00.000Z");

    expect(second).toContain("### 09:00:00.000Z");
    expect(second.match(/^### /gm)).toHaveLength(2);
  });

  it("treats a header-only file as having no entries yet", () => {
    const out = updateLog(`${LOG_HEADER}\n`, plan, T);

    expect(out).toContain("## 2026-07-24");
    expect(out.match(/^# Update Log$/gm)).toHaveLength(1);
  });
});

describe("hasLoggableChanges", () => {
  it("is false for an index-only plan, which the log does not record", () => {
    const indexOnly: BundlePlan = {
      actions: [{ kind: "index", path: "index.md", contents: "x" }],
      added: [],
      changed: [],
      removed: [],
      unchanged: 3,
      indexes: 1,
      migrated: [],
    };

    expect(hasLoggableChanges(indexOnly)).toBe(false);
  });

  it("is true when any concept changed", () => {
    expect(hasLoggableChanges(plan)).toBe(true);
  });
});

describe("a migration run", () => {
  const migrationPlan: BundlePlan = {
    actions: [],
    added: [],
    changed: [],
    removed: [],
    unchanged: 0,
    indexes: 0,
    migrated: Array.from({ length: 4975 }, (_, index) => `types/objects/T${index}.md`),
  };

  it("is loggable even with no schema change", () => {
    expect(hasLoggableChanges(migrationPlan)).toBe(true);
  });

  it("reports the format change and the count, not the concepts", () => {
    const block = renderRunBlock(migrationPlan, "2026-07-27T09:00:00.000Z");

    expect(block).toContain("**Migrated**");
    expect(block).toContain(
      "* OKF bundle format 0.1 → 0.2 (`timestamp` → `generated`) across 4975 concepts.",
    );
    expect(block).not.toContain("types/objects/T0.md");
  });

  it("writes the count with no locale separators, so runs stay deterministic", () => {
    expect(renderRunBlock(migrationPlan, "2026-07-27T09:00:00.000Z")).not.toContain("4,975");
  });

  it("still reports genuine schema changes in the same entry", () => {
    const block = renderRunBlock(
      { ...migrationPlan, added: [{ name: "Country", path: "types/objects/Country.md" }] },
      "2026-07-27T09:00:00.000Z",
    );

    expect(block).toContain("**Migrated**");
    expect(block).toContain("**Added**");
    expect(block.indexOf("**Migrated**")).toBeLessThan(block.indexOf("**Added**"));
  });

  it("emits no group when nothing was migrated", () => {
    expect(
      renderRunBlock({ ...migrationPlan, migrated: [] }, "2026-07-27T09:00:00.000Z"),
    ).not.toContain("**Migrated**");
  });
});
