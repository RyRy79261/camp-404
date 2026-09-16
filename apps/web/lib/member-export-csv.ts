import {
  CAMP_TIME_ZONE,
  csvFilenamePart,
  type CsvCell,
  type MemberExportColumn,
} from "@camp404/core";
import type { CampManagementMember } from "@camp404/db/roster";
import type { EmergencyContact } from "@camp404/types";
import { toPublicRosterRow } from "./camp-roster";

// The member export's cells, pure: which columns a viewer gets is decided
// before this runs (memberExportColumnsFor), and so is which data was fetched.
// This only turns rows into words a spreadsheet shows.

/** Everything beyond the roster row, already decrypted and labelled. */
export interface MemberExportExtra {
  emergencyContacts: readonly EmergencyContact[] | null;
  allergies: readonly string[];
  anaphylactic: boolean | null;
  dislikes: readonly string[];
  dietaryNotes: readonly string[];
  idType: "passport" | "sa_id" | null;
  /** The number, "unreadable" when it can't be decrypted, or null. */
  idNumber: string | null;
  arrivalAt: Date | null;
}

export const UNREADABLE_ID = "unreadable";

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeZone: CAMP_TIME_ZONE,
});
const dateTimeFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});
// en-CA formats a date as YYYY-MM-DD, which sorts in a file listing.
const fileDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAMP_TIME_ZONE,
});

function contact(c: EmergencyContact | undefined): string {
  if (!c) return "";
  const who = c.relationship ? `${c.name} (${c.relationship})` : c.name;
  return [who, c.phone].filter(Boolean).join(", ");
}

const APPROVAL: Record<CampManagementMember["approvalStatus"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function cell(
  key: string,
  member: CampManagementMember,
  extra: MemberExportExtra | undefined,
  teamLabels: Record<string, string>,
): CsvCell {
  const row = toPublicRosterRow(member);
  switch (key) {
    case "name":
      return row.displayName;
    case "handle":
      return row.handle ? `@${row.handle}` : "";
    case "rank":
      return row.rankLabel;
    case "teams":
      return row.teams.map((t) => teamLabels[t] ?? t).join("; ");
    case "country":
      return row.country ?? "";
    case "emergency_contact_1":
      return contact(extra?.emergencyContacts?.[0]);
    case "emergency_contact_2":
      return contact(extra?.emergencyContacts?.[1]);
    case "allergies":
      return (extra?.allergies ?? []).join("; ");
    case "anaphylactic":
      return extra?.anaphylactic == null
        ? ""
        : extra.anaphylactic
          ? "Yes"
          : "No";
    case "food_dislikes":
      return (extra?.dislikes ?? []).join("; ");
    case "dietary_notes":
      return (extra?.dietaryNotes ?? []).join(" / ");
    case "email":
      return member.email ?? "";
    case "id_type":
      return extra?.idType === "passport"
        ? "Passport"
        : extra?.idType === "sa_id"
          ? "SA ID"
          : "";
    case "id_number":
      return extra?.idNumber ?? "";
    case "arrival":
      return extra?.arrivalAt ? dateTimeFmt.format(extra.arrivalAt) : "";
    case "dues_paid":
      return member.duesPaid ? "Yes" : "No";
    case "approval":
      return APPROVAL[member.approvalStatus];
    case "joined":
      return dateFmt.format(member.createdAt);
    default:
      // A column added to the core list without a cell here is a bug, and an
      // empty column is the loud way to show it in the file.
      return "";
  }
}

/** The header row, then one row per member, in roster order. */
export function memberExportCells(input: {
  columns: readonly MemberExportColumn[];
  members: readonly CampManagementMember[];
  extras: ReadonlyMap<string, MemberExportExtra>;
  teamLabels: Record<string, string>;
}): CsvCell[][] {
  return [
    input.columns.map((c) => c.header),
    ...input.members.map((member) =>
      input.columns.map((c) =>
        cell(c.key, member, input.extras.get(member.id), input.teamLabels),
      ),
    ),
  ];
}

/** `camp-404-members-2026-09-16.csv`, dated in camp time. */
export function memberExportFilename(now: Date): string {
  return `${csvFilenamePart("camp 404 members")}-${fileDateFmt.format(now)}.csv`;
}
