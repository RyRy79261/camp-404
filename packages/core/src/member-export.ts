import type { ViewerRank } from "@camp404/types";
import {
  ALWAYS_PRIVATE,
  SAFETY_VISIBLE,
  canReadMemberField,
  canReadProfileAnswer,
} from "./privacy";

// The member export's columns (owner's ruling, 2026-09-16: one Export button
// for every rank, "literally everything", and each person gets only what
// their read level allows). A column names the member data it is built from;
// a viewer gets the column only when they may read every source of it about
// someone else. The rungs live in privacy.ts, so an export can never show more
// than the screen does, and a change of rung there changes the export too.
//
// Answers to builder questionnaires stay in each questionnaire's own CSV.

/** A burner profile answer, by question id, as an export source. */
export type AnswerSource = `answer:${string}`;

/**
 * Which part of a member's record a column is about. The captains' Camp sheet
 * colours each column's header by it; the CSV ignores it.
 */
export type MemberExportGroup = "who" | "safety" | "food" | "captains";

export const MEMBER_EXPORT_GROUP_LABELS: Readonly<
  Record<MemberExportGroup, string>
> = {
  who: "Who",
  safety: "Safety",
  food: "Food",
  captains: "Captains only",
};

export interface MemberExportColumn {
  /** Stable key, recorded on the export's audit row. */
  key: string;
  /** The CSV header. */
  header: string;
  /**
   * Where the value comes from: `table.property` keys of MEMBER_FIELD_READERS,
   * or `answer:<question id>` for a burner profile answer.
   */
  sources: readonly (string | AnswerSource)[];
  group: MemberExportGroup;
}

const ID_SOURCES = ["users.passportEncrypted", "users.saIdEncrypted"];

/** Every column, in file order. */
export const MEMBER_EXPORT_COLUMNS: readonly MemberExportColumn[] = [
  { key: "name", header: "Name", sources: ["users.displayName"], group: "who" },
  {
    key: "handle",
    header: "Telegram",
    sources: ["users.telegramHandle"],
    group: "who",
  },
  {
    key: "rank",
    header: "Rank",
    sources: ["users.rank", "teamMemberships.isLead"],
    group: "who",
  },
  {
    key: "teams",
    header: "Teams",
    sources: ["teamMemberships.team"],
    group: "who",
  },
  {
    key: "country",
    header: "Country",
    sources: ["answer:country"],
    group: "who",
  },
  // Whether the person is still an applicant. Member-readable since the owner's
  // 2026-09-22 ruling ("everyone should be able to see the applicants"), so it
  // belongs up here and not down with the captain-only REST of the approval
  // lifecycle — who decided, when, and what they said.
  {
    key: "approval",
    header: "Approval",
    sources: ["users.approvalStatus"],
    group: "who",
  },
  // Where the member stands this year (camp_participations), in the roster's
  // "This year" words (STANDING_LABEL). Team lead and up, like the roster.
  {
    key: "this_year",
    header: "This year",
    sources: ["campParticipations.status"],
    group: "who",
  },
  // Safety data: team leads and captains.
  {
    key: "emergency_contact_1",
    header: "Emergency contact 1",
    sources: ["users.emergencyContacts"],
    group: "safety",
  },
  {
    key: "emergency_contact_2",
    header: "Emergency contact 2",
    sources: ["users.emergencyContacts"],
    group: "safety",
  },
  {
    key: "allergies",
    header: "Allergies",
    sources: ["answer:dietary.allergies", "dietaryRequirements.allergies"],
    group: "safety",
  },
  {
    key: "anaphylactic",
    header: "Anaphylactic",
    sources: ["dietaryRequirements.isAnaphylactic"],
    group: "safety",
  },
  {
    key: "food_dislikes",
    header: "Food dislikes",
    sources: ["answer:dietary.dislikes"],
    group: "food",
  },
  {
    key: "dietary_notes",
    header: "Dietary notes",
    sources: ["answer:dietary.notes", "dietaryRequirements.notes"],
    group: "food",
  },
  // Captains.
  { key: "email", header: "Email", sources: ["user.email"], group: "captains" },
  { key: "id_type", header: "ID type", sources: ID_SOURCES, group: "captains" },
  {
    key: "id_number",
    header: "ID number",
    sources: ID_SOURCES,
    group: "captains",
  },
  {
    key: "arrival",
    header: "Arrival",
    sources: ["driverProfiles.arrivalAt"],
    group: "captains",
  },
  {
    key: "dues_paid",
    header: "Dues paid",
    sources: ["payments.status"],
    group: "captains",
  },
  {
    key: "joined",
    header: "Joined",
    sources: ["users.createdAt"],
    group: "captains",
  },
];

/** Whether a viewer of this rank may read one source about someone else. */
export function canReadExportSource(rank: ViewerRank, source: string): boolean {
  const viewer = { rank, isSelf: false };
  return source.startsWith("answer:")
    ? canReadProfileAnswer(viewer, source.slice("answer:".length))
    : canReadMemberField(viewer, source);
}

/** The columns a viewer of this rank gets, in file order. */
export function memberExportColumnsFor(rank: ViewerRank): MemberExportColumn[] {
  return MEMBER_EXPORT_COLUMNS.filter((column) =>
    column.sources.every((source) => canReadExportSource(rank, source)),
  );
}

const ANSWER = "answer:";

/**
 * Whether a column shows ALWAYS_PRIVATE or SAFETY_VISIBLE data (ID numbers,
 * emergency contacts, allergies), or an answer from the burner profile's
 * dietary page, which privacy.ts reads as safety data. A screen that draws
 * such a column marks its cells `data-os-private`.
 */
export function isPrivateExportColumn(column: MemberExportColumn): boolean {
  return column.sources.some((source) => {
    if (source.startsWith(ANSWER)) {
      return source.slice(ANSWER.length).startsWith("dietary.");
    }
    // `table.property`: the privacy classes name the property.
    const property = source.slice(source.indexOf(".") + 1);
    return ALWAYS_PRIVATE.has(property) || SAFETY_VISIBLE.has(property);
  });
}
