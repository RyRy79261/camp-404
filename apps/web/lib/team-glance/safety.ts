import type { SafetyCounts } from "@camp404/db/team-glance";
import {
  plural,
  type GlanceAttention,
  type GlanceLink,
  type TeamGlance,
} from "../team-glance";

// The Safety team's panel on its team page ("Safety check"; approved mock-up
// docs/plans/2026-11-12-team-dashboards-mockup.html, owner 2026-11-12:
// "there's no names"). Two views, picked on the server BEFORE anything is
// read: a captain or a Safety lead (SAFETY_COUNTS_READER) sees counts over
// the people coming this year; anyone else sees only whether their own
// emergency contact is set (never the contact itself). Counts name nobody
// and open nobody's data, so the panel writes no audit row; the names stay
// behind the roster and the Camp sheet, which record each read. Pure.

export const SAFETY_LINKS = {
  roster: { href: "/captains/camp-management", label: "Roster" },
  campSheet: { href: "/captains/camp-sheet", label: "Camp sheet" },
  myForms: { href: "/tools/forms", label: "My forms" },
} as const;

export const SAFETY_MEMBER_NOTE =
  "The camp's safety counts are for the Safety leads and captains.";

export type SafetyGlanceInput =
  | { view: "member"; hasEmergencyContact: boolean }
  | { view: "reader"; counts: SafetyCounts; isCaptain: boolean };

export function safetyGlance(input: SafetyGlanceInput): TeamGlance {
  if (input.view === "member") {
    const set = input.hasEmergencyContact;
    return {
      title: "Safety check",
      tiles: [
        {
          key: "mine",
          label: "Your emergency contact",
          value: set ? "Set" : "Not set yet",
          hint: "Captains and team leads read it only in an emergency.",
          tone: set ? "ok" : "warn",
        },
      ],
      attention: set
        ? []
        : [
            {
              key: "mine",
              tone: "warn",
              text: "Add someone we can call if something happens to you.",
              link: SAFETY_LINKS.myForms,
            },
          ],
      links: [SAFETY_LINKS.myForms],
      note: SAFETY_MEMBER_NOTE,
    };
  }

  const { counts, isCaptain } = input;
  const ofComing = `of ${plural(counts.coming, "person", "people")} coming`;
  const notDone = counts.coming - counts.burnerProfileDone;
  const attention: GlanceAttention[] = [];
  if (counts.noEmergencyContact > 0) {
    attention.push({
      key: "no-contact",
      tone: "bad",
      text: `${plural(counts.noEmergencyContact, "person", "people")} coming ${counts.noEmergencyContact === 1 ? "has" : "have"} no emergency contact.`,
      link: SAFETY_LINKS.roster,
    });
  }
  if (notDone > 0) {
    attention.push({
      key: "profile",
      tone: "warn",
      text: `${plural(notDone, "person", "people")} coming ${notDone === 1 ? "has" : "have"} not finished their burner profile.`,
      link: SAFETY_LINKS.roster,
    });
  }
  const links: GlanceLink[] = [SAFETY_LINKS.roster];
  // The Camp sheet is a captain's page.
  if (isCaptain) links.push(SAFETY_LINKS.campSheet);

  return {
    title: "Safety check",
    tiles: [
      {
        key: "no-contact",
        label: "No emergency contact",
        value: String(counts.noEmergencyContact),
        hint: ofComing,
        tone:
          counts.coming === 0
            ? undefined
            : counts.noEmergencyContact > 0
              ? "bad"
              : "ok",
      },
      {
        key: "anaphylactic",
        label: "Anaphylactic",
        value: String(counts.anaphylactic),
        hint: "people coming",
      },
      {
        key: "profile",
        label: "Burner profile done",
        value: `${counts.burnerProfileDone} of ${counts.coming}`,
        hint: "people coming",
        progress:
          counts.coming > 0
            ? { value: counts.burnerProfileDone, max: counts.coming }
            : undefined,
      },
      {
        key: "allergies",
        label: "Allergies noted",
        value: String(counts.allergiesNoted),
        hint: "people coming, the Kitchen plans for them too",
      },
    ],
    attention,
    links,
  };
}
