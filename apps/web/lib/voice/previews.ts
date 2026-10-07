import { formatMoney } from "@camp404/core";
import { getDocumentBySlug } from "@camp404/db/documents";
import { findInviteCodeByCode } from "@camp404/db/invite-codes";
import { listReimbursementsForReview } from "@camp404/db/reimbursements";
import { listBudgetTotals } from "@camp404/db/team-budgets";
import { getTeamMemberships } from "@camp404/db/team-memberships";
import {
  ALLERGEN_LABELS,
  ATTENDANCE_ANSWER_LABELS,
  DIET_LABELS,
  FOOD_REACTION_LABELS,
  GUIDE_CATEGORY_LABELS,
  LOGISTICS_PHASE_LABELS,
  flattenQuestions,
  questionLabel,
  type AttendanceAnswer,
  type AttendancePhase,
  type Diet,
  type FoodReaction,
  type GuideCategory,
  type InventoryCondition,
  type InventoryLocation,
  type KitchenAllergen,
  type LogisticsPhase,
  type Questionnaire,
} from "@camp404/types";
import { getInventoryItem } from "../inventory";
import { CONDITION_LABELS, LOCATION_LABELS } from "../inventory-copy";
import { getMeetingNote } from "../meeting-notes";
import { getQuestionnaireForPicker } from "../questionnaire-config";
import { recipePath } from "../recipe-copy";
import { getRecipeDetail } from "../recipes";
import { getAttendanceView, listLogisticsPhases } from "../logistics";
import type { McpScope } from "../mcp/scope";
import { ledgerCycle } from "../payments";
import { getShiftsView } from "../shifts";
import { TASK_COLUMN_LABEL, presentTask } from "../task-board";
import { listBoardTasks } from "../tasks";
import { usesTestStore } from "../test-mode";
import { readNames, readTeamLabels, readTeamPeople } from "./reads";

// What the captain is shown for each action before Do (#356, "no mistakes"
// defence 5): a sentence and a line of facts the SERVER writes from the real
// rows, never Claude's words, so Claude can pick the wrong row but cannot
// describe a row wrongly. Each preview also fills in the compare-and-set
// value the tool takes (a task's column, an attendance answer, a version)
// from what it read, so Do changes only what the captain saw.
//
// Every write tool in TOOL_CAPABILITIES has one: a test fails when a write
// has none. A preview that finds the action cannot be done says why, and the
// row shows that instead of a tick.

export interface Preview {
  sentence: string;
  facts: string;
  /**
   * What a write that replaces a whole field will leave there, one line per
   * field ("Text: …"), so the captain reads the new value before Do (owner,
   * audit 2 voice-mcp-2). Shown, never sealed: Do runs the sealed arguments.
   */
  change?: string[];
  path: string | null;
  /** The arguments to run with, compare-and-set values filled in. */
  args: Record<string, unknown>;
  /** What the action touches, so a later action on the same can wait for it. */
  keys: string[];
  /** Keys of earlier actions this one needs to have worked (default `keys`). */
  needs?: string[];
  /** It cannot be done as things stand, and why. */
  blocked?: string;
}

export interface PreviewCtx {
  scope: McpScope;
  now: Date;
}

type Args = Record<string, unknown>;
type PreviewFn = (args: Args, ctx: PreviewCtx) => Promise<Preview>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const quote = (s: string) => `“${s}”`;

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
/** "2027-04-28" as "Wed 28 Apr". */
function dayLabel(key: string | null | undefined): string {
  if (!key) return "no date";
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? key : DAY.format(d).replace(",", "");
}
function dayRange(start: string | null, end: string | null): string {
  if (!start) return "no days set";
  return start === end || !end
    ? dayLabel(start)
    : `${dayLabel(start)} – ${dayLabel(end)}`;
}

/** The longest a value is shown in a row before it is cut. */
const SHOWN_MAX = 300;

/**
 * A value as the row shows it: one line, quoted when it is words, cut after
 * SHOWN_MAX characters with how much more there is.
 */
