import "server-only";

import {
  CSV_MIME,
  hasClearance,
  memberExportColumnsFor,
  toCsvFile,
  type MemberExportColumn,
} from "@camp404/core";
import { appendAuditEvent } from "@camp404/db/audit";
import { decryptField } from "@camp404/db/crypto";
import {
  getMemberExportExtras,
  type MemberExportExtras,
  type MemberExportOptions,
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
  memberCellRows,
  memberExportFilename,
  type MemberCellOptions,
  type MemberExportExtra,
} from "./member-export-csv";
import { getQuestionnaireForResponses } from "./questionnaire-config";
import { getCampManagementRoster, type CampManagementMember } from "./roster";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";
import { dietaryTestStore } from "./test-store-dietary";

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

/** The data beyond the roster row, by member id. */
async function loadExtras(
  options: MemberExportOptions,
): Promise<Map<string, MemberExportExtra>> {
  if (!options.safety && !options.captain) return new Map();
  if (usesTestStore()) return testStoreExtras(options);
  const [rows, questionnaire] = await Promise.all([
    getMemberExportExtras(options),
    getQuestionnaireForResponses(),
  ]);
  const questions = flattenQuestions(questionnaire);
  const labels = {
    allergies: optionLabels(questions, "dietary.allergies"),
    dislikes: optionLabels(questions, "dietary.dislikes"),
  };
  return new Map(rows.map((row) => [row.userId, toExtra(row, labels)]));
}

/**
 * The E2E store's twin of the extras: the emergency contacts and ID a test
 * member gave, and the old dietary form's words (/api/test/seed-allergy). The
 * store keeps no burner profile dietary answers and no arrival.
 */
function testStoreExtras(
  options: MemberExportOptions,
): Map<string, MemberExportExtra> {
  const dietary = new Map(dietaryTestStore.rows());
  return new Map(
    testStore.getCampManagementRoster().map((m) => {
      const diet = options.safety ? dietary.get(m.id) : undefined;
      const id = options.captain ? testStore.getIdDocuments(m.id) : null;
      const idType =
        id?.idType === "passport" || id?.idType === "sa_id" ? id.idType : null;
      return [
        m.id,
        {
          emergencyContacts: options.safety
            ? testStore.getEmergencyContacts(m.id)
            : null,
          allergies: diet?.allergies ? [diet.allergies] : [],
          anaphylactic: diet ? diet.isAnaphylactic : null,
          dislikes: [],
          dietaryNotes: diet?.notes ? [diet.notes] : [],
          idType,
          idNumber: idType ? (id?.idNumber ?? null) : null,
          arrivalAt: null,
        },
      ];
    }),
  );
}

/** The columns a viewer gets, the people listed, and one row of words each. */
export interface MemberTable {
  columns: MemberExportColumn[];
  members: CampManagementMember[];
  rows: string[][];
}

/**
 * The member table one viewer may read: the export's columns for their rank
 * and the people their roster lists, as words. The CSV export and the
 * captains' Camp sheet both read it; neither writes its audit row here.
 * `rank` must be the viewer's exact rank, team-lead flag included.
 */
export async function loadMemberTable(
  viewer: { rank: ViewerRank },
  options: MemberCellOptions = {},
): Promise<MemberTable> {
  const columns = memberExportColumnsFor(viewer.rank);
  const has = (key: string) => columns.some((c) => c.key === key);

  const [everyone, config, extras] = await Promise.all([
    getCampManagementRoster({ includeEmail: has("email") }),
    getTeamsConfig(),
    loadExtras({
      safety: has("emergency_contact_1") || has("allergies"),
      captain: has("id_number") || has("arrival"),
    }),
  ]);

  // The table lists the people the SCREEN lists: a non-captain's roster leaves
  // out declined sign-ups (MEMBERS_SEE_REJECTED), so their export does too —
  // otherwise the Approval column, now member-readable, would hand a member the
  // rejections the roster deliberately withholds.
  const members = membersVisibleTo(
    everyone,
    hasClearance(viewer.rank, "captain"),
  );

  return {
    columns,
    members,
    rows: memberCellRows(
      { columns, members, extras, teamLabels: teamLabelMap(config) },
      options,
    ),
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
  const { columns, members, rows } = await loadMemberTable(viewer);
  const content = toCsvFile([columns.map((c) => c.header), ...rows]);

  if (!usesTestStore()) {
    await appendAuditEvent({
      actorId: viewer.userId,
      action: "member.export",
      metadata: {
        rank: viewer.rank,
        columns: columns.map((c) => c.key),
        rows: members.length,
      },
    });
  }

  return {
    filename: memberExportFilename(new Date()),
    content,
    mimeType: CSV_MIME,
  };
}
