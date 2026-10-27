// What each audit action's row carries in `metadata`, as its writers write it.
//
// `writeAuditEvent` in @camp404/db takes `AuditEvents[action]`, so a writer
// with a wrong or a missing key does not compile, and `auditDetail` reads only
// keys named here (or in `OlderAuditRows`), so a reader cannot look for a key
// no writer sends. A new action is a label in `AUDIT_ACTION_LABELS` and a shape
// here.
//
// The types guide; they do not vouch for a stored row. A row keeps the JSON it
// was written with, so the reader still checks every value at runtime.

import type { AuditAction } from "./audit-actions";

/** An action with no metadata. */
type Nothing = Record<never, never>;

/** An action no code writes any more: a writer for it does not compile. */
type Retired = never;

/** What is said of a fuel can, added, changed or removed. */
interface FuelCan {
  cycle: number;
  number: number;
  sizeLitres: number;
  material: string | null;
  ownerUserId: string | null;
  travelsWithUserId: string | null;
}

interface CalendarEvent {
  title: string;
  team: string | null;
  kind: string;
  date: string;
  allDay: boolean;
  /** Who it is for; rows written before 2026-10-27 have none. */
  audience?: string;
}

interface RentalItem {
  cycle: number;
  name: string;
  campPriceCents: number | null;
  campStockCount: number | null;
  supplierPriceCents: number | null;
  reserveCount: number;
  reserveSource: string | null;
}

interface ShiftType {
  cycle: number;
  name: string;
  team: string;
  startMinute: number;
  durationMinutes: number;
  places: number;
  dutyCardId: string | null;
  dutyCardPickedUp?: true;
  daysAdded: number;
}

/** A meal's place in the year's meal plan. */
interface MenuMeal {
  cycle: number;
  day: number;
  meal: string;
  recipeId: string;
  title: string;
}

interface MemberCar {
  driverUserId: string | null;
  cycle: number;
}

interface TeamRole {
  team: string;
  cycle: number;
  roleId: string;
  name: string;
}

interface RecipeRun {
  title: string;
  runId: string;
  plates: number;
  promptVersion: string;
  model: string;
}

interface RecipeVersion {
  title: string;
  version: number;
  runId: string;
}

interface Asked {
  cycle: number;
  asked: number;
  notified: number;
}

interface Titled {
  title: string;
}

interface SensitiveRead {
  basis: string;
}

