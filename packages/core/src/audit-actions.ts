// Every action the audit trail records, and how a captain reads it.
//
// `AuditEvent.action` in @camp404/db is typed from this list, so a writer with
// a new action does not compile until the action has a label here.

import { decimalToMinor, formatMoney, isCurrency } from "./money";

export const AUDIT_ACTION_LABELS = {
  "account.sanitized": "Erased their account",
  "announcement.pinned": "Pinned an announcement",
  "announcement.unpinned": "Unpinned an announcement",
  "calendar.event_created": "Added a calendar event",
  "car.rider_added": "Put a member in a car",
  "car.rider_removed": "Took a member out of a car",
  "camp.cycle.advanced": "Moved the camp to a new year",
  "camp.cycle.founded": "Set the camp's first year",
  "camp.cycle.renamed": "Renamed a year",
  "camp.kitchen_meal_plan.changed": "Changed the kitchen's meal plan",
  // No longer written (the settings were removed, 2026-09-24); kept so a row
  // written before still reads.
  "camp.kitchen_settings.changed": "Changed the kitchen settings",
  "camp.teams.archived": "Archived a team",
  "camp.teams.moved": "Moved a team in the list",
  "camp.teams.renamed": "Renamed a team",
  "camp.teams.unarchived": "Restored a team",
  "document.created": "Started a camp document",
  "document.published": "Published a camp document",
  "document.unpublished": "Unpublished a camp document",
  "document.updated": "Edited a camp document",
  "invite.revoked": "Revoked an invite code",
  "member.approval_decided": "Decided an application",
  "member.bank_details.viewed": "Viewed bank details",
  "member.export": "Exported the member list",
  "member.id_document.viewed": "Viewed an ID number",
  "member.note_added": "Added a captain note",
  "member.notes.viewed": "Read captain notes",
  "member.rank_changed": "Changed a rank",
  "member.team_assigned": "Added a member to a team",
  "member.team_lead_set": "Changed a team lead",
  "member.team_removed": "Took a member off a team",
  "participation.decided": "Decided a member's place this year",
  "participation.withdrawn": "Withdrew from this year",
  "payment.recorded": "Recorded a payment",
  "payment.status_changed": "Changed a payment",
  "recipe.accepted": "Accepted a recipe version",
  "recipe.adjust_queued": "Asked Claude to change a recipe version",
  "recipe.approved": "Approved a recipe",
  "recipe.changes_requested": "Asked for changes to a recipe",
  "recipe.proofread_queued": "Sent a recipe to Claude to write",
  "recipe.questions_answered": "Answered Claude's questions on a recipe",
  "recipe.plates_queued": "Proofread a recipe for a plate count",
  "recipe.rejected": "Rejected a recipe",
  "recipe.rerun_requested": "Asked a captain to proofread a recipe again",
  "recipe.source_saved": "Changed a recipe's source text",
  "recipe.text_retyped": "Retyped a recipe's text",
  // No longer written (variations were removed, 2026-09-24); kept so a row
  // written before still reads.
  "recipe.variation_started": "Started a recipe variation",
  "recipe.version_added": "Wrote a new recipe version",
  "recipe.written_by_claude": "Had Claude write a recipe version",
  "reimbursement.status_changed": "Moved a reimbursement",
  "safety.emergency_contacts.view": "Read emergency contacts",
  "team_budget.set": "Set a team budget",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;

/** A label for any stored action. An unknown one reads as itself. */
export function auditActionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTION_LABELS, action)
    ? AUDIT_ACTION_LABELS[action as AuditAction]
    : action;
}

type Metadata = Record<string, unknown> | null | undefined;

const text = (metadata: Metadata, key: string): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const count = (metadata: Metadata, key: string): number | null => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const APPROVAL_WORDS: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  pending: "Put back to pending",
};

// The words the payments page uses for each status.
const PAYMENT_WORDS: Record<string, string> = {
  pending: "promised",
  reconciled: "received",
  waived: "waived",
};

const REIMBURSEMENT_WORDS: Record<string, string> = {
  submitted: "submitted",
  approved: "approved",
  paid: "paid",
  reconciled: "reconciled",
  rejected: "rejected",
};

// What a captain's decision on a member's place did, by the status it set.
const PARTICIPATION_DECISION_WORDS: Record<string, string> = {
  accepted: "Accepted",
  waitlisted: "Put on the waiting list",
};

// What a member gave up by answering No, by the status they held.
const PARTICIPATION_WITHDRAWN_WORDS: Record<string, string> = {
  accepted: "Gave up a place",
  waitlisted: "Left the waiting list",
};

function participationDetail(
  words: Record<string, string>,
  status: string | null,
  cycle: number | null,
): string | null {
  const word =
    status !== null && Object.hasOwn(words, status) ? words[status] : undefined;
  if (word === undefined) return null;
  return cycle === null ? word : `${word} for ${cycle}`;
}

// The database stores two ranks. A team lead is a member who leads a team.
const RANK_WORDS: Record<string, string> = {
  captain: "captain",
  member: "member",
};

/**
 * One short line of what changed, from the fields an audit row carries. Null
 * when there is nothing useful to add. Reads only fields it knows, so an odd or
 * old row shows no detail instead of raw data.
 */
