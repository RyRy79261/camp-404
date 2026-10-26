// Every action the audit trail records, and how a captain reads it.
//
// `AuditEvent.action` in @camp404/db is typed from this list, so a writer with
// a new action does not compile until the action has a label here and a
// metadata shape in `AuditEvents` (audit-events.ts).

import {
  GUIDE_CATEGORY_LABELS,
  GuideCategory,
  LOGISTICS_PHASE_LABELS,
  LogisticsPhase,
} from "@camp404/types";
import type { StoredAuditKey } from "./audit-events";
import { decimalToMinor, formatMoney, isCurrency } from "./money";

export const AUDIT_ACTION_LABELS = {
  "account.sanitized": "Erased their account",
  "announcement.pinned": "Pinned an announcement",
  "announcement.unpinned": "Unpinned an announcement",
  "calendar.event_created": "Added a calendar event",
  "calendar.event_changed": "Changed a calendar event",
  "calendar.event_removed": "Took an event off the calendar",
  "car.rider_added": "Put a member in a car",
  "car.rider_removed": "Took a member out of a car",
  "car.lift_request_declined": "Declined a member's lift request",
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
  "camp.kitchen_price.set": "Set a shop or a price on the shopping list",
  "camp.kitchen_allergens.corrected": "Corrected the allergens a recipe holds",
  "camp.kitchen_allergen_plan.recorded":
    "Recorded the kitchen's plan for an anaphylaxis on a meal",
  "camp.kitchen_prep.added": "Added a prep step to a meal",
  "camp.kitchen_prep.removed": "Took a prep step off a meal",
  "camp.kitchen_prep.redated":
    "Moved the prep steps and their tasks with the meal plan's Day 1",
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
  "guide.section_public_set":
    "Changed whether a Survival Guide section is on the public site",
  // No longer written (2026-10-04: sharing is per section now, and a chapter
  // is marked members only instead); kept so a row written before still reads.
  "document.public_set": "Changed whether a Survival Guide chapter is public",
  "document.members_only_set":
    "Changed whether a Survival Guide chapter is kept for members",
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
  "member.note_added": "Added a captain note",
  "member.notes.viewed": "Read captain notes",
  "member.rank_changed": "Changed a rank",
  "member.sheet_viewed": "Opened the camp sheet",
  "member.team_assigned": "Added a member to a team",
  "member.team_lead_set": "Changed a team lead",
  "member.team_removed": "Took a member off a team",
  "participation.decided": "Decided a member's place this year",
  "participation.withdrawn": "Withdrew from this year",
  "payment.recorded": "Recorded a payment",
  "pet.hint_changed": "Changed a pet's hint",
  "pet.line_changed": "Changed the one stupid thing on a pet's card",
  "pet.marked_in": "Marked a pet as in",
  "pet.owner_set": "Said whose pet it is",
  "power.fuel_can_added": "Added a fuel can",
  "power.fuel_can_changed": "Changed a fuel can",
  "power.fuel_can_removed": "Removed a fuel can",
  "payment.status_changed": "Changed a payment",
  "payment.proof_viewed": "Viewed a proof of payment",
  "report_screenshot.deleted": "Deleted a bug report's screenshot",
  "report_screenshot.viewed": "Viewed a bug report's screenshot",
  "payment.refund_declined": "Declined a refund",
  "payment.refund_requested": "Asked for a refund",
  "payment.refunded": "Refunded a payment",
  "questionnaire.anonymous_results_set":
    "Changed whether a questionnaire's results show names",
  "questionnaire.carry_over_set":
    "Changed whether a questionnaire is asked again next year",
  "questionnaire.send_closed": "Closed a questionnaire send",
  "questionnaire.unpublished": "Unpublished a questionnaire",
  "recipe.accepted": "Accepted a recipe version",
  "recipe.adjust_queued": "Asked Claude to change a recipe version",
  "recipe.approved": "Approved a recipe",
  "recipe.changes_requested": "Asked for changes to a recipe",
  "recipe.proofread_queued": "Sent a recipe to Claude to write",
  "recipe.questions_answered": "Answered Claude's questions on a recipe",
  "recipe.plates_queued": "Proofread a recipe for a plate count",
  "recipe.rejected": "Rejected a recipe",
  "recipe.renamed": "Renamed a recipe",
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
  "safety.allergies.view": "Read a member's allergies",
  "safety.emergency_contacts.view": "Read emergency contacts",
  "shifts.asked": "Asked members to sign up for shifts",
  "shifts.days_added": "Added days to a shift",
  "shifts.member_placed": "Put a member on a shift",
  "shifts.member_removed": "Took a member off a shift",
  "shifts.slot_needed_set": "Changed whether a shift is needed on a day",
  "shifts.type_added": "Added a shift",
  "shifts.type_changed": "Changed a shift",
  "shifts.type_removed": "Removed a shift",
  "team.program_changed": "Changed a team's description or links",
  "team.role_added": "Added a role to a team",
  "team.role_changed": "Changed a team's role",
  "team.role_removed": "Removed a team's role",
  "team.roles_copied": "Copied last year's roles to a team",
  "team.lead_places_set": "Changed how many leads a team wants",
  "team.role_given": "Gave a member a role in a team",
  "team.role_taken": "Took a member out of a team's role",
  "team_budget.set": "Set a team budget",
  "telegram.chat_added": "Had Ol' Jeb post in a Telegram chat",
  "telegram.chat_removed": "Stopped Ol' Jeb posting in a Telegram chat",
  "telegram.posts_set": "Changed what Ol' Jeb posts in the camp's chats",
  "telegram.questionnaire_posted": "Posted a questionnaire in Telegram",
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

function isAuditAction(action: string): action is AuditAction {
  return Object.hasOwn(AUDIT_ACTION_LABELS, action);
}

/**
 * A stored row's metadata, read by the keys its action may hold
 * (`StoredAuditKey`). Each value is still checked: a row keeps the JSON it was
 * written with, so a missing or odd value reads as null.
 */
function stored<A extends AuditAction>(_action: A, metadata: Metadata) {
  const get = (key: StoredAuditKey<A>): unknown => metadata?.[key];
  return {
    text(key: StoredAuditKey<A>): string | null {
      const value = get(key);
      return typeof value === "string" && value.trim() ? value : null;
    },
    count(key: StoredAuditKey<A>): number | null {
      const value = get(key);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
    flag(key: StoredAuditKey<A>): boolean | null {
      const value = get(key);
      return typeof value === "boolean" ? value : null;
    },
    has(key: StoredAuditKey<A>): boolean {
      return metadata != null && key in metadata;
    },
    list(key: StoredAuditKey<A>): readonly unknown[] | null {
      const value = get(key);
      return Array.isArray(value) ? value : null;
    },
  };
}

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
  if (!isAuditAction(action)) return null;
  switch (action) {
    case "logistics.phase_set":
    case "logistics.phase_cleared": {
      const m = stored(action, metadata);
      const phase = LogisticsPhase.safeParse(m.text("phase"));
      if (!phase.success) return null;
      const label = LOGISTICS_PHASE_LABELS[phase.data];
      const start = m.text("startDate");
      const end = m.text("endDate");
      return action === "logistics.phase_set" && start && end
        ? `${label}, ${start} to ${end}`
        : label;
    }
    case "logistics.attendance_asked": {
      const m = stored(action, metadata);
      const asked = m.count("asked");
      if (asked === null) return null;
      return `${asked} ${asked === 1 ? "member" : "members"}`;
    }
    case "shifts.asked": {
      const m = stored(action, metadata);
      const asked = m.count("asked");
      if (asked === null) return null;
      return `${asked} ${asked === 1 ? "member" : "members"}`;
    }
    case "shifts.type_added":
    case "shifts.type_changed":
    case "shifts.type_removed":
    case "shifts.days_added": {
      const m = stored(action, metadata);
      return m.text("name");
    }
    case "shifts.slot_needed_set": {
      const m = stored(action, metadata);
      const name = m.text("name");
      const day = m.text("day");
      if (!name || !day) return null;
      return `${name}, ${day}, ${m.flag("needed") === true ? "needed" : "not needed"}`;
    }
    case "shifts.member_placed":
    case "shifts.member_removed": {
      const m = stored(action, metadata);
      const name = m.text("name");
      const day = m.text("day");
      if (!name || !day) return null;
      return `${name}, ${day}`;
    }
    case "logistics.deadline_added":
    case "logistics.deadline_changed":
    case "logistics.deadline_removed": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const due = m.text("dueDate");
      if (!title) return null;
      if (m.flag("skipped") === true) return `${title}, no round this year`;
      return due ? `${title}, ${due}` : title;
    }
    case "logistics.deadline_done": {
      const m = stored(action, metadata);
      const title = m.text("title");
      if (!title) return null;
      return m.flag("done") === true ? `${title}, done` : `${title}, not done`;
    }
    case "member.approval_decided": {
      const m = stored(action, metadata);
      const status = m.text("status");
      const word = status ? APPROVAL_WORDS[status] : undefined;
      if (!word) return null;
      return m.flag("withReason") === true ? `${word}, with a reason` : word;
    }
    case "member.rank_changed": {
      const m = stored(action, metadata);
      const to = m.text("to");
      const from = m.text("from");
      if (!to || !RANK_WORDS[to]) return null;
      return from && RANK_WORDS[from]
        ? `${RANK_WORDS[from]} to ${RANK_WORDS[to]}`
        : `Now ${RANK_WORDS[to]}`;
    }
    case "member.team_assigned":
    case "member.team_removed": {
      const m = stored(action, metadata);
      const team = m.text("team");
      return team ? teamLabel(team) : null;
    }
    case "member.team_lead_set": {
      const m = stored(action, metadata);
      const team = m.text("team");
      if (!team) return null;
      return m.flag("isLead") === true
        ? `Now leads ${teamLabel(team)}`
        : `No longer leads ${teamLabel(team)}`;
    }
    case "lounge.offer_decided": {
      const m = stored(action, metadata);
      const to = m.text("to");
      const title = m.text("title");
      const word =
        to && Object.hasOwn(LOUNGE_DECISION_WORDS, to)
          ? LOUNGE_DECISION_WORDS[to]
          : undefined;
      if (!word || !title) return null;
      return `${word} "${title}"`;
    }
    case "lounge.offer_placed":
    case "lounge.slot_removed": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const day = m.count("day");
      if (!title) return null;
      return day === null ? `"${title}"` : `"${title}", day ${day}`;
    }
    case "inventory.booking_cancelled":
    case "inventory.change_approved":
    case "inventory.change_rejected": {
      const m = stored(action, metadata);
      const item = m.text("item");
      const team = m.text("team");
      if (!item) return null;
      return team ? `${item} (${teamLabel(team)})` : item;
    }
    case "telegram.chat_added":
    case "telegram.chat_removed":
      return stored(action, metadata).text("title");
    case "telegram.questionnaire_posted": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const tagged = m.count("tagged");
      if (!title) return null;
      return tagged === null
        ? `"${title}"`
        : `"${title}", tagged ${tagged === 1 ? "1 person" : `${tagged} people`}`;
    }
    case "pet.marked_in":
    case "pet.hint_changed":
    case "pet.line_changed":
    case "pet.owner_set":
      return stored(action, metadata).text("name");
    case "participation.decided":
      return participationDetail(
        PARTICIPATION_DECISION_WORDS,
        stored(action, metadata).text("to"),
        stored(action, metadata).count("cycle"),
      );
    case "participation.withdrawn":
      return participationDetail(
        PARTICIPATION_WITHDRAWN_WORDS,
        stored(action, metadata).text("from"),
        stored(action, metadata).count("cycle"),
      );
    case "ticket.pass_changed": {
      const m = stored(action, metadata);
      const pass = m.text("pass");
      const to = m.text("to");
      if (!pass || !Object.hasOwn(TICKET_PASS_WORDS, pass) || !to) return null;
      const values = TICKET_PASS_VALUE_WORDS[pass]!;
      if (!Object.hasOwn(values, to)) return null;
      const cycle = m.count("cycle");
      const line = `${TICKET_PASS_WORDS[pass]}: ${values[to]}`;
      return cycle === null ? line : `${line} for ${cycle}`;
    }
    case "payment.recorded": {
      const m = stored(action, metadata);
      const reference = m.text("reference");
      const status = m.text("status");
      const word = status ? PAYMENT_WORDS[status] : undefined;
      if (!reference) return null;
      return word ? `${reference}, ${word}` : reference;
    }
    case "payment.status_changed": {
      const m = stored(action, metadata);
      const reference = m.text("reference");
      const from = m.text("from");
      const to = m.text("to");
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
      const m = stored(action, metadata);
      const cents = m.count("amountCents");
      const label = m.text("label") ?? m.text("description");
      const money = cents === null ? null : formatMoney(cents);
      const concession =
        action === "dues.fee_set" && m.flag("concession") === true
          ? "with a concession"
          : null;
      const parts = [label, money, concession].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    // Gear rental (#241): the item, the order's total, or the tent's label.
    case "rental.item_added":
    case "rental.item_changed":
    case "rental.item_archived":
      return stored(action, metadata).text("name");
    case "rental.order_confirmed":
    case "rental.order_reopened": {
      const m = stored(action, metadata);
      const cents = m.count("totalCents");
      return cents === null ? null : formatMoney(cents);
    }
    case "rental.orders_asked": {
      const m = stored(action, metadata);
      const asked = m.count("asked");
      if (asked === null) return null;
      return `${asked} ${asked === 1 ? "member" : "members"}`;
    }
    case "rental.tent_labelled": {
      const m = stored(action, metadata);
      const name = m.text("name");
      const label = m.text("label");
      if (!name) return label;
      return label ? `${name}, ${label}` : `${name}, label removed`;
    }
    case "dues.plan_set": {
      const m = stored(action, metadata);
      const instalments = m.count("instalments");
      if (instalments === null) return null;
      return instalments === 0
        ? "Plan removed"
        : `${instalments} ${instalments === 1 ? "instalment" : "instalments"}`;
    }
    case "dues.settle_up_published": {
      const m = stored(action, metadata);
      const cents = m.count("totalCents");
      const members = m.count("members");
      if (cents === null || members === null) return m.text("description");
      const verb = cents < 0 ? "back to" : "across";
      return `${formatMoney(Math.abs(cents))} ${verb} ${members} ${members === 1 ? "member" : "members"}`;
    }
    case "payment.proof_viewed":
    case "payment.refund_declined":
      return stored(action, metadata).text("reference");
    case "report_screenshot.deleted":
    case "report_screenshot.viewed": {
      const m = stored(action, metadata);
      const issue = m.count("issueNumber");
      return issue && issue > 0 ? `Issue #${issue}` : null;
    }
    case "reimbursement.status_changed": {
      const m = stored(action, metadata);
      const from = m.text("from");
      const to = m.text("to");
      const cents = m.count("amountCents");
      const currency = m.text("currency");
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
      const amount = m.text("amount");
      if (!amount || !currency) return moved;
      const minor = decimalToMinor(amount);
      // A row from before the currency rule keeps the text it was written with.
      return isCurrency(currency) && minor !== null
        ? `${formatMoney(minor, currency)}, ${moved}`
        : `${currency} ${amount}, ${moved}`;
    }
    case "team.program_changed": {
      const m = stored(action, metadata);
      const team = m.text("team");
      return team ? teamLabel(team) : null;
    }
    case "team.role_added":
    case "team.role_changed":
    case "team.role_removed":
    case "team.role_given":
    case "team.role_taken": {
      const m = stored(action, metadata);
      const team = m.text("team");
      const name = m.text("name");
      if (!team || !name) return null;
      return `${teamLabel(team)}: ${name}`;
    }
    case "team.roles_copied": {
      const m = stored(action, metadata);
      const team = m.text("team");
      const copied = m.count("copied");
      if (!team || copied === null) return null;
      return `${teamLabel(team)}: ${copied} ${copied === 1 ? "role" : "roles"}`;
    }
    case "team.lead_places_set": {
      const m = stored(action, metadata);
      const team = m.text("team");
      const places = m.count("places");
      if (!team || places === null) return null;
      return `${teamLabel(team)}: ${places} ${places === 1 ? "lead" : "leads"}`;
    }
    case "team_budget.set": {
      const m = stored(action, metadata);
      const team = m.text("team");
      if (!team) return null;
      if (!m.has("amountCents")) return teamLabel(team);
      const cents = m.count("amountCents");
      return `${teamLabel(team)}: ${cents === null ? "no budget" : formatMoney(cents)}`;
    }
    case "reimbursement.receipt_viewed":
    case "reimbursement.account_viewed": {
      const m = stored(action, metadata);
      const team = m.text("team");
      return team ? teamLabel(team) : null;
    }
    case "document.created":
    case "document.unpublished":
    case "document.reviewed":
    case "document.updated":
      return stored(action, metadata).text("title");
    case "document.published": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const version = m.count("version");
      if (!title) return null;
      const named = version === null ? title : `${title}, version ${version}`;
      const isPublic = m.flag("public");
      if (isPublic === null) return named;
      return `${named}${isPublic ? ", on the public site" : ""}`;
    }
    case "document.members_only_set": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const membersOnly = m.flag("membersOnly");
      if (!title || membersOnly === null) return title;
      return `${title}: ${membersOnly ? "members only" : "may go on the public site"}`;
    }
    case "guide.section_public_set": {
      const m = stored(action, metadata);
      const key = GuideCategory.safeParse(m.text("category"));
      const isPublic = m.flag("public");
      if (!key.success || isPublic === null) return null;
      const chapters = m.list("chapters")?.length ?? null;
      const label = GUIDE_CATEGORY_LABELS[key.data];
      const state = isPublic ? "public" : "members only";
      return chapters === null
        ? `${label}: ${state}`
        : `${label}: ${state}, ${chapters} ${chapters === 1 ? "chapter" : "chapters"}`;
    }
    case "document.public_set": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const isPublic = m.flag("public");
      if (!title || isPublic === null) return title;
      return `${title}: ${isPublic ? "public" : "members only"}`;
    }
    // The questionnaire's title; a year-policy change says which way it went.
    case "questionnaire.unpublished":
    case "questionnaire.send_closed":
      return stored(action, metadata).text("title");
    case "questionnaire.anonymous_results_set": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const anonymous = m.flag("anonymous");
      if (!title || anonymous === null) return title;
      return `${title}: ${anonymous ? "results without names" : "results with names"}`;
    }
    case "questionnaire.carry_over_set": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const carryOver = m.flag("carryOver");
      if (!title || carryOver === null) return title;
      return `${title}: ${carryOver ? "answers kept next year" : "asked again next year"}`;
    }
    // A pin puts a message on every recipient's screen and leaves it there, so
    // the receipt names WHO it is on the screen of — the audience is the whole
    // point of the rule that allowed the pin.
    case "announcement.pinned":
    case "announcement.unpinned": {
      const m = stored(action, metadata);
      const scope = m.text("scope");
      if (scope === "everyone") return "The whole camp";
      if (scope === "team_leads") return "The team leads";
      if (scope === "drivers") return "The drivers";
      if (scope === "individual") return "Chosen people";
      const team = m.text("team");
      return scope === "team" && team ? teamLabel(team) : null;
    }
    // The event's title, and the team it is for; a whole-camp event names
    // no team.
    case "calendar.event_created":
    case "calendar.event_changed":
    case "calendar.event_removed": {
      const m = stored(action, metadata);
      const title = m.text("title");
      if (!title) return null;
      const team = m.text("team");
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
      return stored(action, metadata).text("title");
    // The old name and the new one.
    case "recipe.renamed": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const from = m.text("from");
      if (!title) return null;
      return from ? `${from} → ${title}` : title;
    }
    // The source's own version number, which is not the recipe's.
    case "recipe.source_saved": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const version = m.count("version");
      if (version === null) return title;
      return title
        ? `${title}, text version ${version}`
        : `Text version ${version}`;
    }
    // The version Claude was asked to change.
    case "recipe.adjust_queued": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const version = m.count("fromVersion");
      if (version === null) return title;
      return title
        ? `${title}, from version ${version}`
        : `From version ${version}`;
    }
    case "recipe.plates_queued": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const plates = m.count("plates");
      if (plates === null) return title;
      return title ? `${title}, ${plates} plates` : `${plates} plates`;
    }
    case "recipe.accepted":
    case "recipe.version_added":
    case "recipe.written_by_claude": {
      const m = stored(action, metadata);
      const title = m.text("title");
      const version = m.count("version");
      if (version === null) return title;
      return title ? `${title}, version ${version}` : `Version ${version}`;
    }
    case "camp.cycle.burn_dates_set": {
      const m = stored(action, metadata);
      const start = m.text("burnStart");
      const end = m.text("burnEnd");
      return start && end ? `${start} to ${end}` : "Dates removed";
    }
    case "join_site.section_saved": {
      const m = stored(action, metadata);
      const section = m.text("section");
      const year = m.count("year");
      return section && year !== null ? `${section}, ${year}` : section;
    }
    case "camp.cycle.renamed": {
      const m = stored(action, metadata);
      const to = m.text("to");
      return to ? `Now called "${to}"` : "Name removed";
    }
    case "camp.teams.renamed": {
      const m = stored(action, metadata);
      const label = m.text("label");
      return label ? `Now called "${label}"` : null;
    }
    case "camp.teams.moved": {
      const m = stored(action, metadata);
      const direction = m.text("direction");
      return direction === "up" || direction === "down"
        ? `Moved ${direction}`
        : null;
    }
    // A read made through the Claude connector (MCP) says so; the app's own
    // reads need no note.
    case "member.id_document.viewed":
    case "member.bank_details.viewed":
    case "safety.emergency_contacts.view":
      return stored(action, metadata).text("via") === "mcp"
        ? "Through Claude"
        : null;
    // Where the allergies were read: the daily site sheet, or a
    // questionnaire's answers (on screen or as the CSV).
    case "safety.allergies.view": {
      const m = stored(action, metadata);
      const via = m.text("via");
      const title = m.text("title");
      if (via === "daily_sheet") return "On the daily site sheet";
      if (via === "questionnaire_results" || via === "questionnaire_answers") {
        return title
          ? `In the answers to ${title}`
          : "In a questionnaire's answers";
      }
      if (via === "questionnaire_csv") {
        return title ? `In the CSV of ${title}` : "In a questionnaire's CSV";
      }
      return null;
    }
    case "member.export":
    case "member.sheet_viewed": {
      const m = stored(action, metadata);
      const rows = m.count("rows");
      return rows === null
        ? null
        : `${rows} ${rows === 1 ? "member" : "members"}`;
    }
    // The fuel cans (#255): which can on the sheet, its size and material.
    case "power.fuel_can_added":
    case "power.fuel_can_changed":
    case "power.fuel_can_removed": {
      const m = stored(action, metadata);
      const number = m.count("number");
      const size = m.count("sizeLitres");
      const material = m.text("material");
      const parts = [
        number === null ? null : `Can ${number}`,
        size === null ? null : `${size} L`,
        material,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    default:
      return null;
  }
}
