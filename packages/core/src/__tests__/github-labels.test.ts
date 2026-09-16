// The label taxonomy against GitHub's limits, and the in-app reporter's
// labels against the taxonomy. A description over 100 characters makes the
// sync fail with a 422; a label the repository does not have is dropped from
// a form without a word. The issue forms are checked against this list in
// apps/web/lib/__tests__/issue-forms.test.ts (core has no Node types to read
// files with).

import { describe, expect, it } from "vitest";

import { GITHUB_LABELS, reportLabels } from "../github-labels";

const known = new Set(GITHUB_LABELS.map((label) => label.name));

describe("GITHUB_LABELS", () => {
  it("fits GitHub's limits", () => {
    for (const label of GITHUB_LABELS) {
      expect(label.name.length, label.name).toBeLessThanOrEqual(50);
      expect(label.description.length, label.name).toBeLessThanOrEqual(100);
      expect(label.color, label.name).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("names each label once", () => {
    expect(known.size).toBe(GITHUB_LABELS.length);
  });

  it("has all four priorities", () => {
    expect(
      GITHUB_LABELS.filter((l) => l.name.startsWith("priority: ")),
    ).toHaveLength(4);
  });
});

describe("the in-app reporter's labels", () => {
  it("exist, start at needs-triage and carry exactly one type", () => {
    for (const kind of ["bug", "feature"] as const) {
      const labels = reportLabels(kind);
      for (const label of labels) expect(known).toContain(label);
      expect(labels).toContain("needs-triage");
      expect(labels).toContain("source: in-app");
      expect(labels.filter((l) => l.startsWith("type: "))).toHaveLength(1);
    }
  });

  it("never set a priority", () => {
    for (const kind of ["bug", "feature"] as const) {
      expect(reportLabels(kind).some((l) => l.startsWith("priority: "))).toBe(
        false,
      );
    }
  });
});