function shown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.length === 0
      ? "(none)"
      : value.map((v) => (typeof v === "string" ? v : shown(v))).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= SHOWN_MAX) return quote(text);
  const more = text.length - SHOWN_MAX;
  return `${quote(`${text.slice(0, SHOWN_MAX).trimEnd()}…`)} (${more} more character${more === 1 ? "" : "s"})`;
}

/** A list as the row shows it, each item on its own after a bullet. */
function listed(items: readonly string[]): string {
  return items.length === 0 ? "(none)" : items.join(" · ");
}

async function personName(id: unknown): Promise<string> {
  const names = await readNames([str(id)]);
  return names.get(str(id)) ?? "someone not on the roster";
}

/** Blocked rows still need a sentence the captain can read. */
function blocked(
  sentence: string,
  reason: string,
  args: Args,
  path: string | null,
): Preview {
  return { sentence, facts: "", path, args, keys: [], blocked: reason };
}

// --- Shifts --------------------------------------------------------------------

async function findSlot(ctx: PreviewCtx, slotId: string) {
  const view = await getShiftsView({
    userId: ctx.scope.campUserId,
    rank: ctx.scope.viewerRank,
    ledTeams: ctx.scope.viewerRank === "team_lead" ? ctx.scope.leadTeams : [],
    now: ctx.now,
  });
  for (const day of view.days) {
    const slot = day.slots.find((s) => s.id === slotId);
    if (slot) return { day, slot, myCount: view.myCount };
  }
  return null;
}

const shiftPreviews: Record<string, PreviewFn> = {
  async sign_up_for_shift(args, ctx) {
    const found = await findSlot(ctx, str(args.slotId));
    if (!found) {
      return blocked(
        "Sign you up for a shift",
        "That shift slot isn't on the roster.",
        args,
        "/shifts",
      );
    }
    const { day, slot } = found;
    const what = `${slot.type.name}, ${day.label} ${slot.type.timeText}`;
    const facts = `Shifts · ${slot.type.teamLabel} · ${slot.taken} of ${slot.type.places} places taken`;
    const base = {
      sentence: `Sign you up for ${what}`,
      facts,
      path: "/shifts",
      args: { slotId: slot.id },
      keys: [`slot:${slot.id}`],
      needs: [`slot:${slot.id}`, `leave-day:${day.day}`],
    };
    if (slot.mine) return { ...base, blocked: "You are already on it." };
    if (!slot.open) return { ...base, blocked: "Its day has started." };
    return base;
  },
  async leave_shift(args, ctx) {
    const found = await findSlot(ctx, str(args.slotId));
    if (!found) {
      return blocked(
        "Take you off a shift",
        "That shift slot isn't on the roster.",
        args,
        "/shifts",
      );
    }
    const { day, slot } = found;
    const base = {
      sentence: `Take you off ${slot.type.name}, ${day.label} ${slot.type.timeText}`,
      facts: `Shifts · ${slot.type.teamLabel} · ${slot.taken} of ${slot.type.places} places taken`,
      path: "/shifts/mine",
      args: { slotId: slot.id },
      keys: [`slot:${slot.id}`, `leave-day:${day.day}`],
      needs: [`slot:${slot.id}`],
    };
    if (!slot.mine) return { ...base, blocked: "You are not on it." };
    if (!slot.open) return { ...base, blocked: "Its day has started." };
    return base;
  },
};

// --- Tasks ---------------------------------------------------------------------

