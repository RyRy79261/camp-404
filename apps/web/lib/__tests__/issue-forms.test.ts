// The issue forms against the label taxonomy. GitHub drops a label a form asks
// for that the repository does not have, without a word, and the issue lands
// unlabelled. Nothing cleans what a form publishes, so the privacy
// confirmations must stay.
//
// The forms are read with a regex, not a YAML dependency: every form writes
// `labels:` in flow style on one line, and a form that stops matching fails
// here instead of being skipped.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GITHUB_LABELS } from "@camp404/core";

// lib/__tests__ → lib → web → apps → repo root
const FORM_DIR = path.resolve(__dirname, "../../../../.github/ISSUE_TEMPLATE");

/** Every issue form. `config.yml` configures the chooser; it is not a form. */
function formFiles(): string[] {
  return readdirSync(FORM_DIR)
    .filter((name) => name.endsWith(".yml") && name !== "config.yml")
    .sort();
}

function formSource(file: string): string {
  return readFileSync(path.join(FORM_DIR, file), "utf8");
}

/** The top-level `labels: [...]` line of a form. */
function formLabels(file: string): string[] {
  const list = /^labels:[ \t]*(\[.*\])[ \t]*$/m.exec(formSource(file))?.[1];
  if (list === undefined) {
    throw new Error(
      `${file}: no top-level flow-style \`labels: [...]\` line. If the form ` +
        `now uses block style, teach this test to read it.`,
    );
  }
  return JSON.parse(list) as string[];
}

const known = new Set(GITHUB_LABELS.map((label) => label.name));

describe("issue forms", () => {
  const files = formFiles();

  it("exist", () => {
    // A loop over nothing passes in silence.
    expect(files.length).toBeGreaterThan(0);
  });

  it("apply only labels in GITHUB_LABELS", () => {
    for (const file of files) {
      for (const label of formLabels(file)) {
        expect(known, `${file} applies "${label}"`).toContain(label);
      }
    }
  });

  it("start every issue at needs-triage, with exactly one type", () => {
    for (const file of files) {
      const labels = formLabels(file);
      expect(labels, file).toContain("needs-triage");
      expect(
        labels.filter((l) => l.startsWith("type: ")),
        file,
      ).toHaveLength(1);
    }
  });

  it("never set a priority", () => {
    for (const file of files) {
      for (const label of formLabels(file)) {
        expect(label.startsWith("priority: "), `${file}: ${label}`).toBe(false);
      }
    }
  });

  it("keep both required privacy confirmations on every form", () => {
    // Nothing cleans what a form publishes; the confirmations are the whole
    // defence. Checked by structure, not wording: scoped to the
    // `personal-data` group, counting only `required: true` directly under a
    // `- label:` (a `validations:` block has its own `required`).
    for (const file of files) {
      const group =
        formSource(file)
          .split(/\n(?= {2}- type: )/)
          .find((section) => /^ {4}id: personal-data$/m.test(section)) ?? "";
      const required = group.match(/^ *- label: .*\n *required: true$/gm) ?? [];
      expect(required.length, file).toBeGreaterThanOrEqual(2);
    }
  });
});