export function auditDetail(
  action: string,
  metadata: Metadata,
  teamLabel: (key: string) => string = (key) => key,
): string | null {
  switch (action) {
    case "member.approval_decided": {
      const status = text(metadata, "status");
      const word = status ? APPROVAL_WORDS[status] : undefined;
      if (!word) return null;
      return metadata?.withReason === true ? `${word}, with a reason` : word;
    }
    case "member.rank_changed": {
      const to = text(metadata, "to");
      const from = text(metadata, "from");
      if (!to || !RANK_WORDS[to]) return null;
      return from && RANK_WORDS[from]
        ? `${RANK_WORDS[from]} to ${RANK_WORDS[to]}`
        : `Now ${RANK_WORDS[to]}`;
    }
    case "member.team_assigned":
    case "member.team_removed": {
      const team = text(metadata, "team");
      return team ? teamLabel(team) : null;
    }
    case "member.team_lead_set": {
      const team = text(metadata, "team");
      if (!team) return null;
      return metadata?.isLead === true
        ? `Now leads ${teamLabel(team)}`
        : `No longer leads ${teamLabel(team)}`;
    }
    case "participation.decided":
      return participationDetail(
        PARTICIPATION_DECISION_WORDS,
        text(metadata, "to"),
        count(metadata, "cycle"),
      );
    case "participation.withdrawn":
      return participationDetail(
        PARTICIPATION_WITHDRAWN_WORDS,
        text(metadata, "from"),
        count(metadata, "cycle"),
      );
    case "payment.recorded": {
      const reference = text(metadata, "reference");
      const status = text(metadata, "status");
      const word = status ? PAYMENT_WORDS[status] : undefined;
      if (!reference) return null;
      return word ? `${reference}, ${word}` : reference;
    }
    case "payment.status_changed": {
      const reference = text(metadata, "reference");
      const from = text(metadata, "from");
      const to = text(metadata, "to");
      if (!reference || !from || !to) return reference;
      if (!PAYMENT_WORDS[from] || !PAYMENT_WORDS[to]) return reference;
      return `${reference}, ${PAYMENT_WORDS[from]} to ${PAYMENT_WORDS[to]}`;
    }
    case "reimbursement.status_changed": {
      const from = text(metadata, "from");
      const to = text(metadata, "to");
      const amount = text(metadata, "amount");
      const currency = text(metadata, "currency");
      if (
        !from ||
        !to ||
        !REIMBURSEMENT_WORDS[from] ||
        !REIMBURSEMENT_WORDS[to]
      ) {
        return null;
      }
      const moved = `${REIMBURSEMENT_WORDS[from]} to ${REIMBURSEMENT_WORDS[to]}`;
      if (!amount || !currency) return moved;
      const minor = decimalToMinor(amount);
      // A row from before the currency rule keeps the text it was written with.
      return isCurrency(currency) && minor !== null
        ? `${formatMoney(minor, currency)}, ${moved}`
        : `${currency} ${amount}, ${moved}`;
    }
    case "team_budget.set": {
      const team = text(metadata, "team");
      return team ? teamLabel(team) : null;
    }
    case "document.created":
    case "document.published":
    case "document.unpublished":
      return text(metadata, "title");
    case "document.updated": {
      const version = count(metadata, "version");
      return version === null ? null : `Now version ${version}`;
    }
    // A pin puts a message on every recipient's screen and leaves it there, so
    // the receipt names WHO it is on the screen of — the audience is the whole
    // point of the rule that allowed the pin.
    case "announcement.pinned":
    case "announcement.unpinned": {
      const scope = text(metadata, "scope");
      if (scope === "everyone") return "The whole camp";
      const team = text(metadata, "team");
      return scope === "team" && team ? teamLabel(team) : null;
    }
    // The event's title, and the team it is for; a whole-camp event names
    // no team.
    case "calendar.event_created": {
      const title = text(metadata, "title");
      if (!title) return null;
      const team = text(metadata, "team");
      return team ? `${title} · ${teamLabel(team)}` : title;
    }
    // The recipe's name, and the version number where one was written.
    case "recipe.approved":
    case "recipe.rejected":
    case "recipe.changes_requested":
    case "recipe.text_retyped":
    case "recipe.proofread_queued":
    case "recipe.rerun_requested":
    case "recipe.variation_started":
    case "recipe.questions_answered":
      return text(metadata, "title");
    // The source's own version number, which is not the recipe's.
    case "recipe.source_saved": {
      const title = text(metadata, "title");
      const version = count(metadata, "version");
      if (version === null) return title;
      return title
        ? `${title}, text version ${version}`
        : `Text version ${version}`;
    }
    // The version Claude was asked to change.
    case "recipe.adjust_queued": {
      const title = text(metadata, "title");
      const version = count(metadata, "fromVersion");
      if (version === null) return title;
      return title
        ? `${title}, from version ${version}`
        : `From version ${version}`;
    }
    case "recipe.plates_queued": {
      const title = text(metadata, "title");
      const plates = count(metadata, "plates");
      if (plates === null) return title;
      return title ? `${title}, ${plates} plates` : `${plates} plates`;
    }
    case "recipe.accepted":
    case "recipe.version_added":
    case "recipe.written_by_claude": {
      const title = text(metadata, "title");
      const version = count(metadata, "version");
      if (version === null) return title;
      return title ? `${title}, version ${version}` : `Version ${version}`;
    }
    case "camp.cycle.renamed": {
      const to = text(metadata, "to");
      return to ? `Now called "${to}"` : "Name removed";
    }
    case "camp.teams.renamed": {
      const label = text(metadata, "label");
      return label ? `Now called "${label}"` : null;
    }
    case "camp.teams.moved": {
      const direction = text(metadata, "direction");
      return direction === "up" || direction === "down"
        ? `Moved ${direction}`
        : null;
    }
    // A read made through the Claude connector (MCP) says so; the app's own
    // reads need no note.
    case "member.id_document.viewed":
    case "member.bank_details.viewed":
    case "safety.emergency_contacts.view":
      return text(metadata, "via") === "mcp" ? "Through Claude" : null;
    case "member.export": {
      const rows = count(metadata, "rows");
      return rows === null
        ? null
        : `${rows} ${rows === 1 ? "member" : "members"}`;
    }
    default:
      return null;
  }
}