const taskPreviews: Record<string, PreviewFn> = {
  async move_task(args, ctx) {
    const [tasks, labels] = await Promise.all([
      listBoardTasks(ctx.now),
      readTeamLabels(),
    ]);
    const task = tasks.find((t) => t.id === str(args.taskId));
    const to = str(args.to) as keyof typeof TASK_COLUMN_LABEL;
    if (!task) {
      return blocked(
        "Move a task",
        "That task isn't on the board.",
        args,
        "/tasks",
      );
    }
    const card = presentTask(task, {
      viewer: {
        id: ctx.scope.campUserId,
        isCaptain: ctx.scope.isCaptain,
        leadTeams:
          ctx.scope.viewerRank === "team_lead" ? ctx.scope.leadTeams : [],
      },
      now: ctx.now,
      teamLabels: labels,
    });
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Johannesburg",
    }).format(ctx.now);
    const preview: Preview = {
      sentence: `Move ${quote(task.title)} from ${TASK_COLUMN_LABEL[task.status]} to ${TASK_COLUMN_LABEL[to] ?? to}`,
      facts: `Tasks · ${card.teamLabel ?? "No team"} · as you read it at ${time}`,
      path: `/tasks?task=${task.id}`,
      args: { taskId: task.id, from: task.status, to },
      keys: [`task:${task.id}`],
    };
    if (task.status === to)
      return {
        ...preview,
        blocked: `It is already in ${TASK_COLUMN_LABEL[to]}.`,
      };
    if (!card.canMove)
      return { ...preview, blocked: "You may not move this task." };
    return preview;
  },
  async add_task(args) {
    const labels = await readTeamLabels();
    const team = str(args.team);
    const who = args.assigneeId ? await personName(args.assigneeId) : null;
    const facts = [
      "Tasks",
      team ? (labels[team] ?? team) : "No team",
      who ? `for ${who}` : "nobody responsible yet",
      args.due ? `due ${dayLabel(str(args.due))}` : "no deadline",
    ].join(" · ");
    return {
      sentence: `Add the task ${quote(str(args.title))}`,
      facts,
      path: "/tasks",
      args,
      keys: [],
    };
  },
};

// --- Logistics -------------------------------------------------------------------

const logisticsPreviews: Record<string, PreviewFn> = {
  async set_my_logistics_attendance(args, ctx) {
    const phase = str(args.phase) as AttendancePhase;
    const answer = str(args.answer) as AttendanceAnswer;
    const [view, phases] = await Promise.all([
      getAttendanceView({
        userId: ctx.scope.campUserId,
        rank: ctx.scope.viewerRank,
        cycle: await ledgerCycle(),
      }),
      listLogisticsPhases(),
    ]);
    const row = phases.find((p) => p.phase === phase);
    const now = view.mine[phase] ?? null;
    const label = LOGISTICS_PHASE_LABELS[phase] ?? phase;
    const range = dayRange(row?.startDate ?? null, row?.endDate ?? null);
    const verb =
      answer === "going"
        ? `Say you can help on ${label}`
        : answer === "maybe"
          ? `Say you might help on ${label}`
          : `Say you can't help on ${label}`;
    return {
      sentence: `${verb}, ${range}`,
      facts: `Logistics · your answer now: ${now ? ATTENDANCE_ANSWER_LABELS[now].toLowerCase() : "not answered"}`,
      path: "/logistics",
      args: { phase, answer, expected: now },
      keys: [`phase:${phase}`],
      ...(now === answer ? { blocked: "That is already your answer." } : {}),
    };
  },
  async set_logistics_days(args) {
    const phase = str(args.phase) as LogisticsPhase;
    const rows = await listLogisticsPhases();
    const row = rows.find((p) => p.phase === phase);
    const label = LOGISTICS_PHASE_LABELS[phase] ?? phase;
    const place = str(args.place);
    return {
      sentence: `Set ${label} to ${dayRange(str(args.startDate), str(args.endDate))}${place ? ` at ${place}` : ""}`,
      facts: `Logistics · now ${dayRange(row?.startDate ?? null, row?.endDate ?? null)} · This moves the camp calendar and the meal plan's prep`,
      ...(args.note !== undefined
        ? { change: [`Note: ${shown(args.note)}`] }
        : {}),
      path: "/logistics",
      args: { ...args, expectedVersion: row?.version ?? 0 },
      keys: [`days:${phase}`],
    };
  },
};

// --- Claims ----------------------------------------------------------------------

