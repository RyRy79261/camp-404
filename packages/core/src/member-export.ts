import type { ViewerRank } from "@camp404/types";
import { canReadMemberField, canReadProfileAnswer } from "./privacy";

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
}

const ID_SOURCES = ["users.passportEncrypted", "users.saIdEncrypted"];

/** Every column, in file order. */
export const MEMBER_EXPORT_COLUMNS: readonly MemberExportColumn[] = [
  { key: "name", header: "Name", sources: ["users.displayName"] },
  { key: "handle", header: "Telegram", sources: ["users.telegramHandle"] },
  {
    key: "rank",
    header: "Rank",
    sources: ["users.rank", "teamMemberships.isLead"],
  },
  { key: "teams", header: "Teams", sources: ["teamMemberships.team"] },
  { key: "country", header: "Country", sources: ["answer:country"] },
  // Whether the person is still an applicant. Member-readable since the owner's
  // 2026-09-22 ruling ("everyone should be able to see the applicants"), so it
  // belongs up here and not down with the captain-only REST of the approval
  // lifecycle — who decided, when, and what they said.
  { key: "approval", header: "Approval", sources: ["users.approvalStatus"] },
  // Safety data: team leads and captains.
  {
    key: "emergency_contact_1",
    header: "Emergency contact 1",
    sources: ["users.emergencyContacts"],
  },
  {
    key: "emergency_contact_2",
    header: "Emergency contact 2",
    sources: ["users.emergencyContacts"],
  },
  {
    key: "allergies",
    header: "Allergies",
    sources: ["answer:dietary.allergies", "dietaryRequirements.allergies"],
  },
  {
    key: "anaphylactic",
    header: "Anaphylactic",
    sources: ["dietaryRequirements.isAnaphylactic"],
  },
  {
    key: "food_dislikes",
    header: "Food dislikes",
    sources: ["answer:dietary.dislikes"],
  },
  {
    key: "dietary_notes",
    header: "Dietary notes",
    sources: ["answer:dietary.notes", "dietaryRequirements.notes"],
  },
  // Captains.
  { key: "email", header: "Email", sources: ["user.email"] },
  { key: "id_type", header: "ID type", sources: ID_SOURCES },
  { key: "id_number", header: "ID number", sources: ID_SOURCES },
  { key: "arrival", header: "Arrival", sources: ["driverProfiles.arrivalAt"] },
  { key: "dues_paid", header: "Dues paid", sources: ["payments.status"] },
  { key: "joined", header: "Joined", sources: ["users.createdAt"] },
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
