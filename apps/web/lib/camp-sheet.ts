import "server-only";

import { isPrivateExportColumn, type MemberExportGroup } from "@camp404/core";
import { appendAuditEvent } from "@camp404/db/audit";
import type { ParticipationStatus } from "@camp404/types";
import { loadMemberTable } from "./member-export";
import { usesTestStore } from "./test-mode";

// The captains' Camp sheet: every member and everything the camp holds on
// them, on one screen, the way the previous captain ran the camp from a
// spreadsheet. It is the member export's table at the captain's column set
// (lib/member-export.ts), so the sheet and the CSV can never disagree. Only
// words cross to the browser, never a raw row.
//
// The sheet shows ID numbers, so like the export it writes one audit row
// BEFORE anything is shown, and fails when that row cannot be written.

/** One column of the sheet, as the browser gets it. */
export interface CampSheetColumn {
  key: string;
  header: string;
  group: MemberExportGroup;
  /** ID, safety or dietary data: the cell is marked `data-os-private`. */
  private: boolean;
}

/** One person's line: their words, plus what the filters match on. */
export interface CampSheetRow {
  id: string;
  cells: string[];
  /** Team keys this year, for the team filter. */
  teams: string[];
  /** This year's status, for the "This year" filter. */
  thisYear: ParticipationStatus | null;
}

export interface CampSheet {
  columns: CampSheetColumn[];
  rows: CampSheetRow[];
}

/**
 * The Camp sheet for a captain. The caller has already cleared the captain
 * bar (captainPageGate("captain")); a viewer below it must never reach this.
 */
export async function buildCampSheet(viewer: {
  userId: string;
}): Promise<CampSheet> {
  const table = await loadMemberTable({ rank: "captain" }, { markLeads: true });

  // Before the sheet is returned, so a captain never reads an ID number that
  // went unrecorded. A failure here fails the page.
  if (!usesTestStore()) {
    await appendAuditEvent({
      actorId: viewer.userId,
      action: "member.sheet_viewed",
      metadata: {
        columns: table.columns.map((c) => c.key),
        rows: table.members.length,
      },
    });
  }

  return {
    columns: table.columns.map((c) => ({
      key: c.key,
      header: c.header,
      group: c.group,
      private: isPrivateExportColumn(c),
    })),
    rows: table.members.map((m, i) => ({
      id: m.id,
      cells: table.rows[i]!,
      teams: m.teams,
      thisYear: m.participation,
    })),
  };
}