async function claimPreview(
  args: Args,
  ctx: PreviewCtx,
  decision: "approved" | "rejected",
): Promise<Preview> {
  const id = str(args.id);
  const [claim] = usesTestStore()
    ? []
    : await listReimbursementsForReview({ id });
  const verb = decision === "approved" ? "Approve" : "Turn down";
  if (!claim) {
    return blocked(
      `${verb} a claim`,
      "That claim isn't one you can see.",
      args,
      "/captains/payments/claims",
    );
  }
  const amount = formatMoney(claim.amountCents);
  const labels = await readTeamLabels();
  const team = claim.team ? (labels[claim.team] ?? claim.team) : "No team";
  const who = claim.submitterName ?? "Unnamed member";
  const facts: string[] = [
    `Waiting since ${dayLabel(claim.createdAt.toISOString().slice(0, 10))}`,
  ];
  if (claim.team && decision === "approved") {
    const totals = (await listBudgetTotals(claim.cycle))[claim.team];
    if (totals?.budgetCents != null) {
      facts.push(
        `${team} budget left after this: ${formatMoney(totals.budgetCents - totals.spentCents - claim.amountCents)}`,
      );
    } else {
      facts.push(`${team} has no budget set`);
    }
  }
  facts.push(
    claim.receiptCount > 0
      ? `${claim.receiptCount} receipt${claim.receiptCount === 1 ? "" : "s"} on the page`
      : "No receipt on the page",
  );
  const preview: Preview = {
    sentence: `${verb} ${who}'s claim ${quote(claim.description)}, ${amount}, ${team}`,
    facts: facts.join(" · "),
    path: "/captains/payments/claims",
    args: { id },
    keys: [`claim:${id}`],
  };
  if (claim.status !== "submitted") {
    return {
      ...preview,
      blocked: `It is no longer waiting (${claim.status}).`,
    };
  }
  if (claim.submitterId === ctx.scope.campUserId) {
    return { ...preview, blocked: "Nobody decides their own claim." };
  }
  return preview;
}

const claimPreviews: Record<string, PreviewFn> = {
  approve_reimbursement: (args, ctx) => claimPreview(args, ctx, "approved"),
  reject_reimbursement: (args, ctx) => claimPreview(args, ctx, "rejected"),
};

// --- Teams and leads -------------------------------------------------------------

async function membershipsOf(userId: string) {
  if (usesTestStore()) {
    const { testStore } = await import("../test-store");
    return testStore.getTeamMemberships(userId as never);
  }
  return getTeamMemberships(userId);
}

async function teamFacts(userId: string, team: string) {
  const [labels, mine, people, name] = await Promise.all([
    readTeamLabels(),
    membershipsOf(userId),
    readTeamPeople(team),
    personName(userId),
  ]);
  const label = labels[team] ?? team;
  const others = mine
    .filter((m) => m.team !== team)
    .map((m) => labels[m.team] ?? m.team);
  const membership = mine.find((m) => m.team === team) ?? null;
  const leads = people.filter((p) => p.isLead).map((p) => p.displayName);
  return { label, others, membership, people, leads, name };
}

const teamPreviews: Record<string, PreviewFn> = {
  async assign_team_membership(args) {
    const userId = str(args.userId);
    const team = str(args.team);
    const f = await teamFacts(userId, team);
    const onIt = !!f.membership;
    return {
      sentence: `Put ${f.name} on ${f.label} for this year`,
      facts: [
        f.others.length > 0
          ? `Also on: ${f.others.join(", ")}`
          : "On no other team",
        `${f.label} will have ${f.people.length + (onIt ? 0 : 1)} members`,
      ].join(" · "),
      path: "/captains/camp-management",
      args: { userId, team },
      keys: [`member:${userId}:${team}`],
      ...(onIt ? { blocked: `${f.name} is already on ${f.label}.` } : {}),
    };
  },
  async remove_team_membership(args) {
    const userId = str(args.userId);
    const team = str(args.team);
    const f = await teamFacts(userId, team);
    return {
      sentence: `Take ${f.name} off ${f.label} for this year`,
      facts: [
        f.membership?.isLead
          ? `${f.name} leads ${f.label} now`
          : `Not a lead of ${f.label}`,
        f.others.length > 0
          ? `Still on: ${f.others.join(", ")}`
          : "On no other team after this",
      ].join(" · "),
      path: "/captains/camp-management",
      args: { userId, team },
      keys: [`member:${userId}:${team}`],
      ...(f.membership ? {} : { blocked: `${f.name} is not on ${f.label}.` }),
    };
  },
  async set_team_lead(args) {
    const userId = str(args.userId);
    const team = str(args.team);
    const isLead = args.isLead === true;
    const f = await teamFacts(userId, team);
    const sentence = isLead
      ? `Make ${f.name} a lead of ${f.label} for this year`
      : `Stop ${f.name} leading ${f.label}`;
    const facts = [
      `Leads now: ${f.leads.length > 0 ? f.leads.join(", ") : "none"}`,
      isLead
        ? "Leading any team gives team-lead clearance across the app"
        : "They stay on the team",
    ].join(" · ");
    const base = {
      sentence,
      facts,
      path: "/captains/camp-management",
      args: { userId, team, isLead },
      keys: [`member:${userId}:${team}`],
    };
    // Not on the team yet: fine when an earlier action on this list puts
    // them on it; the run then refuses in the tool's own words if not.
    if (f.membership && f.membership.isLead === isLead) {
      return {
        ...base,
        blocked: isLead
          ? `${f.name} already leads ${f.label}.`
          : `${f.name} does not lead ${f.label}.`,
      };
    }
    return base;
  },
};

