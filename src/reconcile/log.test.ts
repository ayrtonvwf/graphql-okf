import { describe, expect, it } from "vitest";
import { hasLoggableChanges, renderLogEntry } from "./log.js";
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
};

describe("renderLogEntry", () => {
  it("renders one dated section with a group per kind of change", () => {
    expect(renderLogEntry(plan, T)).toBe(
      [
        `## ${T}`,
        "",
        "**Added**",
        "",
        "- [`Invoice`](types/objects/Invoice.md)",
        "- [`invoices`](queries/invoices.md)",
        "",
        "**Changed**",
        "",
        "- [`User`](types/objects/User.md)",
        "",
        "**Removed**",
        "",
        "- [`LegacyOrder`](types/objects/LegacyOrder.md)",
        "",
      ].join("\n"),
    );
  });

  it("omits groups that are empty", () => {
    const entry = renderLogEntry({ ...plan, changed: [], removed: [] }, T);

    expect(entry).toContain("**Added**");
    expect(entry).not.toContain("**Changed**");
    expect(entry).not.toContain("**Removed**");
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
    };

    expect(hasLoggableChanges(indexOnly)).toBe(false);
  });

  it("is true when any concept changed", () => {
    expect(hasLoggableChanges(plan)).toBe(true);
  });
});