export interface AuditEvents {
  "account.sanitized": { lostCatNumber: number };
  "announcement.pinned": { scope: string; team: string | null };
  "announcement.unpinned": { scope: string; team: string | null };
  "calendar.event_created": CalendarEvent;
  "calendar.event_changed": CalendarEvent & {
    fromTeam?: string | null;
    fromAudience?: string;
  };
  "calendar.event_removed": CalendarEvent;
  "car.rider_added": MemberCar;
  "car.rider_removed": MemberCar;
  "car.lift_request_declined": MemberCar;
  "car.seats_set": { cycle: number; from: number | null; to: number };
  /** The whole rollover plan and what was done; read by nobody but a person. */
  "camp.cycle.advanced": {
    from: unknown;
    to: unknown;
    reGate: unknown;
    carriesOver: unknown;
    notSent: unknown;
    reGated: unknown;
    duesCleared: unknown;
    announcementBroadcastId: string | null;
  };
  "camp.cycle.founded": {
    year: number;
    activationsStamped: number;
    responsesStamped: number;
    teamMembershipsStamped: number;
    driverProfilesStamped: number;
    carSeatsStamped: number;
    teamBudgetsStamped: number;
    adopteesStamped: number;
    participationsStamped: number;
    trailersStamped: number;
    liftRequestsStamped: number;
    ticketsStamped: number;
  };
  "camp.cycle.renamed": { from: string | null; to: string | null };
  "camp.cycle.burn_dates_set": {
    burnStart: string | null;
    burnEnd: string | null;
  };
  "camp.kitchen_meal_plan.changed": {
    cycle: number;
    version: number;
    daysOnSite: unknown;
    firstDay: unknown;
    before: { days: unknown };
    after: { days: unknown };
  };
  "camp.kitchen_menu.added": MenuMeal;
  "camp.kitchen_menu.removed": MenuMeal;
  "camp.kitchen_snack.added": {
    cycle: number;
    snackId: string;
    name: string;
    amount: string | null;
  };
  "camp.kitchen_snack.removed": {
    cycle: number;
    snackId: string;
    name: string;
    amount: string | null;
  };
  "camp.kitchen_price.set": {
    cycle: number;
    key: string;
    shop: string | null;
    amountCents: number | null;
    kind: string | null;
    from: {
      shop: string | null;
      amountCents: number | null;
      kind: string | null;
    } | null;
  };
  "camp.kitchen_allergens.corrected": {
    recipeId: string;
    versionId: string;
    title: string;
    allergens: unknown;
    from: unknown;
  };
  "camp.kitchen_allergen_plan.recorded": MenuMeal & {
    kind: string;
    allergens: unknown;
    details: unknown;
  };
  "camp.kitchen_prep.added": MenuMeal & {
    what: string;
    when: unknown;
    due: string;
    taskId: string | null;
  };
  "camp.kitchen_prep.removed": {
    cycle: number;
    menuItemId: string;
    what: string;
    dueDate: string;
    taskId: string | null;
  };
  "camp.kitchen_prep.redated": {
    cycle: number;
    from: string;
    to: string;
    shift: number;
    steps: number;
    tasks: number;
  };
  "camp.kitchen_settings.changed": Retired;
  "camp.layout.shared": { cycle: number; replaced: boolean };
  "camp.layout.unshared": { cycle: number };
  "camp.teams.archived": Nothing;
  "camp.teams.described": { description: string | null };
  "camp.teams.moved": { direction: "up" | "down" };
  "camp.teams.renamed": { label: string };
  "camp.teams.unarchived": Nothing;
  "document.created": { title: string; team: string | null; kind: string };
  "dues.charge_added": {
    cycle: number;
    kind: string;
    description: string;
    amountCents: number;
  };
  "dues.charge_cancelled": {
    cycle: number;
    description: string;
    amountCents: number;
  };
  "dues.fee_charged": {
    cycle: number;
    description: string;
    amountCents: number;
  };
  "dues.fee_set": { cycle: number; amountCents: number; concession: boolean };
  "dues.plan_set": { cycle: number; instalments: number; totalCents: number };
  "dues.settle_up_published": {
    cycle: number;
    description: string;
    totalCents: number;
    members: number;
    skipConcessions: boolean;
  };
  "dues.tier_added": { cycle: number; label: string; amountCents: number };
  "dues.tier_archived": { cycle: number; label: string };
  "dues.tier_changed": { cycle: number; label: string; amountCents: number };
  "dues.year_saved": {
    cycle: number;
    deadline: string | null;
    fullRefundUntil: string | null;
    partialRefundUntil: string | null;
    partialRefundPct: number | null;
  };
  "guide.section_public_set": {
    category: string;
    public: boolean;
    chapters: readonly { slug: string; title: string }[];
  };
  "document.public_set": Retired;
  "document.members_only_set": { title: string; membersOnly: boolean };
  "document.published": {
    title: string;
    version: number;
    newVersion: boolean;
    public: boolean;
    membersOnlyParts: number;
  };
  "document.reviewed": { title: string; cycle: number };
  "document.unpublished": Titled;
  "document.updated": {
    title: string;
    authorId: string | null;
    fields: readonly string[];
  };
  "inventory.booking_cancelled": {
    item: string;
    team: string | null;
    itemId: string;
  };
  "inventory.change_approved": {
    item: string;
    team: string | null;
    updateId: string;
    proposedBy: string | null;
  };
  "inventory.change_rejected": {
    item: string;
    team: string | null;
    updateId: string;
    proposedBy: string | null;
  };
  "invite.revoked": { useCount: number };
  "join_site.section_saved": { section: string; year: number };
  "logistics.attendance_asked": Asked;
  "logistics.deadline_added":
    | { cycle: number; title: string; dueDate: string | null }
    | {
        cycle: number;
        kind: string;
        title: string;
        dueDate: string | null;
        skipped: boolean;
        done?: boolean;
      };
  "logistics.deadline_changed":
    | {
        cycle: number;
        title: string;
        dueDate: string | null;
        done?: boolean;
      }
    | {
        cycle: number;
        kind: string;
        title: string;
        dueDate: string | null;
        skipped: boolean;
        done?: boolean;
      };
  "logistics.deadline_done": { cycle: number; title: string; done: boolean };
  "logistics.deadline_removed": {
    cycle: number;
    title: string;
    dueDate: string | null;
  };
  "logistics.phase_cleared": { cycle: number; phase: string };
  "logistics.phase_set": {
    cycle: number;
    phase: string;
    startDate: string;
    endDate: string;
  };
  "lounge.music_policy_changed": { cycle: number; cleared: boolean };
  "lounge.offer_decided": {
    from: string;
    to: string;
    title: string;
    cycle: number;
    withReason: boolean;
    unplaced?: number;
  };
  "lounge.offer_placed": {
    title: string;
    day: number;
    startMinute: number;
    cycle: number;
  };
  "lounge.slot_removed": { title: string | null; day: number; cycle: number };
  "member.approval_decided": {
    from: string;
    status: string;
    withReason: boolean;
  };
  "member.bank_details.viewed": Retired;
  "member.export": {
    rank: string;
    columns: readonly string[];
    rows: number;
  };
  "member.id_document.viewed": SensitiveRead & { idType: string | null };
  "member.note_added": { length: number };
  "member.notes.viewed": { count: number };
  "member.rank_changed": {
    from: string | null;
    to: string;
    via: "captain_promotion";
    requestId: string;
    requestedByUserId: string | null;
  };
  "member.sheet_viewed": { columns: readonly string[]; rows: number };
  "member.team_assigned": { team: string; cycle: number };
  "member.team_lead_set": { team: string; cycle: number; isLead: boolean };
  "member.team_removed":
    | { team: string; cycle: number; wasLead: boolean; rolesTaken: number }
    | {
        team: string;
        cycle: number | null;
        wasLead: boolean;
        because: "rejected";
      };
  "participation.decided": { cycle: number; from: string; to: string };
  "participation.withdrawn": { cycle: number; from: string };
  "payment.recorded": {
    reference: string;
    cycle: number;
    amountCents: number;
    currency: string;
    status: string;
    source: string;
  };
  "pet.hint_changed": { name: string };
  "pet.line_changed": { name: string };
  "pet.marked_in": { name: string; moduleKey: string };
  "pet.owner_set": { name: string; ownerId: string | null };
  "power.fuel_can_added": FuelCan;
  "power.fuel_can_changed": FuelCan;
  "power.fuel_can_removed": FuelCan;
  "payment.status_changed": { reference: string; from: string; to: string };
  "payment.proof_viewed": { reference: string };
  "report_screenshot.deleted": {
    screenshotId: string;
    issueNumber: number | null;
  };
  "report_screenshot.viewed": {
    screenshotId: string;
    issueNumber: number | null;
    view: string;
  };
  "payment.refund_declined": { reference: string | null; cycle: number };
  "payment.refund_requested": {
    reference: string;
    cycle: number;
    amountCents: number;
    proposedCents: number | null;
  };
  "payment.refunded": {
    reference: string | null;
    cycle: number;
    amountCents: number;
  };
  "questionnaire.anonymous_results_set": { title: string; anonymous: boolean };
  "questionnaire.carry_over_set": { title: string; carryOver: boolean };
  "questionnaire.send_closed": { key: string; title: string };
  "questionnaire.unpublished": { title: string; closedSends: number };
  "recipe.accepted": RecipeVersion;
  "recipe.adjust_queued": RecipeRun & { fromVersion: number };
  "recipe.approved": Titled;
  "recipe.changes_requested": { title: string; note: string };
  "recipe.proofread_queued": RecipeRun & { sourceVersion: number };
  "recipe.questions_answered": {
    title: string;
    runId: string;
    answeredRunId: string;
    round: number;
  };
  "recipe.plates_queued": RecipeRun & { version: number; rerun: boolean };
  "recipe.rejected": { title: string; reason: string };
  "recipe.renamed": { title: string; from: string | null };
  "recipe.rerun_requested": { title: string; note: string | null };
  "recipe.source_saved": { title: string; version: number };
  "recipe.text_retyped": Titled;
  "recipe.variation_started": Retired;
  "recipe.version_added": Retired;
  "recipe.written_by_claude": RecipeVersion;
  "reimbursement.account_viewed": {
    reimbursementId: string;
    team: string | null;
  };
  "reimbursement.receipt_viewed": {
    reimbursementId: string;
    team: string | null;
  };
  "reimbursement.status_changed": {
    reimbursementId: string;
    from: string;
    to: string;
    team: string | null;
    amountCents: number;
    currency: "ZAR";
  };
  "rental.item_added": RentalItem;
  "rental.item_archived": { cycle: number; name: string };
  "rental.item_changed": RentalItem;
  "rental.order_confirmed": {
    cycle: number;
    orderId: string;
    totalCents: number;
    fromCamp: number;
    fromSupplier: number;
  };
  "rental.order_filled": {
    cycle: number;
    orderId: string;
    tent: string | null;
    lines: number;
  };
  "rental.order_reopened": {
    cycle: number;
    orderId: string;
    totalCents: number | null;
  };
  "rental.orders_asked": Asked;
  "rental.tent_labelled": { cycle: number; name: string; label: string | null };
  "safety.allergies.view":
    | { via: "daily_sheet"; day: string }
    | {
        via:
          | "questionnaire_results"
          | "questionnaire_answers"
          | "questionnaire_csv";
        questionnaire: string;
        title: string;
        cycle: number;
      };
  "safety.emergency_contacts.view": SensitiveRead & { via?: "mcp" };
  "shifts.asked": Asked;
  "shifts.days_added": { cycle: number; name: string; daysAdded: number };
  "shifts.member_placed": {
    cycle: number;
    slotId: string;
    name: string;
    day: string;
  };
  // `because` is set when the member came off with a rejected or re-opened
  // sign-up. Rows written before 2026-10-19 for that case have no name or day.
  "shifts.member_removed": {
    cycle: number;
    slotId: string;
    name: string;
    day: string;
    because?: string;
  };
  "shifts.slot_needed_set": {
    cycle: number;
    name: string;
    day: string;
    needed: boolean;
  };
  "shifts.type_added": ShiftType;
  "shifts.type_changed": ShiftType;
  "shifts.type_removed": { cycle: number; name: string; team: string };
  "team.program_changed": {
    team: string;
    version: number;
    description: string | null;
  };
  "team.role_added": {
    team: string;
    cycle: number;
    name: string;
    places: number;
  };
  "team.role_changed": {
    team: string;
    cycle: number;
    name: string;
    places: number;
    was: { name: string; places: number };
  };
  "team.role_removed": { team: string; cycle: number; name: string };
  "team.roles_copied": {
    team: string;
    cycle: number;
    from: number;
    copied: number;
  };
  "team.lead_places_set": {
    team: string;
    cycle: number;
    places: number;
    was: number;
  };
  "team.role_given": TeamRole;
  "team.role_taken": TeamRole;
  "team_budget.set": {
    team: string;
    cycle: number;
    amountCents: number | null;
    fromCents: number | null;
  };
  "telegram.chat_added": {
    chatId: string;
    threadId: string | null;
    title: string;
  };
  "telegram.chat_removed": { chatId: string; title: string };
  "telegram.questionnaire_posted": {
    activationId: string;
    title: string;
    places: number;
    tagged: number;
    messaged: number;
  };
  "telegram.lead_posted": { team: string; cycle: number; places: number };
  "telegram.posts_set": {
    announcements: boolean;
    reminders: boolean;
    meetings: boolean;
  };
  "ticket.pass_changed": {
    cycle: number;
    pass: string;
    from: string;
    to: string;
  };
}

/**
 * Keys that rows written before today's writers still hold, for the actions
 * whose reader reads them. No writer may write these; only the reader names
 * them.
 */
export interface OlderAuditRows {
  "document.public_set": { title: string; public: boolean };
  "member.bank_details.viewed": { via: "mcp" };
  /** The Claude connector read ID numbers until #353. */
  "member.id_document.viewed": { via: "mcp" };
  "recipe.variation_started": Titled;
  "recipe.version_added": { title: string; version: number };
  /** Claims before #242 kept a decimal amount, not whole cents. */
  "reimbursement.status_changed": { amount: string };
}

/** Every key a stored row of this action may hold, today's or an older one's. */
export type StoredAuditKey<A extends AuditAction> =
  | KeyOfAny<AuditEvents[A]>
  | (A extends keyof OlderAuditRows ? KeyOfAny<OlderAuditRows[A]> : never);

// A key that any one of the shapes has, so a reader shared by several actions
// (or one action with two writers) may read a key only some of them write.
type KeyOfAny<T> = T extends unknown ? keyof T & string : never;

// `AuditEvents` names every action in `AUDIT_ACTION_LABELS`, and nothing else.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type AuditEventsCoverEveryAction = Assert<
  Same<keyof AuditEvents, AuditAction>
>;