/** A duty card's parts, as the rows show a card that replaces the old one. */
function cardLines(card: Args): string[] {
  const lines = (v: unknown) =>
    Array.isArray(v) ? listed(v.map((x) => shown(x))) : "(none)";
  const roles = Array.isArray(card.subRoles)
    ? (card.subRoles as Args[]).map(
        (r) => `${str(r.name)} (${String(r.min)}–${String(r.max)})`,
      )
    : [];
  return [
    `Card roles: ${listed(roles)}`,
    `Card steps: ${lines(card.steps)}`,
    `Card hard rules: ${lines(card.hardRules)}`,
    `Card checklist: ${lines(card.checklist)}`,
    `Card ask: ${shown(card.askRole)}`,
  ];
}

// --- Everything else: plain sentences from the arguments ------------------------

const otherPreviews: Record<string, PreviewFn> = {
  async add_inventory_item(args) {
    const labels = await readTeamLabels();
    const team = str(args.team);
    return {
      sentence: `Add ${args.quantity} × ${quote(str(args.name))} to ${labels[team] ?? team}'s gear`,
      facts: `Inventory · ${str(args.category)} · ${str(args.condition) || "good"} · ${str(args.location)}${args.storageLocation ? ` · ${str(args.storageLocation)}` : ""}`,
      path: "/inventory",
      args,
      keys: [],
    };
  },
  async propose_inventory_change(args) {
    const item = await getInventoryItem(str(args.itemId));
    if (!item) {
      return blocked(
        "Suggest a change to a gear item",
        "That gear item isn't in the inventory.",
        args,
        "/inventory",
      );
    }
    const condition = str(args.condition) as InventoryCondition;
    const location = str(args.location) as InventoryLocation;
    const unit = item.unit ? ` ${item.unit}` : "";
    const custodian =
      location === "custodian_home" && args.custodianUserId
        ? await personName(args.custodianUserId)
        : null;
    const parts = [
      typeof args.quantity === "number"
        ? `count ${args.quantity}${unit}`
        : null,
      CONDITION_LABELS[condition]?.toLowerCase() ?? null,
      custodian
        ? `at ${custodian}'s home`
        : (LOCATION_LABELS[location]?.toLowerCase() ?? null),
      str(args.storageLocation) || null,
      args.maintenanceDone === true ? "maintenance done" : null,
    ].filter(Boolean);
    return {
      sentence: `Suggest a change to ${quote(item.name)}: ${parts.join(", ") || "no change given"}`,
      facts: `Inventory · now ${item.quantity}${unit}, ${CONDITION_LABELS[item.condition].toLowerCase()}, ${LOCATION_LABELS[item.location].toLowerCase()} · a lead of its team or a captain approves it on the page`,
      ...(args.note ? { change: [`Note: ${shown(args.note)}`] } : {}),
      path: "/inventory",
      args,
      keys: [`item:${item.id}`],
    };
  },
  async revoke_invite_code(args) {
    const code = str(args.code);
    const row = usesTestStore()
      ? null
      : await findInviteCodeByCode(code.trim().toUpperCase());
    return {
      sentence: `Revoke the invite code ${code}`,
      facts: row
        ? `Invites · used ${row.useCount}${row.maxUses ? ` of ${row.maxUses}` : ""} times${row.note ? ` · ${row.note}` : ""} · people who joined keep their place`
        : "Invites · people who joined keep their place",
      path: "/tools/invite",
      args,
      keys: [`code:${code}`],
      ...(row?.revokedAt ? { blocked: "That code is already revoked." } : {}),
    };
  },
  async mark_all_notifications_read() {
    return {
      sentence: "Mark all your notifications read",
      facts: "Inbox · pop-ups not shown yet stay",
      path: "/notifications",
      args: {},
      keys: ["inbox"],
    };
  },
  async mark_notifications_read(args) {
    const n = Array.isArray(args.ids) ? args.ids.length : 0;
    return {
      sentence: `Mark ${n} notification${n === 1 ? "" : "s"} read`,
      facts: "Inbox",
      path: "/notifications",
      args,
      keys: ["inbox"],
    };
  },
  async request_lift(args) {
    const driver = args.driverUserId
      ? await personName(args.driverUserId)
      : null;
    return {
      sentence: driver
        ? `Ask ${driver} for a seat in their car`
        : "Ask for a seat in any car",
      facts: "Transport · the driver answers on the page",
      path: "/transport",
      args: { driverUserId: args.driverUserId ?? null },
      keys: ["lift"],
    };
  },
  async cancel_lift_request() {
    return {
      sentence: "Withdraw your lift request",
      facts: "Transport",
      path: "/transport",
      args: {},
      keys: ["lift"],
    };
  },
  async add_car_rider(args, ctx) {
    const [member, driver] = await Promise.all([
      personName(args.memberUserId),
      args.driverUserId ? personName(args.driverUserId) : Promise.resolve(null),
    ]);
    return {
      sentence: `Put ${member} in ${driver && args.driverUserId !== ctx.scope.campUserId ? `${driver}'s car` : "your car"}`,
      facts: "Transport",
      path: "/transport",
      args,
      keys: [`rider:${str(args.memberUserId)}`],
    };
  },
  async remove_car_rider(args, ctx) {
    if (!args.memberUserId || args.memberUserId === ctx.scope.campUserId) {
      return {
        sentence: "Leave the car you ride in",
        facts: "Transport",
        path: "/transport",
        args,
        keys: ["rider:me"],
      };
    }
    const [member, driver] = await Promise.all([
      personName(args.memberUserId),
      args.driverUserId ? personName(args.driverUserId) : Promise.resolve(null),
    ]);
    return {
      sentence: `Take ${member} out of ${driver ? `${driver}'s car` : "your car"}`,
      facts: "Transport",
      path: "/transport",
      args,
      keys: [`rider:${str(args.memberUserId)}`],
    };
  },
  async update_meeting_notes(args) {
    const note = await getMeetingNote(str(args.meetingId));
    if (!note)
      return blocked(
        "Change a meeting's notes",
        "That meeting isn't there.",
        args,
        "/meetings",
      );
    const fields = ["title", "agenda", "notes", "decisions"].filter(
      (k) => args[k] !== undefined,
    );
    const label: Record<string, string> = {
      title: "Title",
      agenda: "Agenda",
      notes: "Notes",
      decisions: "Decisions (the whole list)",
    };
    return {
      sentence: `Change the ${fields.join(", ") || "notes"} of ${quote(note.title)}`,
      facts: `Meetings · ${dayLabel(note.heldAt.toISOString().slice(0, 10))} · as you read it`,
      change: fields.map((k) =>
        k === "decisions" && Array.isArray(args.decisions)
          ? `${label[k]}: ${listed(args.decisions.map((d) => shown(d)))}`
          : `${label[k]}: ${shown(args[k])}`,
      ),
      path: `/meetings/${note.id}`,
      args: { ...args, expectedVersion: note.version },
      keys: [`meeting:${note.id}`],
    };
  },
  async create_document(args) {
    return {
      sentence: `Start a draft ${str(args.kind) === "duty_card" ? "duty card" : "chapter"} ${quote(str(args.title))}`,
      facts: `Survival Guide · ${str(args.category)} · a draft until it is published`,
      path: "/guide",
      args,
      keys: [],
    };
  },
  async update_document(args) {
    const doc = usesTestStore()
      ? null
      : await getDocumentBySlug(str(args.slug));
    if (!doc && !usesTestStore())
      return blocked(
        "Change a guide draft",
        "No chapter with that slug.",
        args,
        "/guide",
      );
    const labels = await readTeamLabels();
    const change: string[] = [];
    if (args.title !== undefined) change.push(`Title: ${shown(args.title)}`);
    if (args.category !== undefined) {
      const category = str(args.category) as GuideCategory;
      change.push(`Topic: ${GUIDE_CATEGORY_LABELS[category] ?? category}`);
    }
    if (args.team !== undefined) {
      change.push(
        `Team: ${args.team === null ? "no team" : (labels[str(args.team)] ?? str(args.team))}`,
      );
    }
    if (args.markdown !== undefined) {
      change.push(`Text (the whole chapter): ${shown(args.markdown)}`);
    }
    if (args.card && typeof args.card === "object") {
      change.push(...cardLines(args.card as Args));
    }
    return {
      sentence: `Change the draft of ${quote(doc?.title ?? str(args.slug))}`,
      facts: "Survival Guide · as you read it",
      change,
      path: "/guide",
      args: { ...args, expectedVersion: doc?.version ?? args.expectedVersion },
      keys: [`doc:${str(args.slug)}`],
    };
  },
  async publish_document(args) {
    const doc = usesTestStore()
      ? null
      : await getDocumentBySlug(str(args.slug));
    if (!doc && !usesTestStore())
      return blocked(
        "Publish a guide chapter",
        "No chapter with that slug.",
        args,
        "/guide",
      );
    const title = quote(doc?.title ?? str(args.slug));
    return {
      sentence: args.published
        ? `Publish ${title} for members`
        : `Take ${title} off the guide`,
      facts: "Survival Guide · the version you read",
      path: "/guide",
      args: args.published
        ? { ...args, expectedVersion: doc?.version ?? args.expectedVersion }
        : args,
      keys: [`doc:${str(args.slug)}`],
    };
  },
  async create_questionnaire_draft(args) {
    return {
      sentence: `Draft a questionnaire ${quote(str(args.title))}`,
      facts: "Questionnaires · a draft: sending it stays on the page",
      path: "/captains/questionnaires",
      args,
      keys: [],
    };
  },
  async update_questionnaire_draft(args) {
    const definition = args.definition as Questionnaire | undefined;
    let questions: string[];
    try {
      questions = definition
        ? flattenQuestions(definition).map((q) => questionLabel(q))
        : [];
    } catch {
      // Not a definition the tool would take: the tool refuses it on Do.
      questions = [];
    }
    return {
      sentence: `Replace the questions of the draft ${quote(str(args.key))}`,
      facts: "Questionnaires · a draft: sending it stays on the page",
      change: [
        `Title: ${shown(definition?.title)}`,
        `Questions (${questions.length}): ${listed(questions.map((q) => shown(q)))}`,
      ],
      path: "/captains/questionnaires",
      args,
      keys: [`questionnaire:${str(args.key)}`],
    };
  },
  async submit_recipe(args) {
    return {
      sentence: `Suggest a recipe${args.title ? ` ${quote(str(args.title))}` : ""} to the Kitchen`,
      facts: "Kitchen · a Kitchen lead or a captain reviews it on the page",
      path: "/kitchen/recipes",
      args,
      keys: [],
    };
  },
  async add_recipe_lesson(args) {
    const recipe = await getRecipeDetail(str(args.recipeId));
    if (!recipe) {
      return blocked(
        "Add a cook's note to a recipe",
        "That recipe isn't in the book.",
        args,
        "/kitchen/recipes",
      );
    }
    const preview: Preview = {
      sentence: `Add a cook's note to ${quote(recipe.title)}: ${quote(str(args.body))}`,
      facts: "Kitchen",
      path: recipePath(recipe.id),
      args,
      keys: [],
    };
    return recipe.acceptedVersionId
      ? preview
      : {
          ...preview,
          blocked: "It is not in the book yet, so it has no version to note.",
        };
  },
  async update_my_burner_profile(args) {
    const responses = (args.responses as Args) ?? {};
    const keys = Object.keys(responses);
    const questions = new Map(
      flattenQuestions(await getQuestionnaireForPicker()).map((q) => [
        q.id,
        questionLabel(q),
      ]),
    );
    const name = (key: string) => questions.get(key) ?? key;
    return {
      sentence: `Change your burner profile: ${keys.map(name).join(", ")}`,
      facts: "Your profile",
      change: keys.map((k) => `${name(k)}: ${shown(responses[k])}`),
      path: "/profile",
      args,
      keys: ["me:burner"],
    };
  },
  async update_my_dietary_requirements(args) {
    const foods = Array.isArray(args.foods) ? args.foods.length : 0;
    const diets = Array.isArray(args.diets) ? args.diets.join(", ") : "";
    const picked = Array.isArray(args.foods)
      ? (args.foods as { food?: string; reaction?: string }[]).map(
          (f) =>
            `${ALLERGEN_LABELS[f.food as KitchenAllergen] ?? f.food} (${(
              FOOD_REACTION_LABELS[f.reaction as FoodReaction] ??
              f.reaction ??
              ""
            ).toLowerCase()})`,
        )
      : [];
    const dietNames = Array.isArray(args.diets)
      ? (args.diets as string[]).map((d) => DIET_LABELS[d as Diet] ?? d)
      : [];
    return {
      sentence: `Replace your dietary pick-list: ${foods} food${foods === 1 ? "" : "s"}${diets ? `, diets ${diets}` : ""}`,
      facts: "Your profile · the Kitchen's allergy check reads it",
      change: [`Foods: ${listed(picked)}`, `Diets: ${listed(dietNames)}`],
      path: "/profile",
      args,
      keys: ["me:dietary"],
    };
  },
  async update_my_driver_profile(args) {
    return {
      sentence: args.intendsToDrive
        ? "Update your driver profile: you are driving"
        : "Update your driver profile: you are not driving",
      facts: "Transport · this year",
      path: "/transport",
      args,
      keys: ["me:driver"],
    };
  },
  async update_my_emergency_contacts(args) {
    const n = Array.isArray(args.contacts) ? args.contacts.length : 0;
    const contacts = Array.isArray(args.contacts)
      ? (args.contacts as Args[]).map(
          (c) => `${str(c.name)}, ${str(c.relationship)}, ${str(c.phone)}`,
        )
      : [];
    return {
      sentence: `Replace your emergency contacts with ${n} contact${n === 1 ? "" : "s"}`,
      facts: "Your profile",
      change: [`Contacts: ${listed(contacts)}`],
      path: "/profile",
      args,
      keys: ["me:contacts"],
    };
  },
  async update_my_history(args) {
    const label: Record<string, string> = {
      skills: "Skills (the whole list)",
      previousAfrikaburns: "AfrikaBurns before",
      previousBurningMans: "Burning Mans before",
      firstTime: "First time",
    };
    const keys = Object.keys(args).filter((k) => args[k] !== undefined);
    const parts = keys.join(", ");
    return {
      sentence: `Change your burn history: ${parts}`,
      facts: "Your profile",
      change: keys.map((k) => `${label[k] ?? k}: ${shown(args[k])}`),
      path: "/profile",
      args,
      keys: ["me:history"],
    };
  },
};

/** The preview for each write tool. */
export const PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  ...shiftPreviews,
  ...taskPreviews,
  ...logisticsPreviews,
  ...claimPreviews,
  ...teamPreviews,
  ...otherPreviews,
};

/**
 * The sentence the run shows for a done action, from the tool's own result
 * where it says more ("3 shifts this year").
 */
export function doneDetail(tool: string, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (
    (tool === "sign_up_for_shift" || tool === "leave_shift") &&
    typeof d.myCount === "number"
  ) {
    return `${d.myCount} shift${d.myCount === 1 ? "" : "s"} this year.`;
  }
  if (tool === "mark_all_notifications_read" && typeof d.marked === "number") {
    return `${d.marked} marked read.`;
  }
  return null;
}
