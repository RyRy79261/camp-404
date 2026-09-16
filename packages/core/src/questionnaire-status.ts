import type { QuestionnaireQueueStatus } from "@camp404/types";

// Where each questionnaire stands for one member, for the captain's member
// panel (docs/questionnaire-builder.md §9 Phase E: complete / next-up / locked /
// expired). Derived from the member's required_actions rows, never stored.

export type MemberQuestionnaireStatus = QuestionnaireQueueStatus | "optional";

export interface QuestionnaireGateRow {
  actionKey: string;
  title: string;
  status: "pending" | "completed" | "waived" | "expired";
  blocking: boolean;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface MemberQuestionnaire {
  key: string;
  title: string;
  status: MemberQuestionnaireStatus;
  dueAt: Date | null;
  completedAt: Date | null;
}

/**
 * The member's questionnaires, oldest first, each with its status:
 * - `complete`: answered.
 * - `next-up`: the blocking one the member is sent to now (the oldest pending
 *   blocking gate, the same order the member ladder uses).
 * - `locked`: blocking, but waiting behind the one that is up next.
 * - `optional`: pending and not blocking; it waits in their inbox.
 * - `expired`: closed or waived before they answered.
 */
export function memberQuestionnaireStatuses(
  rows: readonly QuestionnaireGateRow[],
): MemberQuestionnaire[] {
  const ordered = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  let upNextTaken = false;
  return ordered.map((row) => {
    let status: MemberQuestionnaireStatus;
    if (row.status === "completed") status = "complete";
    else if (row.status === "waived" || row.status === "expired") {
      status = "expired";
    } else if (!row.blocking) status = "optional";
    else if (!upNextTaken) {
      status = "next-up";
      upNextTaken = true;
    } else status = "locked";
    return {
      key: row.actionKey,
      title: row.title,
      status,
      dueAt: row.dueAt,
      completedAt: row.completedAt,
    };
  });
}
