import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALWAYS_PRIVATE, SAFETY_VISIBLE } from "@camp404/core";

// The desktop's last-seen copy of a background window blanks every element
// marked `data-os-private` (packages/os/src/last-seen.ts). A drift test, as
// the design doc asks (section 10, "the last-seen copy"): every component in
// the console that renders an ALWAYS_PRIVATE or SAFETY_VISIBLE field, or the
// member panel's answer sections and captain notes, carries the marker. A new
// component that shows an ID number, emergency contacts or allergies without
// it goes red here.

const WEB = path.resolve(__dirname, "../../..");
const ROOTS = ["app/(console)", "components"];

/**
 * What a component names when it renders private data: the privacy classes'
 * own keys (from @camp404/core, so a new key is covered at once), the reads
 * that hand them over, and the question roles and ids whose answers land in
 * a SAFETY_VISIBLE column.
 */
const SIGNS: readonly string[] = [
  ...ALWAYS_PRIVATE,
  ...SAFETY_VISIBLE,
  "profileSections",
  "MemberNotesResult",
  "listMemberNotes",
  "resolveSafetyDataForViewer",
  "isFieldLocked",
  "emergency_contact_",
  "dietary_allergies",
  "dietary_anaphylactic",
  "dietary.allergies",
];

/**
 * Files that name a sign but render no member's data, with the reason. Keep
 * this short: every entry is a place the test does not look.
 */
const NOT_RENDERERS: Record<string, string> = {
  "components/questionnaires/block-editor.tsx":
    "the builder's role picker: it names the roles, and renders no answers",
};

function sources(): { file: string; text: string }[] {
  return ROOTS.flatMap((root) =>
    (readdirSync(path.join(WEB, root), { recursive: true }) as string[])
      .map((f) => `${root}/${f.split(path.sep).join("/")}`)
      .filter(
        (f) =>
          f.endsWith(".tsx") &&
          !f.includes("/__tests__/") &&
          !/\.(test|spec|stories)\.tsx$/.test(f),
      )
      .map((file) => ({
        file,
        text: readFileSync(path.join(WEB, file), "utf8"),
      })),
  );
}

/** The files that render private data, by the signs above. */
function privateRenderers(files: { file: string; text: string }[]): string[] {
  return files
    .filter(({ text }) => SIGNS.some((sign) => text.includes(sign)))
    .map(({ file }) => file)
    .filter((file) => !(file in NOT_RENDERERS));
}

describe("every console component that renders private data is marked", () => {
  const files = sources();
  const renderers = privateRenderers(files);

  it("finds the renderers it knows (so the scan is not empty)", () => {
    expect(renderers).toEqual(
      expect.arrayContaining([
        "components/questionnaire/field.tsx",
        "app/(console)/captains/camp-management/member-profile.tsx",
        "app/(console)/captains/camp-management/member-notes.tsx",
      ]),
    );
  });

  it("each one carries data-os-private", () => {
    const text = new Map(files.map((f) => [f.file, f.text] as const));
    const unmarked = renderers.filter(
      (file) => !text.get(file)!.includes("data-os-private"),
    );
    expect(unmarked).toEqual([]);
  });

  it("the exceptions still exist, and still name a sign", () => {
    for (const file of Object.keys(NOT_RENDERERS)) {
      const found = files.find((f) => f.file === file);
      expect(found, file).toBeDefined();
      expect(SIGNS.some((sign) => found!.text.includes(sign))).toBe(true);
    }
  });

  it("flags a component that names a sign without the marker", () => {
    expect(
      privateRenderers([
        {
          file: "components/new-safety-card.tsx",
          text: "export const C = ({ m }) => <p>{m.emergencyContacts}</p>;",
        },
      ]),
    ).toEqual(["components/new-safety-card.tsx"]);
  });
});
