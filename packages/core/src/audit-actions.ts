// Every action the audit trail records, and how a captain reads it.
//
// `AuditEvent.action` in @camp404/db is typed from this list, so a writer with
// a new action does not compile until the action has a label here.

import { LOGISTICS_PHASE_LABELS, LogisticsPhase } from "@camp404/types";
import { MEMBERSHIP_TIER_LABEL } from "./membership-tier";
import { decimalToMinor, formatMoney, isCurrency } from "./money";

export const AUDIT_ACTION_LABELS = {
  "account.sanitized": "Erased their account",
  "announcement.pinned": "Pinned an announcement",
  "announcement.unpinned": "Unpinned an announcement",
  "calendar.event_created": "Added a calendar event",
  "car.rider_added": "Put a member in a car",
  "car.rider_removed": "Took a member out of a car",
  "car.seats_set": "Changed a car's seats",
  "camp.cycle.advanced": "Moved the camp to a new year",
  "camp.cycle.founded": "Set the camp's first year",
  "camp.cycle.renamed": "Renamed a year",
  "camp.cycle.burn_dates_set": "Set the Burn's dates",
  "camp.kitchen_meal_plan.changed": "Changed the kitchen's meal plan",
  "camp.kitchen_menu.added": "Put a recipe on the kitchen's menu",
  "camp.kitchen_menu.removed": "Took a recipe off the kitchen's menu",
  "camp.kitchen_snack.added": "Added a snack to the kitchen's list",
  "camp.kitchen_snack.removed": "Took a snack off the kitchen's list",
  // No longer written (the settings were removed, 2026-09-24); kept so a row
  // written before still reads.
  "camp.kitchen_settings.changed": "Changed the kitchen settings",
  "camp.layout.shared": "Shared the camp layout with neighbours",
  "camp.layout.unshared": "Stopped sharing the camp layout",
  "camp.teams.archived": "Archived a team",
  "camp.teams.described": "Changed what a team does",
  "camp.teams.moved": "Moved a team in the list",
  "camp.teams.renamed": "Renamed a team",
  "camp.teams.unarchived": "Restored a team",
  "document.created": "Started a Survival Guide chapter",
  "dues.charge_added": "Added a charge to a member's dues",
  "dues.charge_cancelled": "Cancelled a charge on a member's dues",
  "dues.fee_charged": "Charged a member's camp fee",
  "dues.fee_set": "Set a member's camp fee",
  "dues.plan_set": "Set a member's payment plan",
  "dues.settle_up_published": "Published a settle-up",
  "dues.tier_added": "Added a fee tier",
  "dues.tier_archived": "Removed a fee tier",
  "dues.tier_changed": "Changed a fee tier",
  "dues.year_saved": "Set the year's dues dates",
  "document.public_set": "Changed whether a Survival Guide chapter is public",
  "document.published": "Published a Survival Guide chapter",
  "document.reviewed": "Kept a Survival Guide chapter for this year",
  "document.unpublished": "Took a Survival Guide chapter off the guide",
  "document.updated": "Edited another writer's Survival Guide chapter",
  "inventory.booking_cancelled": "Cancelled a member's gear booking",
  "inventory.change_approved": "Approved a change to camp gear",
  "inventory.change_rejected": "Rejected a change to camp gear",
  "invite.revoked": "Revoked an invite code",
  "join_site.section_saved": "Changed the join site",
  "logistics.attendance_asked":
    "Asked members which logistics days they can help with",
  "logistics.deadline_added": "Added an AfrikaBurn deadline",
  "logistics.deadline_changed": "Changed an AfrikaBurn deadline",
  "logistics.deadline_done": "Ticked an AfrikaBurn deadline",
  "logistics.deadline_removed": "Removed an AfrikaBurn deadline",
  "logistics.phase_cleared": "Cleared a logistics phase's days",
  "logistics.phase_set": "Set a logistics phase's days",
  "lounge.music_policy_changed": "Changed the lounge's music note",
  "lounge.offer_decided": "Decided a lounge offer",
  "lounge.offer_placed": "Put a lounge offer on the programme",
  "lounge.slot_removed": "Took an item off the lounge programme",
  "member.approval_decided": "Decided an application",
  "member.bank_details.viewed": "Viewed bank details",
  "member.export": "Exported the member list",
  "member.id_document.viewed": "Viewed an ID number",
  "member.membership_tier_set": "Changed how long a member stays",
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
  "payment.proof_viewed": "Viewed a proof of payment",
  "payment.refund_declined": "Declined a refund",
  "payment.refund_requested": "Asked for a refund",
  "payment.refunded": "Refunded a payment",
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
  "reimbursement.account_viewed": "Opened a claim's bank details",
  "reimbursement.receipt_viewed": "Opened a claim's receipt",
  "reimbursement.status_changed": "Moved a reimbursement",
  "rental.item_added": "Added a rental item",
  "rental.item_archived": "Removed a rental item",
  "rental.item_changed": "Changed a rental item",
  "rental.order_confirmed": "Confirmed a member's gear order",
  "rental.order_filled": "Filled in a member's gear order for them",
  "rental.order_reopened": "Reopened a member's gear order",
  "rental.orders_asked": "Asked members for their gear orders",
  "rental.tent_labelled": "Labelled a tent",
  "safety.emergency_contacts.view": "Read emergency contacts",
  "team.program_changed": "Changed a team's description or links",
  "team_budget.set": "Set a team budget",
  "ticket.pass_changed": "Changed a member's ticket, DDT or WAP",
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

// The captain-only passes on a member's ticket row, and their values.
const TICKET_PASS_WORDS: Record<string, string> = {
  ticket: "Ticket",
  ddt: "DDT",
  wap: "WAP",
};
const TICKET_PASS_VALUE_WORDS: Record<string, Record<string, string>> = {
  ticket: {
    unknown: "no answer",
    buying_own: "buying own",
    has_ticket: "has ticket",
    needs_directed_ticket: "wants a DDT",
  },
  ddt: {
    none: "not given",
    allocated: "given",
    can_transfer: "can pass on",
  },
  wap: {
    not_needed: "not needed",
    requested: "requested",
    issued: "issued",
  },
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

// What a lounge decision did, by the status it set.
const LOUNGE_DECISION_WORDS: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  needs_changes: "Asked for changes to",
};

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
    case "logistics.phase_set":
    case "logistics.phase_cleared": {
      const phase = LogisticsPhase.safeParse(text(metadata, "phase"));
      if (!phase.success) return null;
      const label = LOGISTICS_PHASE_LABELS[phase.data];
      const start = text(metadata, "startDate");
      const end = text(metadata, "endDate");
      return action === "logistics.phase_set" && start && end
        ? `${label}, ${start} to ${end}`
        : label;
    }
    case "logistics.attendance_asked": {
      const asked = count(metadata, "asked");
      if (asked === null) return null;
      return `${asked} ${asked === 1 ? "member" : "members"}`;
    }
    case "logistics.deadline_added":
    case "logistics.deadline_changed":
    case "logistics.deadline_removed": {
      const title = text(metadata, "title");
      const due = text(metadata, "dueDate");
      if (!title) return null;
      if (metadata?.skipped === true) return `${title}, no round this year`;
      return due ? `${title}, ${due}` : title;
    }
    case "logistics.deadline_done": {
      const title = text(metadata, "title");
      if (!title) return null;
      return metadata?.done === true ? `${title}, done` : `${title}, not done`;
    }
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
    case "lounge.offer_decided": {
      const to = text(metadata, "to");
      const title = text(metadata, "title");
      const word =
        to && Object.hasOwn(LOUNGE_DECISION_WORDS, to)
          ? LOUNGE_DECISION_WORDS[to]
          : undefined;
      if (!word || !title) return null;
      return `${word} "${title}"`;
    }
    case "lounge.offer_placed":
    case "lounge.slot_removed": {
      const title = text(metadata, "title");
      const day = count(metadata, "day");
      if (!title) return null;
      return day === null ? `"${title}"` : `"${title}", day ${day}`;
    }
    case "inventory.booking_cancelled":
    case "inventory.change_approved":
    case "inventory.change_rejected": {
      const item = text(metadata, "item");
      const team = text(metadata, "team");
      if (!item) return null;
      return team ? `${item} (${teamLabel(team)})` : item;
    }
    case "member.membership_tier_set": {
      const tierWord = (key: string): string | null => {
        const value = text(metadata, key);
        return value !== null && Object.hasOwn(MEMBERSHIP_TIER_LABEL, value)
          ? MEMBERSHIP_TIER_LABEL[value as keyof typeof MEMBERSHIP_TIER_LABEL]
          : null;
      };
      const to = tierWord("to");
      if (!to) return null;
      const from = tierWord("from");
      return from ? `${from} to ${to}` : to;
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
    case "ticket.pass_changed": {
      const pass = text(metadata, "pass");
      const to = text(metadata, "to");
      if (!pass || !Object.hasOwn(TICKET_PASS_WORDS, pass) || !to) return null;
      const values = TICKET_PASS_VALUE_WORDS[pass]!;
      if (!Object.hasOwn(values, to)) return null;
      const cycle = count(metadata, "cycle");
      const line = `${TICKET_PASS_WORDS[pass]}: ${values[to]}`;
      return cycle === null ? line : `${line} for ${cycle}`;
    }
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
    // Money a Finance write moved, and the words the dues screens use.
    case "dues.fee_charged":
    case "dues.fee_set":
    case "dues.charge_added":
    case "dues.charge_cancelled":
    case "dues.tier_added":
    case "dues.tier_changed":
    case "payment.refund_requested":
    case "payment.refunded": {
      const cents = count(metadata, "amountCents");
      const label = text(metadata, "label") ?? text(metadata, "description");
      const money = cents === null ? null : formatMoney(cents);
      const concession =
        action === "dues.fee_set" && metadata?.concession === true
          ? "with a concession"
          : null;
      const parts = [label, money, concession].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    // Gear rental (#241): the item, the order's total, or the tent's label.
    case "rental.item_added":
    case "rental.item_changed":
    case "rental.item_archived":
      return text(metadata, "name");
    case "rental.order_confirmed":
    case "rental.order_reopened": {
      const cents = count(metadata, "totalCents");
      return cents === null ? null : formatMoney(cents);
    }
    case "rental.orders_asked": {
      const asked = count(metadata, "asked");
      if (asked === null) return null;
      return `${asked} ${asked === 1 ? "member" : "members"}`;
    }
    case "rental.tent_labelled": {
      const name = text(metadata, "name");
      const label = text(metadata, "label");
      if (!name) return label;
      return label ? `${name}, ${label}` : `${name}, label removed`;
    }
    case "dues.plan_set": {
      const instalments = count(metadata, "instalments");
      if (instalments === null) return null;
      return instalments === 0
        ? "Plan removed"
        : `${instalments} ${instalments === 1 ? "instalment" : "instalments"}`;
    }
    case "dues.settle_up_published": {
      const cents = count(metadata, "totalCents");
      const members = count(metadata, "members");
      if (cents === null || members === null)
        return text(metadata, "description");
      const verb = cents < 0 ? "back to" : "across";
      return `${formatMoney(Math.abs(cents))} ${verb} ${members} ${members === 1 ? "member" : "members"}`;
    }
    case "payment.proof_viewed":
    case "payment.refund_declined":
      return text(metadata, "reference");
    case "reimbursement.status_changed": {
      const from = text(metadata, "from");
      const to = text(metadata, "to");
      const cents = count(metadata, "amountCents");
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
      // Claims since #242 keep whole cents; an older row keeps its decimal.
      if (cents !== null) return `${formatMoney(cents)}, ${moved}`;
      const amount = text(metadata, "amount");
      if (!amount || !currency) return moved;
      const minor = decimalToMinor(amount);
      // A row from before the currency rule keeps the text it was written with.
      return isCurrency(currency) && minor !== null
        ? `${formatMoney(minor, currency)}, ${moved}`
        : `${currency} ${amount}, ${moved}`;
    }
    case "team.program_changed": {
      const team = text(metadata, "team");
      return team ? teamLabel(team) : null;
    }
    case "team_budget.set": {
      const team = text(metadata, "team");
      if (!team) return null;
      if (!metadata || !("amountCents" in metadata)) return teamLabel(team);
      const cents = count(metadata, "amountCents");
      return `${teamLabel(team)}: ${cents === null ? "no budget" : formatMoney(cents)}`;
    }
    case "reimbursement.receipt_viewed":
    case "reimbursement.account_viewed": {
      const team = text(metadata, "team");
      return team ? teamLabel(team) : null;
    }
    case "document.created":
    case "document.unpublished":
    case "document.reviewed":
    case "document.updated":
      return text(metadata, "title");
    case "document.published": {
      const title = text(metadata, "title");
      const version = count(metadata, "version");
      if (!title) return null;
      return version === null ? title : `${title}, version ${version}`;
    }
    case "document.public_set": {
      const title = text(metadata, "title");
      if (!title || !metadata || typeof metadata.public !== "boolean") {
        return title;
      }
      return `${title}: ${metadata.public ? "public" : "members only"}`;
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
    case "camp.cycle.burn_dates_set": {
      const start = text(metadata, "burnStart");
      const end = text(metadata, "burnEnd");
      return start && end ? `${start} to ${end}` : "Dates removed";
    }
    case "join_site.section_saved": {
      const section = text(metadata, "section");
      const year = count(metadata, "year");
      return section && year !== null ? `${section}, ${year}` : section;
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
