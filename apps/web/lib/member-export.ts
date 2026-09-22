import "server-only";

import {
  CSV_MIME,
  hasClearance,
  memberExportColumnsFor,
  toCsvFile,
} from "@camp404/core";
import { appendAuditEvent } from "@camp404/db/audit";
import { decryptField } from "@camp404/db/crypto";
import {
  getMemberExportExtras,
  type MemberExportExtras,
} from "@camp404/db/member-export";
import {
  flattenQuestions,
  type Question,
  type ViewerRank,
} from "@camp404/types";
import { getTeamsConfig, teamLabelMap } from "./camp-config";
import { membersVisibleTo } from "./camp-roster";
import {
  UNREADABLE_ID,
  memberExportCells,
  memberExportFilename,
  type MemberExportExtra,
} from "./member-export-csv";
import { getQuestionnaireForResponses } from "./questionnaire-config";
import { getCampManagementRoster } from "./roster";
import { usesTestStore } from "./test-mode";

// The member export (owner's ruling, 2026-09-16): one button for every rank,
// and the file holds exactly what the viewer's read level allows. The columns
// come from @camp404/core's field list; only the data those columns need is
// fetched; and every export leaves one audit row BEFORE the file is handed
// over, because a captain's file holds ID numbers. If that row cannot be
// written, the export fails.

export interface MemberExportFile {
  filename: string;
  content: string;
  mimeType: string;
}

/** Option values to labels for one choice question, or an empty map. */
function optionLabels(questions: Question[], id: string): Map<string, string> {
  const question = questions.find((q) => q.id === id);
  const options =
    question && "options" in question && Array.isArray(question.options)
      ? question.options
      : [];
  return new Map(options.map((o) => [o.value, o.label]));
}

function labelled(raw: unknown, labels: Map<string, string>): string[] {
  const values = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  return values.map((v) => labels.get(String(v)) ?? String(v));
}

function toExtra(
  row: MemberExportExtras,
  labels: { allergies: Map<string, string>; dislikes: Map<string, string> },
): MemberExportExtra {
  const passport = decryptField(row.passportEncrypted);
  const saId = decryptField(row.saIdEncrypted);
  const readable =
    passport.state === "ok"
      ? { idType: "passport" as const, idNumber: passport.value }
      : saId.state === "ok"
        ? { idType: "sa_id" as const, idNumber: saId.value }
        : null;
  // An unreadable column is on file; it must never read as "no ID given".
  const id =
    readable ??
    (passport.state === "unreadable"
      ? { idType: "passport" as const, idNumber: UNREADABLE_ID }
      : saId.state === "unreadable"
        ? { idType: "sa_id" as const, idNumber: UNREADABLE_ID }
        : { idType: null, idNumber: null });

  return {
    emergencyContacts: row.emergencyContacts,
    allergies: [
      ...labelled(row.dietaryAllergies, labels.allergies),
      ...(row.allergies ? [row.allergies] : []),
    ],
    anaphylactic: row.isAnaphylactic,
    dislikes: labelled(row.dietaryDislikes, labels.dislikes),
    dietaryNotes: [
      ...(typeof row.dietaryNotes === "string" && row.dietaryNotes
        ? [row.dietaryNotes]
        : []),
      ...(row.notes ? [row.notes] : []),
    ],
    ...id,
    arrivalAt: row.arrivalAt,
  };
}

/**
 * Build the member export for one viewer. `rank` must be the viewer's exact
 * rank, team-lead flag included (captainPageGate below the captain bar).
 */
export async function buildMemberExport(viewer: {
  userId: string;
  rank: ViewerRank;
}): Promise<MemberExportFile> {
  const columns = memberExportColumnsFor(viewer.rank);
  const keys = columns.map((c) => c.key);
  const has = (key: string) => keys.includes(key);

  const safety = has("emergency_contact_1") || has("allergies");
  const captain = has("id_number") || has("arrival");
  const [everyone, config, questionnaire, extraRows] = await Promise.all([
    getCampManagementRoster({ includeEmail: has("email") }),
    getTeamsConfig(),
    getQuestionnaireForResponses(),
    // The E2E store keeps none of this data, so a test export has roster
    // columns only.
    safety || captain
      ? usesTestStore()
        ? Promise.resolve([])
        : getMemberExportExtras({ safety, captain })
      : Promise.resolve([]),
  ]);

  // The file lists the people the SCREEN lists: a non-captain's roster leaves
  // out declined sign-ups (MEMBERS_SEE_REJECTED), so their export does too —
  // otherwise the Approval column, now member-readable, would hand a member the
  // rejections the roster deliberately withholds.
  const members = membersVisibleTo(
    everyone,
    hasClearance(viewer.rank, "captain"),
  );

  const questions = flattenQuestions(questionnaire);
  const labels = {
    allergies: optionLabels(questions, "dietary.allergies"),
    dislikes: optionLabels(questions, "dietary.dislikes"),
  };
  const extras = new Map(
    extraRows.map((row) => [row.userId, toExtra(row, labels)]),
  );

  const content = toCsvFile(
    memberExportCells({
      columns,
      members,
      extras,
      teamLabels: teamLabelMap(config),
    }),
  );

  if (!usesTestStore()) {
    await appendAuditEvent({
      actorId: viewer.userId,
      action: "member.export",
      metadata: { rank: viewer.rank, columns: keys, rows: members.length },
    });
  }

  return {
    filename: memberExportFilename(new Date()),
    content,
    mimeType: CSV_MIME,
  };
}
