import "server-only";

import {
  announcementNotification,
  campDayStart,
  nextCampDay,
  approvalNotification,
  canEditPower,
  captainPromotionNotification,
  FOUNDER_CODE,
  formatMemberRefCode,
  isCurrency,
  isParticipationDecision,
  isReviewTransition,
  normalizeInviteCode,
  INTENT_IMPLIED_BY_STATUS,
  participationAfterIntent,
  type NotificationKind,
  notificationLink,
  type NotificationPayload,
  paymentReference,
  paymentSettlesDues,
  sumMinor,
  UnknownCurrencyError,
  type PaymentStatus,
  QUESTIONNAIRE_REF_TYPE,
  sortPinned,
  canApproveRecipe,
  canRunProofread,
  mealPlanPeaks,
  sameSections,
  sourceFromText,
  sourceText,
  teamEventTitle,
  type AuditAction,
} from "@camp404/core";
import {
  DRAFT_MISSING,
  DRAFT_NOT_YOURS,
  DRAFT_PUBLISHED,
  DRAFT_TEAM_NOT_LED,
  isAllowedAudience,
  PIN_ALREADY,
  PIN_ALREADY_OFF,
  PIN_MISSING,
  PIN_NOT_PUBLISHED,
  PIN_TEAM_NOT_LED,
  type Audience,
  type AnnouncementPinContext,
  type PinnedAnnouncement,
  type PinResult,
} from "@camp404/db/broadcasts";
import type {
  CampManagementMember,
  CampMemberDetail,
  CampMemberDetailOptions,
} from "@camp404/db/roster";
import type { PaymentRow, RecordPaymentInput } from "@camp404/db/payments";
import type {
  ParticipationIntentResult,
  ParticipationRow,
} from "@camp404/db/participations";
import {
  CANNOT_EDIT,
  CANNOT_MOVE,
  CANNOT_REMOVE,
  DONE_VISIBLE_DAYS,
  NOT_A_MEMBER,
  NOT_A_TASK_AUTHOR,
  NOT_YOUR_TEAM,
  NOT_YOUR_TEAM_TO_MOVE,
  PICK_YOUR_TEAM,
  TASK_EDITED,
  TASK_GONE,
  TASK_MOVED,
  TEAM_NOT_ACTIVE,
  type AssignableMember,
  type BoardTask,
  type MyOpenTask,
  type TaskBoardStatus,
  type TaskWriteResult,
} from "@camp404/db/tasks";
import {
  ALREADY_HAS_LOADS,
  ALREADY_HAS_PLAN,
  DEFAULT_POWER_PLAN,
  GENERATOR_CHANGED,
  GENERATOR_GONE,
  INVENTORY_ITEM_GONE,
  LOAD_CHANGED,
  LOAD_GONE,
  NOT_A_POWER_EDITOR,
  NOTHING_TO_COPY,
  PLAN_CHANGED,
  reachRank,
  type GeneratorRow,
  type PowerInventoryItem,
  type PowerLoadRow,
  type PowerPlan,
  type PowerPlanSettings,
  type PowerWriteResult,
} from "@camp404/db/power";
import {
  ANSWER_NEEDED,
  ANSWER_TOO_LONG,
  CHANGES_NOTE_NEEDED,
  LESSON_NEEDED,
  LESSON_VERSION_GONE,
  NEVER_STARTED_ERROR,
  NO_ACCEPTED_VERSION,
  NOT_A_KITCHEN_REVIEWER,
  NOT_AN_APPROVED_MEMBER,
  NOT_READY_TO_PROOFREAD,
  NOT_YOUR_SUGGESTION,
  NO_TEXT_TO_SEND,
  ONLY_A_REVIEWER_SENDS,
  PLATE_RUN_VERSION_GONE,
  RECIPE_CHANGED,
  RECIPE_DECIDED,
  RECIPE_GONE,
  REJECT_REASON_NEEDED,
  RERUN_NOTE_MAX,
  RERUN_NOTE_NEEDED,
  RUN_STAGES,
  SENDER_NOT_A_REVIEWER,
  ADJUST_VERSION_GONE,
  DRAFT_UNREADABLE,
  SERVES_OUT_OF_RANGE,
  SOURCE_CHANGED,
  SOURCE_INVALID,
  STALE_RUN_AFTER_MS,
  STALE_RUN_ERROR,
  TEXT_NEEDED,
  TEXT_TOO_LONG,
  UNTITLED_RECIPE,
  PLATES_OUT_OF_RANGE,
  VERSION_CHANGED,
  adjustReason,
  baseLines,
  campMonthStartOf,
  draftPlatesMismatch,
  failedPlateCounts,
  forRecipe,
  handBackTo,
  plateCountIsBase,
  plateCountReady,
  plateRunOpen,
  readDraft,
  readQuestions,
  runDetail,
  sourceBlockedReason,
  sourcePromptVersion,
  suggestionTitle,
  textBlockedReason,
  versionInvalid,
  type AwaitingAcceptance,
  type ClaimedPlateRun,
  type ClaimedSourceRun,
  type MySuggestion,
  type ProofreadCandidate,
  type ProofreadProgress,
  type ProofreadRunRow,
  type PlateCountDetail,
  type RecipeBookEntry,
  type RecipeDecision,
  type RecipeDetail,
  type PreviousVersion,
  type RecipeSourceHistoryEntry,
  type RecipeSourceVersion,
  type RecipeVersionDetail,
  type RecipeWriteResult,
  type ReviewQueueEntry,
  type RunStage,
  type RunUsage,
  type TokenTotals,
} from "@camp404/db/recipes";
import {
  CHECK_MEAL_PLAN,
  MEAL_PLAN_CHANGED,
  NOT_A_MEAL_PLAN_EDITOR,
  defaultMealPlan,
  type MealPlan,
  type MealPlanSave,
  type MealPlanWriteResult,
} from "@camp404/db/meal-plan";
import {
  CHECK_JOIN_PAGE,
  JOIN_PAGE_CHANGED,
  JOIN_PAGE_NOT_PUBLISHED,
  NOT_A_JOIN_PAGE_EDITOR,
  type JoinPage,
  type JoinPageWriteResult,
} from "@camp404/db/join-page";
import {
  calendarEventRefusal,
  type AddCalendarEventResult,
} from "@camp404/db/calendar-events";
import {
  ADJUST_INSTRUCTION_MAX,
  ADJUST_INSTRUCTION_NEEDED,
  ADJUST_INSTRUCTION_TOO_LONG,
  ANNOUNCEMENT_NOTIFICATION_KINDS,
  DEFAULT_PLATES,
  KitchenRecipe,
  JoinPageSave,
  MealPlanInput,
  PROOFREAD_ANSWER_MAX,
  PlateProofread,
  RECIPE_TEXT_MAX,
  ProofreadExchange,
  RecipeDraft,
  RecipeSourceSections,
  SourceProofread,
  type DraftReport,
  type InboxFilter,
  type IngredientCategory,
  type PlateLine,
  type RecipeSource,
  type RecipeStatus,
  type ReferralUser,
  type EditGeneratorInput,
  type EditLoadInput,
  type GeneratorInput,
  type LoadInput,
} from "@camp404/types";
import {
  currentCycle,
  DEFAULT_CAMP_CONFIG,
  resolveCycles,
  UNSET_CYCLE,
  type TeamsConfig,
} from "@camp404/db/camp-config";
// Type-only: the store's three team operations return the SAME shapes the
// production writers do, so a divergence is a typecheck failure rather than a
// green e2e run over a broken app.
import type {
  SetLeadResult,
  TeamCoverage,
  TeamMembership,
  TeamPerson,
} from "@camp404/db/team-memberships";
import type {
  EmergencyContact,
  IncomingPromotionRequest,
  ParticipationIntent,
  ParticipationStatus,
  QuestionnaireFieldChange,
  Team,
} from "@camp404/types";

import {
  CALENDAR_MAX_EVENTS,
  CALENDAR_WINDOW_DAYS,
  type CalendarEvent,
  type CalendarRange,
} from "./google-calendar";

// Process-scoped in-memory replacement for the Neon-backed user and
// burner-profile tables. Only used when isE2ETestMode() is true.
// Reset between tests via DELETE /api/test/reset.

type TestRank = "captain" | "member";
type TestApprovalStatus = "pending" | "approved" | "rejected";

interface TestUser {
  id: string;
  authUserId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  telegramHandle: string | null;
  inviteCode: string | null;
  rank: TestRank;
  approvalStatus: TestApprovalStatus;
  approvalDecidedByUserId: string | null;
  approvalDecidedAt: Date | null;
  approvalDecisionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestBurnerProfile {
  userId: string;
  version: string;
  responses: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

interface TestQuestionnaireEdit {
  id: string;
  userId: string;
  questionnaireKey: string;
  version: string;
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
  createdAt: Date;
}

interface TestInviteCode {
  code: string;
  createdByUserId: string | null;
  note: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  assignedRank: TestRank | null;
  invitedEmail: string | null;
  requiresApproval: boolean;
  createdAt: Date;
}

type TestPresentation = "acknowledge" | "popup" | "feed";

// In-memory stand-ins for the `broadcasts` and `notification_deliveries`
// tables. An announcement is a broadcast with `publishedAt === null` while a
// draft; publishing fans it out into one delivery per recipient.
interface TestBroadcast {
  id: string;
  senderId: string | null;
  title: string;
  body: string;
  presentation: TestPresentation;
  audience: Audience;
  publishedAt: Date | null;
  /** The pin mark. NULL = not pinned; only a published row ever carries one. */
  pinnedAt: Date | null;
  /** Who set the mark — their rank breaks a tie in the banner's order. */
  pinnedBy: string | null;
  /** The composer's "keep it at the top", spent when the draft publishes. */
  pinOnPublish: boolean;
  createdAt: Date;
}

interface TestDelivery {
  id: string;
  broadcastId: string | null;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
  presentation: TestPresentation;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

// In-memory stand-in for `captain_promotion_requests`. Mirrors the db row +
// semantics: one open (`sent`) row per target, only a `sent` row transitions.
// Participant ids are nullable to match the real row (SET NULL on a hard delete
// for audit retention) — `sendCaptainPromotion` always writes them non-null.
interface TestPromotionRequest {
  id: string;
  targetUserId: string | null;
  requestedByUserId: string | null;
  status: "sent" | "accepted" | "declined" | "cancelled";
  createdAt: Date;
  decidedAt: Date | null;
}

// In-memory stand-in for `team_memberships`. Year-scoped exactly like the real
// table: (userId, team, cycle) is the identity, and every read filters on the
// camp's current cycle. See the team-membership section below for the semantics
// this mirrors.
interface TestTeamMembership {
  userId: string;
  team: Team;
  isLead: boolean;
  cycle: number;
}

/**
 * The store's twin of a `required_actions` row: what blocks a member. Only the
 * burner profile gate is written here today (seeded when a member is created,
 * satisfied when the profile is finished), the same as production, so the
 * member ladder gates E2E users exactly as it gates real ones.
 */
interface TestRequiredAction {
  userId: string;
  actionKey: string;
  type: "questionnaire";
  title: string;
  version: string | null;
  activationId: null;
  blocking: boolean;
  dueAt: null;
  status: "pending" | "completed";
  /** Set when the gate is satisfied, as `required_actions.completed_at` is. */
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * An event on the stand-in camp calendar. Under E2E the calendar is connected
 * and starts empty; events added through the page land here, in the shape the
 * Google read returns.
 */
interface TestCalendarEvent extends CalendarEvent {
  /** When it starts, for the window and the order. */
  startsAt: Date;
  createdById: string;
}

interface TestTask {
  id: string;
  title: string;
  description: string | null;
  team: Team | null;
  status: TaskBoardStatus | "cancelled";
  assigneeId: string | null;
  createdById: string;
  dueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  /** Bumped by an edit only, as `tasks.version` is. */
  version: number;
}

/** A payments-ledger row (mirrors `payments`). */
interface TestPayment {
  id: string;
  userId: string;
  cycle: number;
  amountCents: number;
  currency: string;
  reference: string;
  status: PaymentStatus;
  note: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A recipe (mirrors `recipes`; a store recipe always has a title). */
interface TestRecipe {
  id: string;
  submitterId: string | null;
  source: RecipeSource;
  status: RecipeStatus;
  title: string;
  sourceUrl: string | null;
  rawText: string | null;
  suitabilityNote: string | null;
  textAuthorId: string | null;
  aiConsentAt: Date | null;
  changesNote: string | null;
  rejectionReason: string | null;
  lastError: string | null;
  latestRunId: string | null;
  acceptedVersionId: string | null;
  rerunRequest: string | null;
  rerunRequestedBy: string | null;
  rerunRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One proofreading run (mirrors `recipe_proofread_runs`). */
interface TestRecipeRun {
  id: string;
  recipeId: string;
  requestedBy: string | null;
  requestedAt: Date;
  note: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  promptVersion: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  outcome: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  result: unknown;
  /** `recipe` rows are older draft runs; nothing writes one any more. */
  kind: "recipe" | "plates" | "source" | "adjust";
  /** What should change, on an `adjust` run. */
  instruction?: string | null;
  plates: number | null;
  versionId: string | null;
  sourceId: string | null;
  stage: RunStage | null;
  exchange: ProofreadExchange | null;
  previousStatus: RecipeStatus | null;
  previousRunId: string | null;
}

/** One version of a recipe's source (mirrors `recipe_sources`). */
interface TestRecipeSource {
  id: string;
  recipeId: string;
  version: number;
  serves: number | null;
  sections: RecipeSourceSections;
  authorId: string | null;
  createdAt: Date;
}

/** A recipe version (mirrors `recipe_versions`: the whole recipe as a body). */
interface TestRecipeVersion {
  id: string;
  recipeId: string;
  version: number;
  body: KitchenRecipe;
  report: DraftReport | null;
  scalingNotes: string[];
  sourceId: string | null;
  runId: string | null;
  reason: string;
  authorId: string;
  createdAt: Date;
}

/** One version's recipe for one plate count (mirrors `recipe_plate_counts`). */
interface TestPlateCount {
  versionId: string;
  plates: number;
  lines: PlateLine[];
  pots: number | null;
  notes: string[];
  report: DraftReport | null;
  source: "version" | "proofread";
  runId: string | null;
  createdAt: Date;
}

/** The ingredient catalogue (mirrors `ingredients`, matched by lower name). */
interface TestIngredient {
  id: string;
  name: string;
  category: IngredientCategory | null;
}

interface TestRecipeLesson {
  id: string;
  recipeId: string;
  versionId: string;
  authorId: string;
  body: string;
  cycle: number;
  createdAt: Date;
}

/** The store's audit rows for recipes and the kitchen settings. */
interface TestRecipeEvent {
  recipeId: string | null;
  action: AuditAction;
  actorId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** One member's answer for one year (mirrors `camp_participations`). */
type TestParticipation = ParticipationRow;

interface TestStoreState {
  usersByAuthId: Map<string, TestUser>;
  profilesByUserId: Map<string, TestBurnerProfile>;
  idDocsByUserId: Map<
    string,
    { idType: string | null; idNumber: string | null }
  >;
  emergencyContactsByUserId: Map<string, EmergencyContact[]>;
  inviteCodes: Map<string, TestInviteCode>;
  questionnaireEdits: TestQuestionnaireEdit[];
  broadcasts: TestBroadcast[];
  deliveries: TestDelivery[];
  promotionRequests: TestPromotionRequest[];
  teamMemberships: TestTeamMembership[];
  requiredActions: TestRequiredAction[];
  tasks: TestTask[];
  calendarEvents: TestCalendarEvent[];
  payments: TestPayment[];
  /** `users.ref_code`: each member's payment reference, given out once. */
  memberRefCodes: Map<string, string>;
  /** `camp_participations`, keyed `${userId}:${cycle}` like its primary key. */
  participations: Map<string, TestParticipation>;
  /** Power and fuel (#253, #254): the twins of their tables. */
  powerLoads: PowerLoadRow[];
  /** `power_plans`, keyed by year like the table's primary key. */
  powerPlans: Map<number, PowerPlan>;
  generators: GeneratorRow[];
  /** The inventory items the "From inventory" helper offers (none archived). */
  powerInventory: PowerInventoryItem[];
  recipes: TestRecipe[];
  recipeRuns: TestRecipeRun[];
  recipeSources: TestRecipeSource[];
  recipeVersions: TestRecipeVersion[];
  recipePlateCounts: TestPlateCount[];
  ingredientCatalogue: TestIngredient[];
  recipeLessons: TestRecipeLesson[];
  recipeHistory: TestRecipeEvent[];
  /** The kitchen's settings. Reassigned on every edit, so it lives on `S`. */
  /** `kitchen_meal_plans` with their days, keyed by year. */
  mealPlans: Map<number, MealPlan>;
  /** `join_pages`, keyed by year like the table's primary key. */
  joinPages: Map<number, JoinPage>;
  nextSerial: number;
  // The camp team config (Phase 2). Reassigned wholesale on every edit, so —
  // like `nextSerial` — it lives on `S`, not a stable binding. Seeded with a
  // deep clone of DEFAULT_CAMP_CONFIG so edits never mutate the shared const.
  teamsConfig: TeamsConfig;
}

// Next.js gives RSC renders and route handlers SEPARATE module graphs in the
// same process (pronounced under Turbopack dev), so a plain module-level
// singleton would be DUPLICATED — and the two halves of an e2e spec (a page
// render that creates a user vs. an /api/test/* route that reads it) wouldn't
// see each other's writes. Hanging the state off globalThis — the one true
// per-process singleton — keeps every module-graph copy pointed at the same
// store. Same trick as the common "Prisma client on globalThis in dev"
// pattern. (Only ever loaded under E2E_TEST_MODE; production never imports
// this module.)
const GLOBAL_KEY = "__camp404TestStore__";

function globalState(): TestStoreState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      usersByAuthId: new Map<string, TestUser>(),
      profilesByUserId: new Map<string, TestBurnerProfile>(),
      idDocsByUserId: new Map<
        string,
        { idType: string | null; idNumber: string | null }
      >(),
      emergencyContactsByUserId: new Map<string, EmergencyContact[]>(),
      inviteCodes: new Map<string, TestInviteCode>(),
      questionnaireEdits: [] as TestQuestionnaireEdit[],
      broadcasts: [] as TestBroadcast[],
      deliveries: [] as TestDelivery[],
      promotionRequests: [] as TestPromotionRequest[],
      teamMemberships: [] as TestTeamMembership[],
      requiredActions: [] as TestRequiredAction[],
      tasks: [] as TestTask[],
      calendarEvents: [] as TestCalendarEvent[],
      payments: [] as TestPayment[],
      memberRefCodes: new Map<string, string>(),
      participations: new Map<string, TestParticipation>(),
      powerLoads: [] as PowerLoadRow[],
      powerPlans: new Map<number, PowerPlan>(),
      generators: [] as GeneratorRow[],
      powerInventory: [] as PowerInventoryItem[],
      recipes: [] as TestRecipe[],
      recipeRuns: [] as TestRecipeRun[],
      recipeSources: [] as TestRecipeSource[],
      recipeVersions: [] as TestRecipeVersion[],
      recipePlateCounts: [] as TestPlateCount[],
      ingredientCatalogue: [] as TestIngredient[],
      recipeLessons: [] as TestRecipeLesson[],
      recipeHistory: [] as TestRecipeEvent[],
      mealPlans: new Map<number, MealPlan>(),
      joinPages: new Map<number, JoinPage>(),
      nextSerial: 1,
      teamsConfig: structuredClone(DEFAULT_CAMP_CONFIG),
    } satisfies TestStoreState;
  }
  return g[GLOBAL_KEY] as TestStoreState;
}

const S = globalState();
// Map/array bindings are stable references shared across module graphs;
// `nextSerial` is a primitive so it must be read/written through `S`.
const usersByAuthId = S.usersByAuthId;
const profilesByUserId = S.profilesByUserId;
const idDocsByUserId = S.idDocsByUserId;
const emergencyContactsByUserId = S.emergencyContactsByUserId;
const inviteCodes = S.inviteCodes;
const questionnaireEdits = S.questionnaireEdits;
const broadcasts = S.broadcasts;
const deliveries = S.deliveries;

/** The store's twin of deliveryValues: every delivery comes from a builder. */
function pushDelivery(
  payload: NotificationPayload,
  input: {
    userId: string;
    broadcastId: string | null;
    presentation: TestPresentation;
  },
): void {
  deliveries.push({
    id: crypto.randomUUID(),
    broadcastId: input.broadcastId,
    userId: input.userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    refType: payload.refType,
    refId: payload.refId,
    presentation: input.presentation,
    readAt: null,
    acknowledgedAt: null,
    createdAt: new Date(),
  });
}
const promotionRequests = S.promotionRequests;
const teamMemberships = S.teamMemberships;
const requiredActions = S.requiredActions;
const tasks = S.tasks;
// A dev server that was running before this field existed has a state object
// without it; give it one rather than crash.
S.calendarEvents ??= [];
const calendarEvents = S.calendarEvents;
S.payments ??= [];
S.memberRefCodes ??= new Map<string, string>();
S.participations ??= new Map<string, TestParticipation>();
const participations = S.participations;
const participationKey = (userId: string, cycle: number) =>
  `${userId}:${cycle}`;
const payments = S.payments;
const memberRefCodes = S.memberRefCodes;
S.powerLoads ??= [];
S.powerPlans ??= new Map<number, PowerPlan>();
S.generators ??= [];
S.powerInventory ??= [];
const powerLoads = S.powerLoads;
const powerPlans = S.powerPlans;
const generators = S.generators;
const powerInventory = S.powerInventory;
S.recipes ??= [];
S.recipeRuns ??= [];
S.recipeSources ??= [];
S.recipeVersions ??= [];
S.recipePlateCounts ??= [];
S.ingredientCatalogue ??= [];
S.recipeLessons ??= [];
S.recipeHistory ??= [];
S.mealPlans ??= new Map<number, MealPlan>();
S.joinPages ??= new Map<number, JoinPage>();
const recipes = S.recipes;
const recipeRuns = S.recipeRuns;
const recipeSources = S.recipeSources;
const recipeVersions = S.recipeVersions;
const recipePlateCounts = S.recipePlateCounts;
const ingredientCatalogue = S.ingredientCatalogue;
const recipeLessons = S.recipeLessons;
const recipeHistory = S.recipeHistory;

/**
 * The camp's current year, resolved the way `currentCycleNumber()` resolves it
 * in production: from the camp config, falling back to the `UNSET_CYCLE`
 * sentinel on a camp that has not named its founding year yet.
 *
 * DEFAULT_CAMP_CONFIG carries no `cycles`, so a fresh store sits on the
 * sentinel — the same value migration 0019 stamped on every pre-namespace row —
 * and every membership written there is consistently readable. A test that
 * names a founding year through `setTeamsConfig` gets real year-scoping,
 * including last year's rows going quiet.
 *
 * KNOWN BOUNDARY: production's `setFoundingYear` also sweeps rows carrying the
 * sentinel onto the founding year. Nothing mirrors that here because the
 * founding-year write path (@camp404/db/cycle-rollover) is not routed through
 * this store — so seed the year BEFORE the memberships, the way the PGlite
 * suite's `foundedAt` helper does.
 */
function currentCycleNumber(): number {
  return (
    currentCycle(resolveCycles(globalState().teamsConfig))?.year ?? UNSET_CYCLE
  );
}

function findUserById(userId: string): TestUser | null {
  for (const user of usersByAuthId.values()) {
    if (user.id === userId) return user;
  }
  return null;
}

function nextId(): string {
  return `test-user-${S.nextSerial++}`;
}

// --- Power helpers (the twins of @camp404/db/power's private steps) ---------

/** A captain, or a lead of Power & Lighting this year (lockPowerEditor's twin). */
function isPowerEditor(userId: string): boolean {
  const reach = testStore.senderReach(userId);
  return canEditPower(reachRank(reach), reach ?? []);
}

/** The store's twin of the db module's write(): a refusal is a sentence. */
function powerWrite<T extends object>(
  actorId: string,
  fn: (cycle: number) => T | string,
): PowerWriteResult<T> {
  if (!isPowerEditor(actorId)) return { ok: false, error: NOT_A_POWER_EDITOR };
  const out = fn(currentCycleNumber());
  return typeof out === "string"
    ? { ok: false, error: out }
    : { ok: true, ...out };
}

function inventoryItemGone(itemId: string | null): boolean {
  return itemId !== null && !powerInventory.some((i) => i.id === itemId);
}

function powerLoadFields(input: LoadInput) {
  return {
    name: input.name,
    area: input.area,
    category: input.category,
    quantity: input.quantity,
    wattsEach: input.wattsEach,
    surgeWattsEach: input.surgeWattsEach,
    dutyPct: input.dutyPct,
    schedule: input.schedule,
    hoursPerDay: input.hoursPerDay,
    windows: input.windows ? input.windows.map((w) => ({ ...w })) : null,
    fromDay: input.fromDay,
    toDay: input.toDay,
    volts: input.volts,
    current: input.current,
    owner: input.owner,
    neighbourCamp: input.neighbourCamp,
    inventoryItemId: input.inventoryItemId,
    circuit: input.circuit,
  };
}

function generatorFields(input: GeneratorInput) {
  return {
    model: input.model,
    ratedKva: input.ratedKva,
    maxKva: input.maxKva,
    tankLitres: input.tankLitres,
    runtime50Hours: input.runtime50Hours,
    runtime100Hours: input.runtime100Hours,
    fuelType: input.fuelType,
    owner: input.owner,
    inventoryItemId: input.inventoryItemId,
    noiseNote: input.noiseNote,
  };
}

function loadsOf(cycle: number): PowerLoadRow[] {
  return powerLoads
    .filter((l) => l.cycle === cycle)
    .sort(
      (a, b) =>
        a.sort - b.sort || a.createdAt.getTime() - b.createdAt.getTime(),
    );
}

/** Why a load's compare-and-set lost: gone this year, or someone was first. */
function loadLoss(loadId: string, cycle: number): string {
  return powerLoads.some((l) => l.id === loadId && l.cycle === cycle)
    ? LOAD_CHANGED
    : LOAD_GONE;
}

function previousStoreLoadCycle(cycle: number): number | null {
  const earlier = powerLoads.filter((l) => l.cycle < cycle).map((l) => l.cycle);
  return earlier.length > 0 ? Math.max(...earlier) : null;
}

function previousStorePlanCycle(cycle: number): number | null {
  const earlier = [...powerPlans.keys()].filter((c) => c < cycle);
  return earlier.length > 0 ? Math.max(...earlier) : null;
}

/** A generator the plan may name (assertPlanGenerator's twin), or a refusal. */
function planGeneratorRefusal(
  generatorId: string | null | undefined,
  current: string | null,
): string | null {
  if (generatorId === undefined || generatorId === null) return null;
  const gen = generators.find((g) => g.id === generatorId);
  if (!gen) return GENERATOR_GONE;
  if (gen.archivedAt !== null && generatorId !== current) return GENERATOR_GONE;
  return null;
}

const POWER_PLAN_KEYS = Object.keys(DEFAULT_POWER_PLAN).filter(
  (key) => key !== "version",
) as (keyof PowerPlanSettings)[];

function planPatch(
  patch: Partial<PowerPlanSettings>,
): Partial<PowerPlanSettings> {
  return Object.fromEntries(
    POWER_PLAN_KEYS.filter((key) => patch[key] !== undefined).map((key) => [
      key,
      patch[key],
    ]),
  );
}

// --- Recipe helpers (the twins of @camp404/db/recipes' private steps) -------

function findRecipe(id: string): TestRecipe | null {
  return recipes.find((r) => r.id === id) ?? null;
}

function userName(id: string | null): string | null {
  return id ? (findUserById(id)?.displayName ?? null) : null;
}

/**
 * A captain, or a lead of Kitchen this year, may send recipes to Claude (the
 * owner's decision 2A; the twin of the reviewer lock the queue takes).
 */
function mayRunProofread(userId: string): boolean {
  const reach = testStore.senderReach(userId);
  return canRunProofread(reachRank(reach), reach ?? []);
}

/** A captain, or a lead of Kitchen this year (the twin of lockKitchenReviewer). */
function isKitchenReviewer(userId: string): boolean {
  const reach = testStore.senderReach(userId);
  return canApproveRecipe(reachRank(reach), reach ?? []);
}

/** Only the tick on the suggestion counts, as in production. */
function storeTextBlocked(recipe: TestRecipe): string | null {
  return textBlockedReason(recipe);
}

/** Hand a recipe back after its run failed (the twin of handBack). */
function handBackStore(
  run: TestRecipeRun,
  from: RecipeStatus,
  error: string,
  now: Date,
): void {
  const recipe = findRecipe(run.recipeId);
  if (!recipe || recipe.status !== from || recipe.latestRunId !== run.id) {
    return;
  }
  const previous = recipeRuns.find((r) => r.id === run.previousRunId);
  const to = handBackTo({
    failedRunId: run.id,
    previousStatus: run.previousStatus,
    previousRunId: run.previousRunId,
    previousRunSucceeded: previous?.outcome === "succeeded",
    acceptedVersionId: recipe.acceptedVersionId,
  });
  recipe.status = to.status;
  recipe.latestRunId = to.runId;
  recipe.lastError = error;
  recipe.updatedAt = now;
}

function recordRecipeEvent(
  recipe: TestRecipe,
  action: AuditAction,
  actorId: string,
  detail: Record<string, unknown> = {},
): void {
  recipeHistory.push({
    recipeId: recipe.id,
    action,
    actorId,
    metadata: { title: recipe.title, ...detail },
    createdAt: new Date(),
  });
}

/** The statuses a proofreading run may be queued from (QUEUEABLE). */
const QUEUEABLE: readonly RecipeStatus[] = [
  "approved",
  "proofread",
  "accepted",
];

function sourceVersionOf(row: TestRecipeSource): RecipeSourceVersion {
  return {
    id: row.id,
    version: row.version,
    serves: row.serves,
    sections: structuredClone(row.sections),
    authorId: row.authorId,
  };
}

/** The accepted version a revision starts from (the twin of readPreviousVersion). */
function storePreviousVersion(
  acceptedVersionId: string | null,
): PreviousVersion | null {
  const version = recipeVersions.find((v) => v.id === acceptedVersionId);
  if (!version) return null;
  const run = recipeRuns.find(
    (r) =>
      r.id === version.runId && (r.kind === "source" || r.kind === "adjust"),
  );
  return {
    version: version.version,
    recipe: version.body,
    exchange: storeExchange(run?.exchange),
  };
}

/** A year's meal plan, or the defaults (the twin of readMealPlan). */
function storeMealPlan(cycle: number): MealPlan {
  const plan = S.mealPlans.get(cycle);
  return plan
    ? {
        ...plan,
        firstDay: plan.firstDay ?? null,
        days: plan.days.map((d) => ({ ...d })),
      }
    : defaultMealPlan(cycle);
}

/** A recipe's newest source version, or null (the twin of latestSource). */
function latestStoreSource(recipeId: string): TestRecipeSource | null {
  let latest: TestRecipeSource | null = null;
  for (const row of recipeSources) {
    if (row.recipeId === recipeId && (!latest || row.version > latest.version))
      latest = row;
  }
  return latest;
}

/** The sections as the editor's schema allows, or the refusal (checkSections). */
function checkStoreSections(
  sections: unknown,
): { ok: true; sections: RecipeSourceSections } | { ok: false; error: string } {
  const parsed = RecipeSourceSections.safeParse(sections);
  if (parsed.success) return { ok: true, sections: parsed.data };
  const custom = parsed.error.issues.find((issue) => issue.code === "custom");
  return { ok: false, error: custom?.message ?? SOURCE_INVALID };
}

function servesInRange(serves: number | null): boolean {
  return (
    serves === null ||
    (Number.isInteger(serves) && serves >= 1 && serves <= 500)
  );
}

/** Write the next version of a recipe's source (the twin of insertSource). */
function insertStoreSource(input: {
  recipeId: string;
  serves: number | null;
  sections: RecipeSourceSections;
  authorId: string | null;
  now: Date;
}): TestRecipeSource {
  const version = (latestStoreSource(input.recipeId)?.version ?? 0) + 1;
  const row: TestRecipeSource = {
    id: crypto.randomUUID(),
    recipeId: input.recipeId,
    version,
    serves: input.serves,
    sections: structuredClone(input.sections),
    authorId: input.authorId,
    createdAt: input.now,
  };
  recipeSources.push(row);
  return row;
}

/** A run's stored exchange; an unreadable one reads as none. */
function storeExchange(exchange: unknown): ProofreadExchange {
  const parsed = ProofreadExchange.safeParse(exchange ?? []);
  return parsed.success ? parsed.data : [];
}

function isStoreRunStage(stage: unknown): stage is RunStage {
  return (RUN_STAGES as readonly unknown[]).includes(stage);
}

/**
 * Queue a `source` run and move the recipe to `queued` (the twin of
 * insertSourceRun). The caller has made every check.
 */
function insertStoreSourceRun(input: {
  recipe: TestRecipe;
  sourceId: string | null;
  /** An adjust run: the version it starts from and what should change. */
  adjust?: { versionId: string; instruction: string };
  actorId: string;
  now: Date;
  note: string | null;
  plates: number;
  exchange: ProofreadExchange;
  previousRunId: string | null;
  promptVersion: string;
  model: string;
}): string {
  const runId = crypto.randomUUID();
  const { recipe } = input;
  recipeRuns.push({
    id: runId,
    recipeId: recipe.id,
    requestedBy: input.actorId,
    requestedAt: input.now,
    note: input.note,
    startedAt: null,
    finishedAt: null,
    promptVersion: input.promptVersion,
    model: input.model,
    inputTokens: null,
    outputTokens: null,
    outcome: "queued",
    error: null,
    result: null,
    kind: input.adjust ? "adjust" : "source",
    instruction: input.adjust?.instruction ?? null,
    plates: input.plates,
    versionId: input.adjust?.versionId ?? null,
    sourceId: input.sourceId,
    stage: null,
    exchange: input.exchange,
    previousStatus: recipe.status,
    previousRunId: input.previousRunId,
  });
  recipe.status = "queued";
  recipe.lastError = null;
  recipe.latestRunId = runId;
  recipe.rerunRequest = null;
  recipe.rerunRequestedBy = null;
  recipe.rerunRequestedAt = null;
  recipe.updatedAt = input.now;
  return runId;
}

/** The run kinds that write a recipe into the book, or ask first. */
function isWritingRun(run: TestRecipeRun): boolean {
  return run.kind === "source" || run.kind === "adjust";
}

/** One of this recipe's versions (the twin of adjustableVersion). */
function adjustableStoreVersion(
  recipeId: string,
  versionId: string,
): TestRecipeVersion | null {
  return (
    recipeVersions.find((v) => v.id === versionId && v.recipeId === recipeId) ??
    null
  );
}

/** File an ingredient by lower-cased name; fill only an empty category. */
function upsertStoreIngredient(line: KitchenRecipe["ingredients"][number]) {
  const name = line.name.trim();
  const existing = ingredientCatalogue.find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    existing.category ??= line.category;
    return;
  }
  ingredientCatalogue.push({
    id: crypto.randomUUID(),
    name,
    category: line.category,
  });
}

/** The twin of insertVersion: the body, its own plate count, the catalogue. */
function addStoreVersion(
  recipe: TestRecipe,
  input: {
    authorId: string;
    runId: string | null;
    reason: string;
    body: KitchenRecipe;
    report: DraftReport | null;
    sourceId?: string | null;
    scalingNotes?: string[];
  },
): { versionId: string; version: number } {
  const version =
    Math.max(
      0,
      ...recipeVersions
        .filter((v) => v.recipeId === recipe.id)
        .map((v) => v.version),
    ) + 1;
  const id = crypto.randomUUID();
  const now = new Date();
  recipeVersions.push({
    id,
    recipeId: recipe.id,
    version,
    body: input.body,
    report: input.report,
    scalingNotes: input.scalingNotes ?? [],
    sourceId: input.sourceId ?? null,
    runId: input.runId,
    reason: input.reason,
    authorId: input.authorId,
    createdAt: now,
  });
  recipePlateCounts.push({
    versionId: id,
    plates: input.body.plates,
    lines: baseLines(input.body),
    pots: null,
    notes: [],
    report: null,
    source: "version",
    runId: null,
    createdAt: now,
  });
  input.body.ingredients.forEach(upsertStoreIngredient);
  recipe.status = "accepted";
  recipe.acceptedVersionId = id;
  recipe.title = input.body.title;
  recipe.updatedAt = now;
  return { versionId: id, version };
}

/** The plate counts a version has a result for, smallest first. */
function storePlateCounts(versionId: string): TestPlateCount[] {
  return recipePlateCounts
    .filter((p) => p.versionId === versionId)
    .sort((a, b) => a.plates - b.plates);
}

export const testStore = {
  /** The camp team config (Phase 2). Backs the E2E-mode camp-config facade. */
  getTeamsConfig(): TeamsConfig {
    return globalState().teamsConfig;
  },
  /** Persist a (whole) new team config — the facade passes the transformed value. */
  setTeamsConfig(config: TeamsConfig): void {
    globalState().teamsConfig = config;
  },
  findUserByAuthId(authUserId: string): TestUser | null {
    return usersByAuthId.get(authUserId) ?? null;
  },
  createUser(input: {
    authUserId: string;
    displayName: string | null;
    inviteCode: string | null;
    rank?: TestRank;
    approvalStatus?: TestApprovalStatus;
  }): TestUser {
    const now = new Date();
    const user: TestUser = {
      id: nextId(),
      authUserId: input.authUserId,
      displayName: input.displayName,
      profileImageUrl: null,
      telegramHandle: null,
      inviteCode: input.inviteCode,
      rank: input.rank ?? "member",
      approvalStatus: input.approvalStatus ?? "approved",
      approvalDecidedByUserId: null,
      approvalDecidedAt: null,
      approvalDecisionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    usersByAuthId.set(input.authUserId, user);
    return user;
  },
  findUserById(userId: string): TestUser | null {
    return findUserById(userId);
  },
  /** How many captains there are (the system-status probe's twin). */
  countCaptains(): number {
    let count = 0;
    for (const user of usersByAuthId.values()) {
      if (user.rank === "captain") count++;
    }
    return count;
  },
  setUserInviteCode(userId: string, code: string): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.inviteCode = code;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setUserRank(userId: string, rank: TestRank): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.rank = rank;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setUserApprovalStatus(
    userId: string,
    status: TestApprovalStatus,
    // Only the /api/test/set-approval seam passes one, to stand in for a
    // captain's decision; the production writer always clears it.
    reason: string | null = null,
  ): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.approvalStatus = status;
        user.approvalDecisionReason = reason;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setUserApproval(input: {
    userId: string;
    from: TestApprovalStatus;
    to: TestApprovalStatus;
    decidedByUserId: string;
    reason?: string | null;
  }): boolean {
    // Mirrors the db: only a real decision, and only from the status the
    // captain saw, so a second captain on a stale roster is a no-op (false)
    // rather than a silent overwrite.
    if (!isReviewTransition(input.from, input.to)) {
      throw new Error(
        `setUserApproval: ${input.from} -> ${input.to} is not a decision`,
      );
    }
    for (const user of usersByAuthId.values()) {
      if (user.id === input.userId) {
        if (user.approvalStatus !== input.from) return false;
        user.approvalStatus = input.to;
        user.approvalDecidedByUserId = input.decidedByUserId;
        user.approvalDecidedAt = new Date();
        user.approvalDecisionReason =
          input.to === "pending" ? null : input.reason?.trim() || null;
        user.updatedAt = new Date();
        // As in production: an approval tells the member, nothing else does.
        if (input.to === "approved") {
          pushDelivery(approvalNotification(), {
            userId: user.id,
            broadcastId: null,
            presentation: "popup",
          });
        }
        // As in production: a rejected member leaves this year's teams.
        if (input.to === "rejected") {
          const cycle = currentCycleNumber();
          for (let n = teamMemberships.length - 1; n >= 0; n--) {
            const m = teamMemberships[n]!;
            if (m.userId === user.id && m.cycle === cycle) {
              teamMemberships.splice(n, 1);
            }
          }
        }
        return true;
      }
    }
    return false;
  },

  setTelegramHandle(userId: string, handle: string | null): void {
    const user = findUserById(userId);
    if (!user) return;
    user.telegramHandle = handle;
    user.updatedAt = new Date();
  },
  setProfileImage(userId: string, url: string | null): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.profileImageUrl = url;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setDisplayName(userId: string, name: string | null): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.displayName = name;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  getProfile(userId: string): TestBurnerProfile | null {
    return profilesByUserId.get(userId) ?? null;
  },
  upsertProfile(input: {
    userId: string;
    version: string;
    responses: Record<string, unknown>;
    markComplete: boolean;
  }): void {
    const now = new Date();
    const existing = profilesByUserId.get(input.userId);
    if (existing) {
      existing.version = input.version;
      existing.responses = input.responses;
      existing.updatedAt = now;
      if (input.markComplete) existing.completedAt = now;
      return;
    }
    profilesByUserId.set(input.userId, {
      userId: input.userId,
      version: input.version,
      responses: input.responses,
      startedAt: now,
      completedAt: input.markComplete ? now : null,
      updatedAt: now,
    });
  },
  // --- Required actions (the gate spine) --------------------------------

  /** Twin of ensureRequiredAction: adds the row once, never twice. */
  ensureRequiredAction(input: {
    userId: string;
    actionKey: string;
    title: string;
    version: string | null;
  }): void {
    const exists = requiredActions.some(
      (a) => a.userId === input.userId && a.actionKey === input.actionKey,
    );
    if (exists) return;
    requiredActions.push({
      ...input,
      type: "questionnaire",
      activationId: null,
      blocking: true,
      dueAt: null,
      status: "pending",
      completedAt: null,
      createdAt: new Date(),
    });
  },
  /**
   * Twin of satisfyRequiredAction. KNOWN BOUNDARY: it does not compare
   * versions, because E2E never bumps a questionnaire version mid-spec.
   */
  satisfyRequiredAction(userId: string, actionKey: string): boolean {
    const action = requiredActions.find(
      (a) =>
        a.userId === userId &&
        a.actionKey === actionKey &&
        a.status === "pending",
    );
    if (!action) return false;
    action.status = "completed";
    action.completedAt = new Date();
    return true;
  },
  /** Twin of getPendingRequiredActions: pending and blocking, oldest first. */
  getPendingRequiredActions(userId: string): TestRequiredAction[] {
    return requiredActions
      .filter(
        (a) => a.userId === userId && a.status === "pending" && a.blocking,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  // --- ID documents (raw in test mode — no crypto) ----------------------

  setIdDocuments(
    userId: string,
    id: { idType: string | null; idNumber: string | null },
  ): void {
    idDocsByUserId.set(userId, id);
  },
  getIdDocuments(
    userId: string,
  ): { idType: string | null; idNumber: string | null } | null {
    return idDocsByUserId.get(userId) ?? null;
  },
  setEmergencyContacts(
    userId: string,
    contacts: readonly EmergencyContact[],
  ): void {
    if (contacts.length === 0) emergencyContactsByUserId.delete(userId);
    else emergencyContactsByUserId.set(userId, [...contacts]);
  },
  getEmergencyContacts(userId: string): EmergencyContact[] | null {
    return emergencyContactsByUserId.get(userId) ?? null;
  },

  // --- Questionnaire edit log -------------------------------------------

  recordQuestionnaireEdit(input: {
    userId: string;
    questionnaireKey: string;
    version: string;
    editedByUserId: string | null;
    changes: QuestionnaireFieldChange[];
  }): void {
    questionnaireEdits.push({
      id: `test-edit-${S.nextSerial++}`,
      userId: input.userId,
      questionnaireKey: input.questionnaireKey,
      version: input.version,
      editedByUserId: input.editedByUserId,
      changes: input.changes,
      createdAt: new Date(),
    });
  },
  listQuestionnaireEdits(
    userId: string,
    questionnaireKey: string,
    limit = 20,
  ): TestQuestionnaireEdit[] {
    return questionnaireEdits
      .filter(
        (e) => e.userId === userId && e.questionnaireKey === questionnaireKey,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  },

  // --- Invite codes -----------------------------------------------------

  seedInviteCode(input: {
    code: string;
    createdByUserId?: string | null;
    note?: string | null;
    maxUses?: number | null;
    expiresAt?: Date | null;
    assignedRank?: TestRank | null;
    invitedEmail?: string | null;
    requiresApproval?: boolean;
  }): TestInviteCode {
    // One spelling, like the database: lowercase (normalizeInviteCode).
    const row: TestInviteCode = {
      code: normalizeInviteCode(input.code),
      createdByUserId: input.createdByUserId ?? null,
      note: input.note ?? null,
      maxUses: input.maxUses ?? null,
      useCount: 0,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      assignedRank: input.assignedRank ?? null,
      invitedEmail: input.invitedEmail ?? null,
      requiresApproval: input.requiresApproval ?? false,
      createdAt: new Date(),
    };
    inviteCodes.set(row.code, row);
    return row;
  },
  findUsableInviteCode(code: string): TestInviteCode | null {
    const row = inviteCodes.get(normalizeInviteCode(code));
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;
    if (row.maxUses !== null && row.useCount >= row.maxUses) return null;
    // The root code is single-use, as in @camp404/db/invite-codes.
    if (row.code === FOUNDER_CODE && row.useCount > 0) return null;
    return row;
  },
  consumeInviteCode(code: string): TestInviteCode | null {
    const row = this.findUsableInviteCode(code);
    if (!row) return null;
    row.useCount += 1;
    return row;
  },

  // --- Announcements & notifications ------------------------------------

  createBroadcastDraft(input: {
    senderId: string;
    title: string;
    body: string;
    presentation: TestPresentation;
    audience?: Audience;
    pinned?: boolean;
  }): { id: string } {
    const row: TestBroadcast = {
      id: crypto.randomUUID(),
      senderId: input.senderId,
      title: input.title,
      body: input.body,
      presentation: input.presentation,
      audience: input.audience ?? { scope: "everyone" },
      publishedAt: null,
      pinnedAt: null,
      pinnedBy: null,
      pinOnPublish: input.pinned === true,
      createdAt: new Date(),
    };
    broadcasts.push(row);
    return { id: row.id };
  },
  updateBroadcastDraft(input: {
    id: string;
    senderId: string;
    title: string;
    body: string;
    presentation: TestPresentation;
    audience?: Audience;
    pinned?: boolean;
  }): boolean {
    const row = broadcasts.find(
      (b) =>
        b.id === input.id &&
        b.senderId === input.senderId &&
        b.publishedAt === null,
    );
    if (!row) return false;
    row.title = input.title;
    row.body = input.body;
    row.presentation = input.presentation;
    row.audience = input.audience ?? { scope: "everyone" };
    // A draft records the intent only. The real pin is set when it publishes,
    // through the same audited path a later Pin press uses.
    row.pinOnPublish = input.pinned === true;
    return true;
  },
  deleteBroadcastDraft(input: { id: string; senderId: string }): boolean {
    const idx = broadcasts.findIndex(
      (b) =>
        b.id === input.id &&
        b.senderId === input.senderId &&
        b.publishedAt === null,
    );
    if (idx === -1) return false;
    broadcasts.splice(idx, 1);
    return true;
  },
  publishBroadcast(input: {
    id: string;
    senderId: string;
  }): { ok: true; recipientCount: number } | { ok: false; error: string } {
    // Like the real claim, the write reads the sender's reach itself.
    const allowedTeams = testStore.senderReach(input.senderId);
    const row = broadcasts.find(
      (b) =>
        b.id === input.id &&
        b.senderId === input.senderId &&
        b.publishedAt === null &&
        isAllowedAudience(b.audience, allowedTeams),
    );
    if (!row) {
      return {
        ok: false,
        error: testStore.explainDraftRefusal({ ...input, allowedTeams }),
      };
    }
    row.publishedAt = new Date();
    if (row.pinOnPublish) {
      row.pinnedAt = new Date();
      row.pinnedBy = input.senderId;
      row.pinOnPublish = false;
    }
    const recipients = testStore.announcementRecipients(
      input.senderId,
      row.audience,
    );
    const payload = announcementNotification({
      broadcastId: row.id,
      title: row.title,
      body: row.body,
    });
    for (const u of recipients) {
      pushDelivery(payload, {
        userId: u.id,
        broadcastId: row.id,
        presentation: row.presentation,
      });
    }
    return { ok: true, recipientCount: recipients.length };
  },
  explainDraftRefusal(input: {
    id: string;
    senderId: string;
    allowedTeams?: readonly string[];
  }): string {
    const row = broadcasts.find((b) => b.id === input.id);
    if (!row) return DRAFT_MISSING;
    if (row.senderId !== input.senderId) return DRAFT_NOT_YOURS;
    if (row.publishedAt) return DRAFT_PUBLISHED;
    if (!isAllowedAudience(row.audience, input.allowedTeams)) {
      return DRAFT_TEAM_NOT_LED;
    }
    return DRAFT_MISSING;
  },
  /**
   * Who an announcement reaches: everyone but the sender, or this year's
   * members of one team but the sender. (The store has no approval filter for
   * "everyone"; production reaches approved members only.)
   */
  announcementRecipients(senderId: string, audience: Audience): TestUser[] {
    const everyone = [...usersByAuthId.values()].filter(
      (u) => u.id !== senderId,
    );
    if (audience.scope === "everyone") return everyone;
    const cycle = currentCycleNumber();
    // This year's leads of any team, or this year's members of one team —
    // the same year-scoped reads @camp404/db's resolveAudience makes.
    const chosen = new Set(
      teamMemberships
        .filter(
          (m) =>
            m.cycle === cycle &&
            (audience.scope === "team_leads"
              ? m.isLead
              : m.team === audience.team),
        )
        .map((m) => m.userId),
    );
    return everyone.filter((u) => chosen.has(u.id));
  },
  countAnnouncementAudience(
    senderId: string,
    audience: Audience = { scope: "everyone" },
  ): number {
    return testStore.announcementRecipients(senderId, audience).length;
  },

  // --- Pins --------------------------------------------------------------
  // Mirrors `listPinnedForUser` / `setAnnouncementPinned` in
  // @camp404/db/broadcasts, including the part that matters: the audience is
  // the DELIVERY, never a fresh resolution. A member with no delivery row for
  // a broadcast never sees its pin here either.

  listPinnedForUser(userId: string): PinnedAnnouncement[] {
    const mine = new Set(
      deliveries
        .filter((d) => d.userId === userId && d.broadcastId !== null)
        .map((d) => d.broadcastId as string),
    );
    // Every pin, not a top few, and ordered by the same `sortPinned` the real
    // read uses — a second ordering here is how the twin and the thing it
    // stands in for drift apart.
    return sortPinned(
      broadcasts
        .filter(
          (b) =>
            b.pinnedAt !== null && b.publishedAt !== null && mine.has(b.id),
        )
        .map((b) => ({
          id: b.id,
          title: b.title,
          publishedAt: b.publishedAt!,
          pinnedAt: b.pinnedAt!,
          pinnedByCaptain:
            b.pinnedBy !== null && findUserById(b.pinnedBy)?.rank === "captain",
        })),
    );
  },

  getAnnouncementPinContext(id: string): AnnouncementPinContext | null {
    const row = broadcasts.find((b) => b.id === id);
    if (!row) return null;
    return {
      audience: row.audience,
      published: row.publishedAt !== null,
      pinned: row.pinnedAt !== null,
    };
  },

  /**
   * Twin of `lockSenderReach` in @camp404/db/broadcasts: undefined for a
   * captain (every audience), else the teams they lead this year. The store is
   * one synchronous process, so there is no race to lock against.
   */
  senderReach(userId: string): readonly string[] | undefined {
    if (findUserById(userId)?.rank === "captain") return undefined;
    return testStore.getLeadTeams(userId);
  },

  setBroadcastPinned(input: {
    id: string;
    actorId: string;
    pinned: boolean;
  }): PinResult {
    const row = broadcasts.find((b) => b.id === input.id);
    if (!row) return { ok: false, error: PIN_MISSING };
    if (row.publishedAt === null) {
      return { ok: false, error: PIN_NOT_PUBLISHED };
    }
    if (
      !isAllowedAudience(row.audience, testStore.senderReach(input.actorId))
    ) {
      return { ok: false, error: PIN_TEAM_NOT_LED };
    }
    // Compare-and-set, like the real claim: the loser of a race is told.
    if ((row.pinnedAt !== null) === input.pinned) {
      return {
        ok: false,
        error: input.pinned ? PIN_ALREADY : PIN_ALREADY_OFF,
      };
    }
    row.pinnedAt = input.pinned ? new Date() : null;
    row.pinnedBy = input.pinned ? input.actorId : null;
    return { ok: true };
  },
  listBroadcasts(options: { senderId?: string } = {}): Array<{
    id: string;
    title: string;
    body: string;
    presentation: TestPresentation;
    audience: Audience;
    senderId: string | null;
    senderName: string | null;
    publishedAt: Date | null;
    pinnedAt: Date | null;
    pinOnPublish: boolean;
    createdAt: Date;
    recipientCount: number;
    acknowledgedCount: number;
    readCount: number;
  }> {
    return [...broadcasts]
      .filter((b) => !options.senderId || b.senderId === options.senderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((b) => {
        const own = deliveries.filter((d) => d.broadcastId === b.id);
        return {
          id: b.id,
          title: b.title,
          body: b.body,
          presentation: b.presentation,
          audience: b.audience,
          senderId: b.senderId,
          senderName: b.senderId
            ? (findUserById(b.senderId)?.displayName ?? null)
            : null,
          publishedAt: b.publishedAt,
          pinnedAt: b.pinnedAt,
          pinOnPublish: b.pinOnPublish,
          createdAt: b.createdAt,
          recipientCount: own.length,
          acknowledgedCount: own.filter((d) => d.acknowledgedAt !== null)
            .length,
          readCount: own.filter((d) => d.readAt !== null).length,
        };
      });
  },
  getPendingAcknowledgements(userId: string): Array<{
    deliveryId: string;
    title: string;
    body: string;
    senderName: string | null;
    createdAt: Date;
  }> {
    return deliveries
      .filter(
        (d) =>
          d.userId === userId &&
          d.presentation === "acknowledge" &&
          d.acknowledgedAt === null,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((d) => {
        const b = broadcasts.find((x) => x.id === d.broadcastId);
        return {
          deliveryId: d.id,
          title: d.title,
          body: d.body,
          senderName: b?.senderId
            ? (findUserById(b.senderId)?.displayName ?? null)
            : null,
          createdAt: d.createdAt,
        };
      });
  },
  countUnseenPopups(userId: string): number {
    return deliveries.filter(
      (d) =>
        d.userId === userId && d.presentation === "popup" && d.readAt === null,
    ).length;
  },
  claimPopups(userId: string): Array<{
    deliveryId: string;
    title: string;
    body: string;
    refType: string | null;
    refId: string | null;
    createdAt: Date;
  }> {
    const now = new Date();
    return deliveries
      .filter(
        (d) =>
          d.userId === userId &&
          d.presentation === "popup" &&
          d.readAt === null,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, 3)
      .map((d) => {
        d.readAt = now;
        return {
          deliveryId: d.id,
          title: d.title,
          body: d.body,
          refType: d.refType,
          refId: d.refId,
          createdAt: d.createdAt,
        };
      });
  },
  acknowledgeDelivery(input: { deliveryId: string; userId: string }): boolean {
    const d = deliveries.find(
      (x) =>
        x.id === input.deliveryId &&
        x.userId === input.userId &&
        x.presentation === "acknowledge" &&
        x.acknowledgedAt === null,
    );
    if (!d) return false;
    const now = new Date();
    d.acknowledgedAt = now;
    d.readAt = now;
    return true;
  },
  listInbox(
    userId: string,
    options: {
      before?: string | null;
      limit?: number;
      filter?: InboxFilter;
    } = {},
  ): {
    items: Array<{
      id: string;
      title: string;
      body: string;
      presentation: TestPresentation;
      senderName: string | null;
      readAt: Date | null;
      acknowledgedAt: Date | null;
      createdAt: Date;
      kind: NotificationKind;
      link: string;
    }>;
    nextCursor: string | null;
  } {
    // Production's cursor shape (microsecond timestamp ~ id), so the same
    // validation accepts it. The store's clock has milliseconds only.
    const cursorOf = (d: TestDelivery) =>
      `${d.createdAt.toISOString().slice(0, 23)}000~${d.id}`;
    const limit = options.limit ?? 30;
    // The tab narrows the SET the cursor walks, exactly as the SQL WHERE does,
    // so a page is a full page of matching rows rather than a page of anything
    // with the non-matching rows dropped.
    const filter = options.filter ?? "all";
    const sorted = deliveries
      .filter(
        (d) =>
          d.userId === userId &&
          (filter === "all" ||
            (filter === "unread"
              ? d.readAt === null
              : ANNOUNCEMENT_NOTIFICATION_KINDS.includes(
                  d.kind as (typeof ANNOUNCEMENT_NOTIFICATION_KINDS)[number],
                ))),
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
    let start = 0;
    if (options.before != null) {
      const at = sorted.findIndex((d) => cursorOf(d) === options.before);
      if (at === -1) return { items: [], nextCursor: null };
      start = at + 1;
    }
    const page = sorted.slice(start, start + limit);
    const hasMore = sorted.length > start + limit;
    return {
      items: page.map((d) => {
        const b = broadcasts.find((x) => x.id === d.broadcastId);
        return {
          id: d.id,
          title: d.title,
          body: d.body,
          presentation: d.presentation,
          senderName: b?.senderId
            ? (findUserById(b.senderId)?.displayName ?? null)
            : null,
          readAt: d.readAt,
          acknowledgedAt: d.acknowledgedAt,
          createdAt: d.createdAt,
          kind: d.kind,
          link: notificationLink(d.refType, d.refId),
        };
      }),
      nextCursor: hasMore && page.length ? cursorOf(page.at(-1)!) : null,
    };
  },
  /**
   * Twin of countUnread in @camp404/db/broadcasts, including its
   * `exceptActivationIds`: the notice of a questionnaire the caller already
   * counts as waiting is left out.
   */
  countUnread(
    userId: string,
    options: { exceptActivationIds?: readonly string[] } = {},
  ): number {
    const except = new Set(options.exceptActivationIds ?? []);
    return deliveries.filter(
      (d) =>
        d.userId === userId &&
        d.readAt === null &&
        !(
          d.refType === QUESTIONNAIRE_REF_TYPE &&
          d.refId !== null &&
          except.has(d.refId)
        ),
    ).length;
  },
  /** Twin of countUnreadByTeam in @camp404/db/broadcasts. */
  countUnreadByTeam(userId: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const d of deliveries) {
      if (d.userId !== userId || d.readAt !== null || !d.broadcastId) continue;
      const b = broadcasts.find((x) => x.id === d.broadcastId);
      if (b?.audience.scope !== "team") continue;
      out[b.audience.team] = (out[b.audience.team] ?? 0) + 1;
    }
    return out;
  },
  getAnnouncementForMember(
    userId: string,
    broadcastId: string,
  ): {
    deliveryId: string;
    title: string;
    body: string;
    presentation: TestPresentation;
    senderName: string | null;
    publishedAt: Date;
    acknowledgedAt: Date | null;
  } | null {
    // The delivery row is the permission, as in production.
    const d = deliveries.find(
      (x) =>
        x.userId === userId &&
        x.broadcastId === broadcastId &&
        x.kind === "announcement",
    );
    if (!d) return null;
    const b = broadcasts.find((x) => x.id === broadcastId);
    if (!b?.publishedAt) return null;
    return {
      deliveryId: d.id,
      title: d.title,
      body: d.body,
      presentation: d.presentation,
      senderName: b.senderId
        ? (findUserById(b.senderId)?.displayName ?? null)
        : null,
      publishedAt: b.publishedAt,
      acknowledgedAt: d.acknowledgedAt,
    };
  },
  markRead(userId: string, ids: string[]): void {
    if (ids.length === 0) return;
    const now = new Date();
    const idSet = new Set(ids);
    for (const d of deliveries) {
      if (d.userId === userId && d.readAt === null && idSet.has(d.id)) {
        d.readAt = now;
      }
    }
  },
  /**
   * Production's markAllRead: the caller's unread rows only, count returned —
   * and, like production, it leaves `presentation === "popup"` rows unread,
   * because for a pop-up `readAt` is the "was shown" mark that claimPopups
   * stamps, not a "was read" one.
   */
  markAllRead(userId: string): number {
    const now = new Date();
    let cleared = 0;
    for (const d of deliveries) {
      if (
        d.userId === userId &&
        d.readAt === null &&
        d.presentation !== "popup"
      ) {
        d.readAt = now;
        cleared += 1;
      }
    }
    return cleared;
  },
  /** Production's unreadClearableCount: what markAllRead would clear. */
  unreadClearableCount(userId: string): number {
    return deliveries.filter(
      (d) =>
        d.userId === userId && d.readAt === null && d.presentation !== "popup",
    ).length;
  },

  // --- Team memberships (mirrors @camp404/db/team-memberships) -------------
  // The three production operations, with production's semantics — not an
  // approximation. Until this existed the store hardcoded `isLead: false,
  // teams: []` and answered `isTeamLead` false for everyone, so the Playwright
  // `team_lead` persona had nothing to stand on: the harness documented a tier
  // it could not produce, which is how a stranded tier went unnoticed for so
  // long. A store that DISAGREES with the real backend would be worse still —
  // it makes e2e green while production is broken — so each operation below is
  // mirrored case for case from packages/db/src/team-memberships.ts (and
  // asserted against the real rules in lib/__tests__/test-store-teams.test.ts):
  //
  //   • year-scoped — every read and write resolves the store's OWN current
  //     cycle, and nothing takes a cycle from its caller;
  //   • `assignTeam` is idempotent and NEVER touches an existing row's lead
  //     flag, so a re-assignment cannot silently demote a lead;
  //   • `removeTeam` is idempotent and deletes only THIS year's row — last
  //     year's membership and lead flag stay on file forever;
  //   • `setLead` REFUSES a non-member (`not_a_member`) instead of creating the
  //     membership, and reports `changed: false` for a no-op.

  /** The year every team write is stamped with — exposed so specs can assert it. */
  currentCycleNumber(): number {
    return currentCycleNumber();
  },

  /** This year's memberships for one member, team-ordered (mirrors getTeamMemberships). */
  getTeamMemberships(userId: string): TeamMembership[] {
    const cycle = currentCycleNumber();
    return teamMemberships
      .filter((m) => m.userId === userId && m.cycle === cycle)
      .map((m) => ({ team: m.team, isLead: m.isLead, cycle: m.cycle }))
      .sort((a, b) => a.team.localeCompare(b.team));
  },

  /** Put a member on a team for THIS year. Idempotent; never sets the lead flag. */
  assignTeam(input: { userId: string; team: Team }): {
    created: boolean;
    cycle: number;
  } {
    const cycle = currentCycleNumber();
    // Mirrors the row's foreign key to `users`: a membership for a member who
    // does not exist is a failed write in production, not a silent success.
    if (!findUserById(input.userId)) {
      throw new Error(`No test user with id ${input.userId}`);
    }
    const existing = teamMemberships.find(
      (m) =>
        m.userId === input.userId && m.team === input.team && m.cycle === cycle,
    );
    if (existing) return { created: false, cycle };
    teamMemberships.push({
      userId: input.userId,
      team: input.team,
      isLead: false,
      cycle,
    });
    return { created: true, cycle };
  },

  /** Take a member off a team for THIS year. Idempotent; prior years survive. */
  removeTeam(input: { userId: string; team: Team }): {
    removed: boolean;
    cycle: number;
  } {
    const cycle = currentCycleNumber();
    const idx = teamMemberships.findIndex(
      (m) =>
        m.userId === input.userId && m.team === input.team && m.cycle === cycle,
    );
    if (idx === -1) return { removed: false, cycle };
    teamMemberships.splice(idx, 1);
    return { removed: true, cycle };
  },

  /** Set/clear the lead flag on a membership that already exists THIS year. */
  setLead(input: {
    userId: string;
    team: Team;
    isLead: boolean;
  }): SetLeadResult {
    const cycle = currentCycleNumber();
    const existing = teamMemberships.find(
      (m) =>
        m.userId === input.userId && m.team === input.team && m.cycle === cycle,
    );
    // Leading a team is a modifier on a membership, not a membership of its
    // own: a wrong id must not mint `team_lead` clearance through this control.
    if (!existing) return { ok: false, reason: "not_a_member" };
    if (existing.isLead === input.isLead) return { ok: true, changed: false };
    existing.isLead = input.isLead;
    return { ok: true, changed: true };
  },

  /**
   * Seed a membership in an ARBITRARY year — the mirror of the PGlite suite's
   * `makeMembership` factory, not a production path. Specs use it to put a
   * member on last year's team and prove this year's reads ignore it.
   */
  seedTeamMembership(input: {
    userId: string;
    team: Team;
    isLead?: boolean;
    cycle?: number;
  }): TestTeamMembership {
    if (!findUserById(input.userId)) {
      throw new Error(`No test user with id ${input.userId}`);
    }
    const row: TestTeamMembership = {
      userId: input.userId,
      team: input.team,
      isLead: input.isLead ?? false,
      cycle: input.cycle ?? currentCycleNumber(),
    };
    const idx = teamMemberships.findIndex(
      (m) =>
        m.userId === row.userId && m.team === row.team && m.cycle === row.cycle,
    );
    // (user_id, team, cycle) is the primary key: seeding the same triple twice
    // replaces the row rather than duplicating it.
    if (idx === -1) teamMemberships.push(row);
    else teamMemberships[idx] = row;
    return row;
  },

  /**
   * Whether this member leads ANY team this year — the derived, GLOBAL
   * `team_lead` clearance (owner-ratified: "it's a sitewide global role").
   * Mirrors @camp404/db/roster.isTeamLead.
   */
  isTeamLead(userId: string): boolean {
    const cycle = currentCycleNumber();
    return teamMemberships.some(
      (m) => m.userId === userId && m.isLead && m.cycle === cycle,
    );
  },

  /**
   * The teams this member leads this year, team-ordered. Clearance is global;
   * THIS is the per-team fact, and it governs audience only — it is what
   * `canSendToAudience` reads to decide which team a lead may send to.
   */
  getLeadTeams(userId: string): Team[] {
    return this.getTeamMemberships(userId)
      .filter((m) => m.isLead)
      .map((m) => m.team);
  },

  /**
   * Head count and lead count per team for THIS year, team-ordered — the twin
   * of @camp404/db/team-memberships.getTeamCoverage, so the Overview's coverage
   * rail renders under Playwright. Year-scoped like every other read here: a
   * membership seeded into another year is not part of this year's coverage.
   * Teams nobody is on are absent, exactly as the grouped query leaves them.
   */
  getTeamCoverage(): TeamCoverage[] {
    const cycle = currentCycleNumber();
    const byTeam = new Map<Team, { members: number; leads: number }>();
    for (const m of teamMemberships) {
      if (m.cycle !== cycle) continue;
      // The production query joins `users`, so a membership whose member is
      // gone is not counted; the store's writers keep the same invariant.
      if (!findUserById(m.userId)) continue;
      const entry = byTeam.get(m.team) ?? { members: 0, leads: 0 };
      entry.members += 1;
      if (m.isLead) entry.leads += 1;
      byTeam.set(m.team, entry);
    }
    return [...byTeam.entries()]
      .map(([team, counts]) => ({ team, ...counts, cycle }))
      .sort((a, b) => a.team.localeCompare(b.team));
  },

  /**
   * Everyone on one team THIS YEAR, leads first, then by name — the twin of
   * @camp404/db/team-memberships.listTeamPeople: no declined sign-up, and a
   * membership whose member is gone is not listed.
   */
  listTeamPeople(team: Team): TeamPerson[] {
    const cycle = currentCycleNumber();
    return teamMemberships
      .filter((m) => m.team === team && m.cycle === cycle)
      .flatMap((m) => {
        const user = findUserById(m.userId);
        if (!user || user.approvalStatus === "rejected") return [];
        return [
          {
            id: user.id,
            displayName: user.displayName?.trim() || "Unnamed burner",
            handle: user.telegramHandle,
            rank: user.rank,
            isLead: m.isLead,
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(b.isLead) - Number(a.isLead) ||
          a.displayName.localeCompare(b.displayName) ||
          a.id.localeCompare(b.id),
      );
  },

  // The family tree's referral list: every user with the id of whoever made
  // the invite code they redeemed, by name, as @camp404/db/relations does.
  getReferralRoster(): ReferralUser[] {
    return [...usersByAuthId.values()]
      .map((user) => ({
        id: user.id,
        displayName: user.displayName,
        rank: user.rank,
        inviteCode: user.inviteCode,
        inviterId: user.inviteCode
          ? (inviteCodes.get(user.inviteCode)?.createdByUserId ?? null)
          : null,
      }))
      .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
  },

  // --- Who is coming this year (mirrors @camp404/db/participations) -----

  /** A member's own row for one year, or null when they have not answered. */
  getParticipation(userId: string, cycle: number): TestParticipation | null {
    const row = participations.get(participationKey(userId, cycle));
    return row ? { ...row } : null;
  },

  /**
   * A member's Yes / Maybe / No, by the same rule as production
   * (participationAfterIntent). The withdrawal audit row is not modelled: the
   * store keeps no audit log.
   */
  applyParticipationIntent(input: {
    userId: string;
    cycle: number;
    intent: ParticipationIntent;
    now?: Date;
  }): ParticipationIntentResult {
    if (!findUserById(input.userId)) {
      throw new Error(`No test user with id ${input.userId}`);
    }
    const now = input.now ?? new Date();
    const key = participationKey(input.userId, input.cycle);
    const row = participations.get(key);
    const change = participationAfterIntent(row?.status ?? null, input.intent);
    if (!row) {
      // Every answer from no row writes one, so `change` is never null here.
      participations.set(key, {
        userId: input.userId,
        cycle: input.cycle,
        status: change!.next,
        intent: input.intent,
        decidedByUserId: null,
        decidedAt: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });
      return {
        status: change!.next,
        changed: true,
        answerChanged: true,
        withdrew: false,
      };
    }
    const answerChanged = row.intent !== input.intent;
    if (change || answerChanged) {
      row.intent = input.intent;
      if (change) row.status = change.next;
      row.updatedAt = now;
    }
    return {
      status: row.status,
      changed: change !== null,
      answerChanged,
      withdrew: change?.withdrew ?? false,
    };
  },

  /**
   * A captain's Accept / Waiting list for THIS year: the same compare-and-set
   * as production (false when the row is no longer at `from`), without the
   * audit row. A move that is not a decision throws.
   */
  decideParticipation(input: {
    userId: string;
    from: ParticipationStatus;
    to: ParticipationStatus;
    decidedByUserId: string;
  }): boolean {
    if (!isParticipationDecision(input.from, input.to)) {
      throw new Error(
        `decideParticipation: ${input.from} -> ${input.to} is not a decision`,
      );
    }
    const row = participations.get(
      participationKey(input.userId, currentCycleNumber()),
    );
    if (!row || row.status !== input.from) return false;
    const now = new Date();
    row.status = input.to;
    row.decidedByUserId = input.decidedByUserId;
    row.decidedAt = now;
    row.reason = null;
    row.updatedAt = now;
    return true;
  },

  /**
   * Put a member at any status for a year (this year unless `cycle` is
   * given): a fixture, not a production path. Replaces an existing row, as
   * the primary key would.
   */
  seedParticipation(input: {
    userId: string;
    status: ParticipationStatus;
    /** The member's own answer; defaults to the one the status stands for. */
    intent?: ParticipationIntent;
    cycle?: number;
  }): TestParticipation {
    if (!findUserById(input.userId)) {
      throw new Error(`No test user with id ${input.userId}`);
    }
    const now = new Date();
    const row: TestParticipation = {
      userId: input.userId,
      cycle: input.cycle ?? currentCycleNumber(),
      status: input.status,
      intent: input.intent ?? INTENT_IMPLIED_BY_STATUS[input.status],
      decidedByUserId: null,
      decidedAt: null,
      reason: null,
      createdAt: now,
      updatedAt: now,
    };
    participations.set(participationKey(row.userId, row.cycle), row);
    return { ...row };
  },

  // Camp-management roster (mirrors @camp404/db/roster.getCampManagementRoster).
  // The test store models users, burner profiles, team memberships, the
  // payments ledger and the required_actions twin, but not driver profiles, so
  // those facets still default (false) — enough for the captain roster to
  // render in E2E without touching Neon. `duesPaid` is this year's ledger with
  // the real query's rule: any payment received or waived. What a member still owes comes from
  // `requiredActions` with the real query's predicate (pending AND blocking,
  // oldest first), so the count and the named list agree.
  // `isLead` and `teams` come from the membership rows and are year-scoped, the
  // same two facts the real query aggregates out of `team_memberships`.
  getCampManagementRoster(
    options: { includeEmail?: boolean } = {},
  ): CampManagementMember[] {
    const cycle = currentCycleNumber();
    const thisYear = teamMemberships.filter((m) => m.cycle === cycle);
    const settled = new Set(
      payments
        .filter((p) => p.cycle === cycle && paymentSettlesDues(p.status))
        .map((p) => p.userId),
    );
    return Array.from(usersByAuthId.values())
      .map((u): CampManagementMember => {
        const mine = thisYear.filter((m) => m.userId === u.id);
        const owed = this.getPendingRequiredActions(u.id);
        const profile = profilesByUserId.get(u.id) ?? null;
        const country =
          profile && typeof profile.responses["country"] === "string"
            ? (profile.responses["country"] as string)
            : null;
        return {
          id: u.id,
          displayName: u.displayName,
          handle: u.telegramHandle,
          rank: u.rank,
          approvalStatus: u.approvalStatus,
          isLead: mine.some((m) => m.isLead),
          teams: mine.map((m) => m.team).sort((a, b) => a.localeCompare(b)),
          duesPaid: settled.has(u.id),
          membershipTier: null,
          onboardingComplete: profile?.completedAt != null,
          pendingRequiredActions: owed.length,
          pendingRequiredActionItems: owed.map((a) => ({
            key: a.actionKey,
            title: a.title,
          })),
          intendsToDrive: false,
          driverProfileComplete: false,
          country,
          participation:
            participations.get(participationKey(u.id, cycle))?.status ?? null,
          // The test store keeps no sign-in email for a member.
          ...(options.includeEmail ? { email: null } : {}),
          createdAt: u.createdAt,
        };
      })
      .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
  },

  // The captain member panel's detail read (mirrors
  // @camp404/db/roster.getCampMemberDetail), so Playwright can open a member.
  // The store keeps no ID ciphertext, sign-in email or driver profile, so those
  // come back null when asked for, never absent: the shape a captain gets.
  getCampMemberDetail(
    userId: string,
    options: CampMemberDetailOptions = {},
  ): CampMemberDetail | null {
    const u = this.findUserById(userId);
    if (!u) return null;
    const profile = profilesByUserId.get(u.id) ?? null;
    const invite = u.inviteCode
      ? (inviteCodes.get(u.inviteCode) ?? null)
      : null;
    const nameOf = (id: string | null) =>
      id ? (this.findUserById(id)?.displayName ?? null) : null;
    return {
      id: u.id,
      displayName: u.displayName,
      rank: u.rank,
      approvalStatus: u.approvalStatus,
      approvalDecidedAt: u.approvalDecidedAt,
      approvalDecidedByName: nameOf(u.approvalDecidedByUserId),
      onboardingComplete: profile?.completedAt != null,
      onboardingVersion: profile?.version ?? null,
      responses: profile?.responses ?? {},
      ...(options.includeIdDocuments
        ? { passportEncrypted: null, saIdEncrypted: null }
        : {}),
      ...(options.includeEmail ? { email: null } : {}),
      ...(options.includeArrival ? { arrivalAt: null } : {}),
      inviteCode: u.inviteCode,
      inviteNote: invite?.note ?? null,
      invitedByName: nameOf(invite?.createdByUserId ?? null),
      // The store keeps no setup latch, so it has no founder to name.
      isFounder: false,
      createdAt: u.createdAt,
    };
  },
  /**
   * Twin of listMemberQuestionnaireGates: the member's questionnaire gates,
   * oldest first. Every store row is a questionnaire gate with no send behind
   * it, which the real query keeps whatever its status. Ties on `createdAt`
   * keep insertion order (the sort is stable), which stands in for the real
   * query's `id` tie-break.
   */
  listMemberQuestionnaireGates(userId: string) {
    return requiredActions
      .filter((a) => a.userId === userId && a.type === "questionnaire")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((a) => ({
        actionKey: a.actionKey,
        title: a.title,
        status: a.status,
        blocking: a.blocking,
        dueAt: a.dueAt,
        completedAt: a.completedAt,
        createdAt: a.createdAt,
      }));
  },

  // --- captain-promotion handshake (mirrors @camp404/db/captain-promotion) ---

  getOpenPromotionForTarget(targetUserId: string): TestPromotionRequest | null {
    return (
      promotionRequests.find(
        (r) => r.targetUserId === targetUserId && r.status === "sent",
      ) ?? null
    );
  },
  getPromotionRequestById(requestId: string): TestPromotionRequest | null {
    return promotionRequests.find((r) => r.id === requestId) ?? null;
  },
  sendCaptainPromotion(input: {
    targetUserId: string;
    requestedByUserId: string;
  }): TestPromotionRequest {
    // Idempotent via the open-per-target rule (the db's partial unique index).
    // Single-threaded test store: no concurrent-send race is possible, so the
    // pre-check suffices (the db additionally catches the unique-violation).
    const existing = this.getOpenPromotionForTarget(input.targetUserId);
    if (existing) return existing;
    const row: TestPromotionRequest = {
      id: crypto.randomUUID(),
      targetUserId: input.targetUserId,
      requestedByUserId: input.requestedByUserId,
      status: "sent",
      createdAt: new Date(),
      decidedAt: null,
    };
    promotionRequests.push(row);
    // As in production: a new request tells the target who asked.
    pushDelivery(
      captainPromotionNotification({
        requestId: row.id,
        requesterName:
          findUserById(input.requestedByUserId)?.displayName ?? null,
      }),
      { userId: input.targetUserId, broadcastId: null, presentation: "popup" },
    );
    return row;
  },
  acceptCaptainPromotion(input: {
    requestId: string;
    actorUserId: string;
  }): TestPromotionRequest | null {
    // Production does the flip and the rank write in one transaction; the store
    // does both or neither.
    const row = testStore.decideCaptainPromotion({
      requestId: input.requestId,
      status: "accepted",
      actorUserId: input.actorUserId,
    });
    if (!row) return null;
    testStore.setUserRank(input.actorUserId, "captain");
    return row;
  },
  decideCaptainPromotion(input: {
    requestId: string;
    status: "accepted" | "declined" | "cancelled";
    actorUserId?: string;
  }): TestPromotionRequest | null {
    // Only a `sent` row with both participants still present flips — so a
    // double-decide (or a row orphaned by a hard delete) is a no-op (null),
    // mirroring the db's status + IS NOT NULL WHERE clause. When `actorUserId` is
    // given, also bind the actor to their side (cancel→requester, accept/decline
    // →target), mirroring the db's atomic actor predicate.
    const row = promotionRequests.find(
      (r) =>
        r.id === input.requestId &&
        r.status === "sent" &&
        r.targetUserId !== null &&
        r.requestedByUserId !== null &&
        (input.actorUserId === undefined ||
          (input.status === "cancelled"
            ? r.requestedByUserId === input.actorUserId
            : r.targetUserId === input.actorUserId)),
    );
    if (!row) return null;
    row.status = input.status;
    row.decidedAt = new Date();
    return row;
  },
  getIncomingPromotionsForUser(userId: string): IncomingPromotionRequest[] {
    return promotionRequests
      .filter(
        (r): r is TestPromotionRequest & { requestedByUserId: string } =>
          r.targetUserId === userId &&
          r.status === "sent" &&
          // Mirror the db INNER JOIN on users: a null (orphaned) requester drops
          // out of the incoming list rather than surfacing a nameless row.
          r.requestedByUserId !== null,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        requestedByUserId: r.requestedByUserId,
        requestedByName: findUserById(r.requestedByUserId)?.displayName ?? null,
        status: r.status,
        createdAt: r.createdAt,
      }));
  },

  // --- The task board: twins of @camp404/db/tasks, same rules, same words ---

  listBoardTasks(now: Date): BoardTask[] {
    const doneSince = now.getTime() - DONE_VISIBLE_DAYS * 86_400_000;
    const name = (id: string | null) =>
      id ? (findUserById(id)?.displayName ?? null) : null;
    return tasks
      .filter(
        (t) =>
          t.status === "open" ||
          t.status === "in_progress" ||
          (t.status === "done" && (t.completedAt?.getTime() ?? 0) >= doneSince),
      )
      .sort(
        (a, b) =>
          (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        team: t.team,
        status: t.status as TaskBoardStatus,
        assigneeId: t.assigneeId,
        assigneeName: name(t.assigneeId),
        createdById: t.createdById,
        createdByName: name(t.createdById),
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        version: t.version,
      }));
  },

  listMyOpenTasks(
    userId: string,
    limit = 5,
  ): { items: MyOpenTask[]; total: number } {
    const mine = tasks
      .filter(
        (t) =>
          t.assigneeId === userId &&
          (t.status === "open" || t.status === "in_progress"),
      )
      .sort(
        (a, b) =>
          (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    return {
      items: mine.slice(0, limit).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status as MyOpenTask["status"],
        team: t.team,
        dueAt: t.dueAt,
      })),
      total: mine.length,
    };
  },

  listAssignableMembers(): AssignableMember[] {
    return [...usersByAuthId.values()]
      .filter((u) => u.approvalStatus === "approved")
      .map((u) => ({
        id: u.id,
        displayName: u.displayName ?? "Unnamed member",
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  addTask(input: {
    creatorId: string;
    title: string;
    description: string | null;
    team: Team | null;
    assigneeId: string | null;
    dueAt: Date | null;
  }): TaskWriteResult<{ id: string }> {
    const reach = testStore.senderReach(input.creatorId);
    if (reach !== undefined) {
      if (reach.length === 0) return { ok: false, error: NOT_A_TASK_AUTHOR };
      if (!input.team) return { ok: false, error: PICK_YOUR_TEAM };
      if (!reach.includes(input.team)) {
        return { ok: false, error: NOT_YOUR_TEAM };
      }
    }
    if (
      input.assigneeId &&
      findUserById(input.assigneeId)?.approvalStatus !== "approved"
    ) {
      return { ok: false, error: NOT_A_MEMBER };
    }
    const id = `test-task-${S.nextSerial++}`;
    tasks.push({
      id,
      title: input.title,
      description: input.description,
      team: input.team,
      status: "open",
      assigneeId: input.assigneeId,
      createdById: input.creatorId,
      dueAt: input.dueAt,
      createdAt: new Date(),
      completedAt: null,
      version: 1,
    });
    return { ok: true, id };
  },

  editTask(input: {
    taskId: string;
    actorId: string;
    version: number;
    title: string;
    description: string | null;
    team: Team | null;
    assigneeId: string | null;
    dueAt: Date | null;
    activeTeams: readonly Team[];
  }): TaskWriteResult {
    const task = tasks.find(
      (t) => t.id === input.taskId && t.status !== "cancelled",
    );
    if (!task) return { ok: false, error: TASK_GONE };
    const reach = testStore.senderReach(input.actorId);
    const leads =
      reach === undefined || (task.team !== null && reach.includes(task.team));
    if (!leads && task.createdById !== input.actorId) {
      return { ok: false, error: CANNOT_EDIT };
    }
    if (input.team !== task.team) {
      if (reach !== undefined) {
        if (!input.team) return { ok: false, error: PICK_YOUR_TEAM };
        if (!reach.includes(input.team)) {
          return { ok: false, error: NOT_YOUR_TEAM_TO_MOVE };
        }
      }
      if (input.team && !input.activeTeams.includes(input.team)) {
        return { ok: false, error: TEAM_NOT_ACTIVE };
      }
    }
    if (
      input.assigneeId &&
      input.assigneeId !== task.assigneeId &&
      findUserById(input.assigneeId)?.approvalStatus !== "approved"
    ) {
      return { ok: false, error: NOT_A_MEMBER };
    }
    if (task.version !== input.version)
      return { ok: false, error: TASK_EDITED };
    task.title = input.title;
    task.description = input.description;
    task.team = input.team;
    task.assigneeId = input.assigneeId;
    task.dueAt = input.dueAt;
    task.version += 1;
    return { ok: true };
  },

  moveTask(input: {
    taskId: string;
    actorId: string;
    from: TaskBoardStatus;
    to: TaskBoardStatus;
  }): TaskWriteResult {
    const task = tasks.find(
      (t) => t.id === input.taskId && t.status !== "cancelled",
    );
    if (!task) return { ok: false, error: TASK_GONE };
    const reach = testStore.senderReach(input.actorId);
    const leads =
      reach === undefined || (task.team !== null && reach.includes(task.team));
    if (
      !leads &&
      task.assigneeId !== input.actorId &&
      task.createdById !== input.actorId
    ) {
      return { ok: false, error: CANNOT_MOVE };
    }
    if (input.from === input.to) return { ok: true };
    if (task.status !== input.from) return { ok: false, error: TASK_MOVED };
    task.status = input.to;
    task.completedAt = input.to === "done" ? new Date() : null;
    return { ok: true };
  },

  removeTask(input: { taskId: string; actorId: string }): TaskWriteResult {
    const task = tasks.find(
      (t) => t.id === input.taskId && t.status !== "cancelled",
    );
    if (!task) return { ok: false, error: TASK_GONE };
    const reach = testStore.senderReach(input.actorId);
    const leads =
      reach === undefined || (task.team !== null && reach.includes(task.team));
    if (!leads && task.createdById !== input.actorId) {
      return { ok: false, error: CANNOT_REMOVE };
    }
    task.status = "cancelled";
    return { ok: true };
  },

  /**
   * Twin of the Google read (getUpcomingEvents): the next events from now up to
   * `range.days` ahead (Home: CALENDAR_WINDOW_DAYS), soonest first, at most
   * `range.max` (Home: CALENDAR_MAX_EVENTS). An all-day event counts for its
   * whole camp day.
   */
  listCalendarEvents(
    now: Date,
    range: CalendarRange = {
      days: CALENDAR_WINDOW_DAYS,
      max: CALENDAR_MAX_EVENTS,
    },
  ): { status: "ok"; events: CalendarEvent[] } {
    const until = now.getTime() + range.days * 86_400_000;
    const events = calendarEvents
      .filter((e) => {
        const ends = e.allDay
          ? campDayStart(nextCampDay(e.start)).getTime()
          : e.startsAt.getTime();
        return ends > now.getTime() && e.startsAt.getTime() <= until;
      })
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, range.max)
      .map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        allDay: e.allDay,
        location: e.location,
        teamTag: e.teamTag,
      }));
    return { status: "ok", events };
  },

  /**
   * Twin of addCampCalendarEvent: the same reach rule, then the event, titled
   * as Google would hold it ("Kitchen Team - Briefing") with its team key as
   * the private property.
   */
  addCalendarEvent(input: {
    actorId: string;
    team: Team | null;
    teamLabel: string | null;
    title: string;
    date: string;
    allDay: boolean;
    start?: string;
  }): AddCalendarEventResult {
    const refusal = calendarEventRefusal(
      testStore.senderReach(input.actorId),
      input.team,
    );
    if (refusal) return { ok: false, error: refusal };
    const id = `test-event-${S.nextSerial++}`;
    const start = input.allDay
      ? input.date
      : `${input.date}T${input.start ?? "00:00"}:00+02:00`;
    calendarEvents.push({
      id,
      title: teamEventTitle(input.teamLabel, input.title),
      start,
      allDay: input.allDay,
      location: null,
      teamTag: input.team,
      startsAt: input.allDay ? campDayStart(input.date) : new Date(start),
      createdById: input.actorId,
    });
    return { ok: true, eventId: id };
  },

  // --- payments ledger (mirrors @camp404/db/payments) -----------------------
  // The same rules as the real ledger, asserted case for case in
  // lib/__tests__/test-store-payments.test.ts: any currency but ZAR is
  // refused before anything is written, references are the member's
  // reference, the year and their count that year, a status moves only from
  // the one the captain saw, and money received is a plain rand total. The
  // store keeps no audit log, so the captain's id stops at `recordedByUserId`.

  /** The member's payment reference, giving them the next one first. */
  ensureMemberRefCode(userId: string): string | null {
    if (!findUserById(userId)) return null;
    const existing = memberRefCodes.get(userId);
    if (existing) return existing;
    // Codes are never taken back (only reset() clears them), so the count is
    // the sequence.
    const code = formatMemberRefCode(memberRefCodes.size + 1);
    memberRefCodes.set(userId, code);
    return code;
  },

  /** Record a payment for this year (mirrors recordPayment). */
  recordPayment(input: RecordPaymentInput): { id: string; reference: string } {
    if (!isCurrency(input.currency)) {
      throw new UnknownCurrencyError(input.currency);
    }
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
      throw new Error(
        "recordPayment: the amount must be whole cents, not negative",
      );
    }
    const refCode = this.ensureMemberRefCode(input.userId);
    if (!refCode) throw new Error("recordPayment: no such member");
    const cycle = currentCycleNumber();
    const count = payments.filter(
      (p) => p.userId === input.userId && p.cycle === cycle,
    ).length;
    const now = new Date();
    const row: TestPayment = {
      id: `test-payment-${S.nextSerial++}`,
      userId: input.userId,
      cycle,
      amountCents: input.amountCents,
      currency: input.currency,
      reference: paymentReference(refCode, cycle, count + 1),
      status: input.status,
      note: input.note?.trim() || null,
      recordedByUserId: input.recordedByUserId,
      createdAt: now,
      updatedAt: now,
    };
    payments.push(row);
    return { id: row.id, reference: row.reference };
  },

  /** Compare-and-set on `from` (mirrors setPaymentStatus): false when it moved. */
  setPaymentStatus(input: {
    paymentId: string;
    from: PaymentStatus;
    to: PaymentStatus;
  }): boolean {
    if (input.from === input.to) return false;
    const row = payments.find(
      (p) => p.id === input.paymentId && p.status === input.from,
    );
    if (!row) return false;
    row.status = input.to;
    row.updatedAt = new Date();
    return true;
  },

  /** Every payment in one burn year, newest first (mirrors listPayments). */
  listPayments(cycle: number): PaymentRow[] {
    // Newest first; a later insert wins a tie on the clock, as the real
    // query's id tie-break settles one.
    return payments
      .map((p, order) => ({ p, order }))
      .filter(({ p }) => p.cycle === cycle && findUserById(p.userId))
      .sort(
        (a, b) =>
          b.p.createdAt.getTime() - a.p.createdAt.getTime() ||
          b.order - a.order,
      )
      .map(({ p }) => ({
        id: p.id,
        userId: p.userId,
        memberName: findUserById(p.userId)?.displayName ?? null,
        memberRefCode: memberRefCodes.get(p.userId) ?? null,
        cycle: p.cycle,
        amountCents: p.amountCents,
        currency: p.currency,
        reference: p.reference,
        status: p.status,
        note: p.note,
        recordedByName: p.recordedByUserId
          ? (findUserById(p.recordedByUserId)?.displayName ?? null)
          : null,
        createdAt: p.createdAt,
      }));
  },

  /** Rands received in one year, in cents (mirrors receivedTotal). */
  receivedTotal(cycle: number): number {
    return sumMinor(
      payments
        .filter((p) => p.cycle === cycle && p.status === "reconciled")
        .map((p) => p.amountCents),
    );
  },

  // --- Power and fuel (#253, #254): twins of @camp404/db/power ------------

  listPowerLoads(cycle?: number): PowerLoadRow[] {
    return loadsOf(cycle ?? currentCycleNumber()).map((l) => ({ ...l }));
  },

  getPowerPlan(cycle?: number): PowerPlan {
    const year = cycle ?? currentCycleNumber();
    const row = powerPlans.get(year);
    return row
      ? { ...row }
      : { ...DEFAULT_POWER_PLAN, cycle: year, updatedAt: null };
  },

  listGenerators(): GeneratorRow[] {
    return generators
      .filter((g) => g.archivedAt === null)
      .sort(
        (a, b) =>
          a.model.localeCompare(b.model) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((g) => ({ ...g }));
  },

  getGenerator(id: string): GeneratorRow | null {
    const gen = generators.find((g) => g.id === id);
    return gen ? { ...gen } : null;
  },

  listPowerInventory(): PowerInventoryItem[] {
    return [...powerInventory]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({ ...i }));
  },

  /** Seeds inventory items for the "From inventory" helper (E2E only). */
  seedPowerInventory(
    items: readonly Omit<PowerInventoryItem, "id">[],
  ): PowerInventoryItem[] {
    const made = items.map((item) => ({ ...item, id: crypto.randomUUID() }));
    powerInventory.push(...made);
    return made;
  },

  previousLoadCycle(): number | null {
    return previousStoreLoadCycle(currentCycleNumber());
  },

  previousPlanCycle(): number | null {
    return previousStorePlanCycle(currentCycleNumber());
  },

  addPowerLoad(
    input: LoadInput & { actorId: string },
  ): PowerWriteResult<{ id: string }> {
    return powerWrite(input.actorId, (cycle) => {
      if (inventoryItemGone(input.inventoryItemId)) return INVENTORY_ITEM_GONE;
      const mine = powerLoads.filter((l) => l.cycle === cycle);
      const now = new Date();
      const row: PowerLoadRow = {
        ...powerLoadFields(input),
        id: crypto.randomUUID(),
        cycle,
        sort: mine.length > 0 ? Math.max(...mine.map((l) => l.sort)) + 1 : 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      powerLoads.push(row);
      return { id: row.id };
    });
  },

  updatePowerLoad(
    input: EditLoadInput & { actorId: string },
  ): PowerWriteResult {
    return powerWrite(input.actorId, (cycle) => {
      if (inventoryItemGone(input.inventoryItemId)) return INVENTORY_ITEM_GONE;
      const row = powerLoads.find(
        (l) =>
          l.id === input.loadId &&
          l.cycle === cycle &&
          l.version === input.expectedVersion,
      );
      if (!row) return loadLoss(input.loadId, cycle);
      Object.assign(row, powerLoadFields(input), {
        version: row.version + 1,
        updatedAt: new Date(),
      });
      return {};
    });
  },

  removePowerLoad(input: {
    actorId: string;
    loadId: string;
    expectedVersion: number;
  }): PowerWriteResult {
    return powerWrite(input.actorId, (cycle) => {
      const i = powerLoads.findIndex(
        (l) =>
          l.id === input.loadId &&
          l.cycle === cycle &&
          l.version === input.expectedVersion,
      );
      if (i === -1) return loadLoss(input.loadId, cycle);
      powerLoads.splice(i, 1);
      return {};
    });
  },

  copyLastYearLoads(input: {
    actorId: string;
  }): PowerWriteResult<{ count: number }> {
    return powerWrite(input.actorId, (cycle) => {
      if (powerLoads.some((l) => l.cycle === cycle)) return ALREADY_HAS_LOADS;
      const from = previousStoreLoadCycle(cycle);
      if (from === null) return NOTHING_TO_COPY;
      const rows = loadsOf(from);
      const now = new Date();
      rows.forEach((row, i) => {
        powerLoads.push({
          ...row,
          windows: row.windows ? row.windows.map((w) => ({ ...w })) : null,
          inventoryItemId: inventoryItemGone(row.inventoryItemId)
            ? null
            : row.inventoryItemId,
          id: crypto.randomUUID(),
          cycle,
          sort: i,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      });
      return { count: rows.length };
    });
  },

  setPowerPlan(input: {
    actorId: string;
    patch: Partial<PowerPlanSettings>;
    expectedVersion: number;
  }): PowerWriteResult<{ version: number }> {
    return powerWrite(input.actorId, (cycle) => {
      const patch = planPatch(input.patch);
      const existing = powerPlans.get(cycle);
      if (input.expectedVersion === 0) {
        const refusal = planGeneratorRefusal(patch.generatorId, null);
        if (refusal) return refusal;
        if (existing) return PLAN_CHANGED;
        powerPlans.set(cycle, {
          ...DEFAULT_POWER_PLAN,
          ...patch,
          cycle,
          version: 1,
          updatedAt: new Date(),
        });
        return { version: 1 };
      }
      const refusal = planGeneratorRefusal(
        patch.generatorId,
        existing?.generatorId ?? null,
      );
      if (refusal) return refusal;
      if (!existing || existing.version !== input.expectedVersion) {
        return PLAN_CHANGED;
      }
      const version = existing.version + 1;
      powerPlans.set(cycle, {
        ...existing,
        ...patch,
        version,
        updatedAt: new Date(),
      });
      return { version };
    });
  },

  copyLastYearPlan(input: {
    actorId: string;
  }): PowerWriteResult<{ fromCycle: number }> {
    return powerWrite(input.actorId, (cycle) => {
      if (powerPlans.has(cycle)) return ALREADY_HAS_PLAN;
      const fromCycle = previousStorePlanCycle(cycle);
      if (fromCycle === null) return NOTHING_TO_COPY;
      const from = powerPlans.get(fromCycle)!;
      const gen = generators.find((g) => g.id === from.generatorId);
      powerPlans.set(cycle, {
        ...from,
        cycle,
        generatorId: gen && gen.archivedAt === null ? gen.id : null,
        firstPoweredDay: null,
        version: 1,
        updatedAt: new Date(),
      });
      return { fromCycle };
    });
  },

  addGenerator(
    input: GeneratorInput & { actorId: string },
  ): PowerWriteResult<{ id: string }> {
    return powerWrite(input.actorId, () => {
      if (inventoryItemGone(input.inventoryItemId)) return INVENTORY_ITEM_GONE;
      const now = new Date();
      const row: GeneratorRow = {
        ...generatorFields(input),
        id: crypto.randomUUID(),
        archivedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      generators.push(row);
      return { id: row.id };
    });
  },

  updateGenerator(
    input: EditGeneratorInput & { actorId: string },
  ): PowerWriteResult {
    return powerWrite(input.actorId, () => {
      if (inventoryItemGone(input.inventoryItemId)) return INVENTORY_ITEM_GONE;
      const gen = generators.find((g) => g.id === input.generatorId);
      if (!gen || gen.archivedAt !== null) return GENERATOR_GONE;
      if (gen.version !== input.expectedVersion) return GENERATOR_CHANGED;
      Object.assign(gen, generatorFields(input), {
        version: gen.version + 1,
        updatedAt: new Date(),
      });
      return {};
    });
  },

  archiveGenerator(input: {
    actorId: string;
    generatorId: string;
  }): PowerWriteResult {
    return powerWrite(input.actorId, () => {
      const gen = generators.find((g) => g.id === input.generatorId);
      if (!gen || gen.archivedAt !== null) return GENERATOR_GONE;
      const now = new Date();
      Object.assign(gen, {
        archivedAt: now,
        version: gen.version + 1,
        updatedAt: now,
      });
      return {};
    });
  },

  // --- Recipes: twins of @camp404/db/recipes, same rules, same words --------
  // The store is one synchronous process, so every check runs before the
  // first change and a refusal leaves nothing behind, as the real rollback
  // does. The rules come from the same places: canApproveRecipe and
  // canRunProofread in core, and textBlockedReason from @camp404/db/recipes.

  /** This year's meal plan, or a given year's (the twin of getMealPlan). */
  getMealPlan(cycle?: number): MealPlan {
    return storeMealPlan(cycle ?? currentCycleNumber());
  },

  /**
   * Save this year's meal plan (the twin of setMealPlan): a captain or a
   * Kitchen lead, compare-and-set on version, audited.
   */
  setMealPlan(input: MealPlanSave): MealPlanWriteResult<{ version: number }> {
    const parsed = MealPlanInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_MEAL_PLAN,
      };
    }
    if (!isKitchenReviewer(input.actorId)) {
      return { ok: false, error: NOT_A_MEAL_PLAN_EDITOR };
    }
    const { daysOnSite, firstDay, days, expectedVersion } = parsed.data;
    const cycle = currentCycleNumber();
    const before = storeMealPlan(cycle);
    if (before.version !== expectedVersion) {
      return { ok: false, error: MEAL_PLAN_CHANGED };
    }
    const version = expectedVersion + 1;
    S.mealPlans.set(cycle, {
      cycle,
      daysOnSite,
      firstDay,
      days: days.map((d) => ({ ...d })),
      version,
      updatedAt: new Date(),
    });
    recipeHistory.push({
      recipeId: null,
      action: "camp.kitchen_meal_plan.changed",
      actorId: input.actorId,
      metadata: {
        cycle,
        version,
        before: {
          daysOnSite: before.daysOnSite,
          firstDay: before.firstDay,
          days: before.days,
        },
        after: { daysOnSite, firstDay, days },
      },
      createdAt: new Date(),
    });
    return { ok: true, version };
  },

  /**
   * This year's join page for the editor (the twin of getJoinPageForEditor):
   * a year with no page opens on the newest earlier year's draft.
   */
  getJoinPageForEditor(): JoinPage {
    const cycle = currentCycleNumber();
    const page = S.joinPages.get(cycle);
    if (page) return { ...page };
    const earlier = [...S.joinPages.values()]
      .filter((p) => p.cycle < cycle)
      .sort((a, b) => b.cycle - a.cycle)[0];
    return {
      cycle,
      draft: earlier?.draft ?? "",
      published: null,
      publishedAt: null,
      version: 0,
      updatedAt: null,
      startedFrom: earlier?.cycle ?? null,
    };
  },

  /**
   * Save this year's join page, publishing it too when asked (the twin of
   * saveJoinPage): a captain only, compare-and-set on version.
   */
  saveJoinPage(
    input: { actorId: string } & JoinPageSave,
  ): JoinPageWriteResult<{ version: number; cycle: number }> {
    const parsed = JoinPageSave.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? CHECK_JOIN_PAGE,
      };
    }
    if (findUserById(input.actorId)?.rank !== "captain") {
      return { ok: false, error: NOT_A_JOIN_PAGE_EDITOR };
    }
    const { markdown, expectedVersion, publish } = parsed.data;
    const cycle = currentCycleNumber();
    const before = S.joinPages.get(cycle);
    if ((before?.version ?? 0) !== expectedVersion) {
      return { ok: false, error: JOIN_PAGE_CHANGED };
    }
    const now = new Date();
    const version = expectedVersion + 1;
    S.joinPages.set(cycle, {
      cycle,
      draft: markdown,
      published: publish ? markdown : (before?.published ?? null),
      publishedAt: publish ? now : (before?.publishedAt ?? null),
      version,
      updatedAt: now,
      startedFrom: null,
    });
    return { ok: true, version, cycle };
  },

  /** Take this year's join page down (the twin of unpublishJoinPage). */
  unpublishJoinPage(input: {
    actorId: string;
    expectedVersion: number;
  }): JoinPageWriteResult<{ version: number }> {
    if (findUserById(input.actorId)?.rank !== "captain") {
      return { ok: false, error: NOT_A_JOIN_PAGE_EDITOR };
    }
    const page = S.joinPages.get(currentCycleNumber());
    if (!page || page.version !== input.expectedVersion) {
      return { ok: false, error: JOIN_PAGE_CHANGED };
    }
    if (page.published === null) {
      return { ok: false, error: JOIN_PAGE_NOT_PUBLISHED };
    }
    const version = page.version + 1;
    S.joinPages.set(page.cycle, {
      ...page,
      published: null,
      publishedAt: null,
      version,
      updatedAt: new Date(),
    });
    return { ok: true, version };
  },

  suggestRecipe(input: {
    submitterId: string;
    title: string | null;
    source: RecipeSource;
    sourceUrl: string | null;
    text: string | null;
    suitabilityNote: string | null;
    aiConsent: boolean;
    now: Date;
  }): RecipeWriteResult<{ id: string }> {
    if (findUserById(input.submitterId)?.approvalStatus !== "approved") {
      return { ok: false, error: NOT_AN_APPROVED_MEMBER };
    }
    const text = input.text?.trim() || null;
    if (!text) return { ok: false, error: TEXT_NEEDED };
    const id = crypto.randomUUID();
    recipes.push({
      id,
      submitterId: input.submitterId,
      source: input.source,
      status: "suggested",
      title: suggestionTitle(input.title, text),
      sourceUrl: input.sourceUrl?.trim() || null,
      rawText: text,
      suitabilityNote: input.suitabilityNote?.trim() || null,
      textAuthorId: input.submitterId,
      aiConsentAt: input.aiConsent ? input.now : null,
      changesNote: null,
      rejectionReason: null,
      lastError: null,
      latestRunId: null,
      acceptedVersionId: null,
      rerunRequest: null,
      rerunRequestedBy: null,
      rerunRequestedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    // Version 1 of the source: the member's own words, split into sections.
    insertStoreSource({
      recipeId: id,
      serves: null,
      sections: sourceFromText(text),
      authorId: input.submitterId,
      now: input.now,
    });
    return { ok: true, id };
  },

  resubmitRecipe(input: {
    recipeId: string;
    actorId: string;
    title: string;
    text: string | null;
    suitabilityNote: string | null;
    aiConsent: boolean;
    now?: Date;
  }): RecipeWriteResult {
    if (findUserById(input.actorId)?.approvalStatus !== "approved") {
      return { ok: false, error: NOT_AN_APPROVED_MEMBER };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    if (recipe.submitterId !== input.actorId) {
      return { ok: false, error: NOT_YOUR_SUGGESTION };
    }
    const text = input.text?.trim() || null;
    if (recipe.source !== "url" && !text) {
      return { ok: false, error: TEXT_NEEDED };
    }
    if (recipe.status !== "changes_requested") {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const now = input.now ?? new Date();
    Object.assign(recipe, {
      status: "suggested",
      title: input.title.trim(),
      rawText: text,
      textAuthorId: input.actorId,
      // The member's own words again: only their fresh tick counts.
      aiConsentAt: input.aiConsent ? now : null,
      suitabilityNote: input.suitabilityNote?.trim() || null,
      updatedAt: now,
    } satisfies Partial<TestRecipe>);
    // The member's words are the source again, and theirs.
    if (text) {
      insertStoreSource({
        recipeId: recipe.id,
        serves: null,
        sections: sourceFromText(text),
        authorId: input.actorId,
        now,
      });
    }
    return { ok: true };
  },

  decideRecipe(
    input: { recipeId: string; actorId: string } & RecipeDecision,
  ): RecipeWriteResult {
    if (!isKitchenReviewer(input.actorId)) {
      return { ok: false, error: NOT_A_KITCHEN_REVIEWER };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    let detail: Record<string, unknown> = {};
    if (input.decision === "reject") {
      if (!input.reason.trim()) {
        return { ok: false, error: REJECT_REASON_NEEDED };
      }
      detail = { reason: input.reason.trim() };
    } else if (input.decision === "request_changes") {
      if (!input.note.trim()) return { ok: false, error: CHANGES_NOTE_NEEDED };
      detail = { note: input.note.trim() };
    }
    if (recipe.status !== "suggested") {
      return { ok: false, error: RECIPE_DECIDED };
    }
    if (input.decision === "approve") recipe.status = "approved";
    else if (input.decision === "reject") {
      recipe.status = "rejected";
      recipe.rejectionReason = input.reason.trim();
    } else {
      recipe.status = "changes_requested";
      recipe.changesNote = input.note.trim();
    }
    recipe.updatedAt = new Date();
    recordRecipeEvent(
      recipe,
      input.decision === "approve"
        ? "recipe.approved"
        : input.decision === "reject"
          ? "recipe.rejected"
          : "recipe.changes_requested",
      input.actorId,
      detail,
    );
    return { ok: true };
  },

  retypeRecipeText(input: {
    recipeId: string;
    actorId: string;
    text: string;
  }): RecipeWriteResult {
    if (!isKitchenReviewer(input.actorId)) {
      return { ok: false, error: NOT_A_KITCHEN_REVIEWER };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    const text = input.text.trim();
    if (!text) return { ok: false, error: TEXT_NEEDED };
    if (!["suggested", "approved", "proofread"].includes(recipe.status)) {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const now = new Date();
    recipe.rawText = text;
    recipe.textAuthorId = input.actorId;
    // The reviewer's retyping is their agreement, as in production.
    recipe.aiConsentAt = now;
    recipe.updatedAt = now;
    // The retyped text is the next source version, and the reviewer's; the
    // Serves set in the source editor carries over, as in production.
    insertStoreSource({
      recipeId: recipe.id,
      serves: latestStoreSource(recipe.id)?.serves ?? null,
      sections: sourceFromText(text),
      authorId: input.actorId,
      now,
    });
    recordRecipeEvent(recipe, "recipe.text_retyped", input.actorId);
    return { ok: true };
  },

  requestRerun(input: {
    recipeId: string;
    actorId: string;
    note: string;
    now?: Date;
  }): RecipeWriteResult {
    if (!isKitchenReviewer(input.actorId)) {
      return { ok: false, error: NOT_A_KITCHEN_REVIEWER };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    const note = input.note.trim();
    if (!note) return { ok: false, error: RERUN_NOTE_NEEDED };
    if (note.length > RERUN_NOTE_MAX) {
      return {
        ok: false,
        error: `Keep the note under ${RERUN_NOTE_MAX} characters.`,
      };
    }
    if (!["approved", "proofread", "accepted"].includes(recipe.status)) {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const now = input.now ?? new Date();
    recipe.rerunRequest = note;
    recipe.rerunRequestedBy = input.actorId;
    recipe.rerunRequestedAt = now;
    recipe.updatedAt = now;
    recordRecipeEvent(recipe, "recipe.rerun_requested", input.actorId, {
      note,
    });
    return { ok: true };
  },

  queueProofread(input: {
    recipeIds: readonly string[];
    actorId: string;
    note: string | null;
    plates: number;
    now: Date;
    promptVersion: string;
    revisionPromptVersion?: string;
    model: string;
  }): RecipeWriteResult<{ runIds: string[] }> {
    if (!mayRunProofread(input.actorId)) {
      return { ok: false, error: ONLY_A_REVIEWER_SENDS };
    }
    const ids = [...new Set(input.recipeIds)];
    if (ids.length === 0) return { ok: false, error: NOT_READY_TO_PROOFREAD };
    if (
      !Number.isInteger(input.plates) ||
      input.plates < 1 ||
      input.plates > 500
    ) {
      return { ok: false, error: PLATES_OUT_OF_RANGE };
    }
    const picked: { recipe: TestRecipe; source: TestRecipeSource }[] = [];
    for (const id of ids) {
      const recipe = findRecipe(id);
      if (!recipe) return { ok: false, error: RECIPE_GONE };
      if (!QUEUEABLE.includes(recipe.status)) {
        return {
          ok: false,
          error: forRecipe(recipe.title, NOT_READY_TO_PROOFREAD),
        };
      }
      const source = latestStoreSource(recipe.id);
      if (!source) {
        return { ok: false, error: forRecipe(recipe.title, NO_TEXT_TO_SEND) };
      }
      const blocked = sourceBlockedReason(source, recipe);
      if (blocked)
        return { ok: false, error: forRecipe(recipe.title, blocked) };
      picked.push({ recipe, source });
    }
    const note = input.note?.trim() || null;
    const runIds: string[] = [];
    for (const { recipe, source } of picked) {
      const runId = insertStoreSourceRun({
        recipe,
        sourceId: source.id,
        actorId: input.actorId,
        now: input.now,
        note,
        plates: input.plates,
        exchange: [],
        previousRunId: recipe.latestRunId,
        promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
        model: input.model,
      });
      recordRecipeEvent(recipe, "recipe.proofread_queued", input.actorId, {
        runId,
        plates: input.plates,
        sourceVersion: source.version,
        promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
        model: input.model,
      });
      runIds.push(runId);
    }
    return { ok: true, runIds };
  },

  /**
   * "Send for proofreading" (the twin of sendSourceForProofreading): a new
   * source version when the content changed, by the reviewer, who becomes the
   * text's author; an unchanged send saves nothing and keeps the author, so a
   * member's unticked words stay refused. Then the run.
   */
  sendSourceForProofreading(input: {
    recipeId: string;
    actorId: string;
    basedOnSourceId: string | null;
    serves: number | null;
    sections: RecipeSourceSections;
    plates: number;
    now: Date;
    promptVersion: string;
    revisionPromptVersion?: string;
    model: string;
  }): RecipeWriteResult<{ runId: string; sourceId: string }> {
    if (!mayRunProofread(input.actorId)) {
      return { ok: false, error: ONLY_A_REVIEWER_SENDS };
    }
    if (
      !Number.isInteger(input.plates) ||
      input.plates < 1 ||
      input.plates > 500
    ) {
      return { ok: false, error: PLATES_OUT_OF_RANGE };
    }
    if (!servesInRange(input.serves)) {
      return { ok: false, error: SERVES_OUT_OF_RANGE };
    }
    const checked = checkStoreSections(input.sections);
    if (!checked.ok) return checked;
    const { sections } = checked;
    const serves = input.serves;
    // The same ceiling as pasted text (the cost guard on what reaches Claude).
    const text = sourceText(sections);
    if (text.length > RECIPE_TEXT_MAX) {
      return { ok: false, error: TEXT_TOO_LONG };
    }

    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    if (!QUEUEABLE.includes(recipe.status)) {
      return { ok: false, error: NOT_READY_TO_PROOFREAD };
    }
    const latest = latestStoreSource(recipe.id);
    if ((latest?.id ?? null) !== input.basedOnSourceId) {
      return { ok: false, error: SOURCE_CHANGED };
    }

    // Only a change to the words makes the reviewer their author; a
    // serves-only change keeps the author, and so the member's tick.
    const wordsChanged = !latest || !sameSections(latest.sections, sections);
    const authorId = wordsChanged ? input.actorId : latest.authorId;
    // The consent check runs on what would be sent, before anything is
    // written, so a refusal leaves nothing behind (the real rollback).
    const blocked = wordsChanged
      ? sourceBlockedReason(
          { sections, authorId },
          { submitterId: recipe.submitterId, aiConsentAt: input.now },
        )
      : sourceBlockedReason({ sections, authorId }, recipe);
    if (blocked) return { ok: false, error: blocked };

    let source = latest;
    if (!source || wordsChanged || source.serves !== serves) {
      source = insertStoreSource({
        recipeId: recipe.id,
        serves,
        sections,
        authorId,
        now: input.now,
      });
      if (wordsChanged) {
        recipe.rawText = text || null;
        recipe.textAuthorId = input.actorId;
        recipe.aiConsentAt = input.now;
        recipe.updatedAt = input.now;
      }
      recordRecipeEvent(recipe, "recipe.source_saved", input.actorId, {
        version: source.version,
      });
    }
    const runId = insertStoreSourceRun({
      recipe,
      sourceId: source.id,
      actorId: input.actorId,
      now: input.now,
      note: null,
      plates: input.plates,
      exchange: [],
      previousRunId: recipe.latestRunId,
      promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
      model: input.model,
    });
    recordRecipeEvent(recipe, "recipe.proofread_queued", input.actorId, {
      runId,
      plates: input.plates,
      sourceVersion: source.version,
      promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
      model: input.model,
    });
    return { ok: true, runId, sourceId: source.id };
  },

  /**
   * "Adjust with Claude" (the twin of adjustVersion): an adjust run on one of
   * the recipe's versions, with what should change. No consent check: it
   * sends the kitchen's own recipe and the reviewer's own words.
   */
  adjustVersion(input: {
    recipeId: string;
    versionId: string;
    actorId: string;
    instruction: string;
    plates: number;
    now: Date;
    promptVersion: string;
    model: string;
  }): RecipeWriteResult<{ runId: string }> {
    if (!mayRunProofread(input.actorId)) {
      return { ok: false, error: ONLY_A_REVIEWER_SENDS };
    }
    const instruction = input.instruction.trim();
    if (!instruction) return { ok: false, error: ADJUST_INSTRUCTION_NEEDED };
    if (instruction.length > ADJUST_INSTRUCTION_MAX) {
      return { ok: false, error: ADJUST_INSTRUCTION_TOO_LONG };
    }
    if (
      !Number.isInteger(input.plates) ||
      input.plates < 1 ||
      input.plates > 500
    ) {
      return { ok: false, error: PLATES_OUT_OF_RANGE };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    if (!QUEUEABLE.includes(recipe.status)) {
      return { ok: false, error: NOT_READY_TO_PROOFREAD };
    }
    const base = adjustableStoreVersion(recipe.id, input.versionId);
    if (!base) return { ok: false, error: ADJUST_VERSION_GONE };
    const runId = insertStoreSourceRun({
      recipe,
      sourceId: null,
      adjust: { versionId: base.id, instruction },
      actorId: input.actorId,
      now: input.now,
      note: null,
      plates: input.plates,
      exchange: [],
      previousRunId: recipe.latestRunId,
      promptVersion: input.promptVersion,
      model: input.model,
    });
    recordRecipeEvent(recipe, "recipe.adjust_queued", input.actorId, {
      runId,
      plates: input.plates,
      fromVersion: base.version,
      promptVersion: input.promptVersion,
      model: input.model,
    });
    return { ok: true, runId };
  },

  /**
   * A reviewer answers Claude's questions (the twin of
   * answerProofreadQuestions): the next round, on the same source and plates,
   * carrying the whole exchange.
   */
  answerProofreadQuestions(input: {
    recipeId: string;
    runId: string;
    actorId: string;
    answer: string;
    now: Date;
    promptVersion: string;
    revisionPromptVersion?: string;
    model: string;
  }): RecipeWriteResult<{ runId: string }> {
    if (!mayRunProofread(input.actorId)) {
      return { ok: false, error: ONLY_A_REVIEWER_SENDS };
    }
    const answer = input.answer.trim();
    if (!answer) return { ok: false, error: ANSWER_NEEDED };
    if (answer.length > PROOFREAD_ANSWER_MAX) {
      return { ok: false, error: ANSWER_TOO_LONG };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    if (
      recipe.latestRunId !== input.runId ||
      !QUEUEABLE.includes(recipe.status)
    ) {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const asked = recipeRuns.find(
      (r) =>
        r.id === input.runId &&
        r.recipeId === recipe.id &&
        isWritingRun(r) &&
        r.outcome === "succeeded",
    );
    const questions = readQuestions(asked?.result);
    if (!asked || !questions) return { ok: false, error: RECIPE_CHANGED };

    let adjust: { versionId: string; instruction: string } | undefined;
    if (asked.kind === "adjust") {
      if (!asked.versionId || !asked.instruction) {
        return { ok: false, error: RECIPE_CHANGED };
      }
      if (!adjustableStoreVersion(recipe.id, asked.versionId)) {
        return { ok: false, error: ADJUST_VERSION_GONE };
      }
      adjust = { versionId: asked.versionId, instruction: asked.instruction };
    } else {
      if (asked.sourceId === null) return { ok: false, error: RECIPE_CHANGED };
      const latest = latestStoreSource(recipe.id);
      if (latest?.id !== asked.sourceId) {
        return { ok: false, error: SOURCE_CHANGED };
      }
      const blocked = sourceBlockedReason(latest, recipe);
      if (blocked) return { ok: false, error: blocked };
    }

    const exchange = [...storeExchange(asked.exchange), { questions, answer }];
    const runId = insertStoreSourceRun({
      recipe,
      sourceId: asked.sourceId,
      adjust,
      actorId: input.actorId,
      now: input.now,
      note: null,
      plates: asked.plates ?? DEFAULT_PLATES,
      exchange,
      previousRunId: input.runId,
      promptVersion: adjust
        ? asked.promptVersion
        : sourcePromptVersion(recipe.acceptedVersionId, input),
      model: input.model,
    });
    recordRecipeEvent(recipe, "recipe.questions_answered", input.actorId, {
      runId,
      answeredRunId: input.runId,
      round: exchange.length,
    });
    return { ok: true, runId };
  },

  /**
   * Take one queued `source` run (the twin of claimSourceRun). A run whose
   * source lost its consent is failed unsent and its recipe handed back.
   */
  claimSourceRun(
    runId: string,
    now: Date = new Date(),
  ): ClaimedSourceRun | null {
    const run = recipeRuns.find((r) => r.id === runId);
    if (!run || !isWritingRun(run) || run.outcome !== "queued") return null;
    const recipe = findRecipe(run.recipeId);
    if (!recipe || recipe.status !== "queued" || recipe.latestRunId !== run.id)
      return null;
    const isAdjust = run.kind === "adjust";
    const row = recipeSources.find((x) => x.id === run.sourceId);
    const source = row ? sourceVersionOf(row) : null;
    const base = isAdjust ? storePreviousVersion(run.versionId) : null;
    const blocked = isAdjust
      ? base && run.instruction
        ? null
        : ADJUST_VERSION_GONE
      : sourceBlockedReason(source, recipe);
    if (blocked !== null || (!isAdjust && !source)) {
      const error = blocked ?? NO_TEXT_TO_SEND;
      run.outcome = "failed";
      run.finishedAt = now;
      run.error = error;
      handBackStore(run, "queued", error, now);
      return null;
    }
    run.outcome = "running";
    run.startedAt = now;
    run.stage = "sending";
    recipe.status = "analysing";
    recipe.updatedAt = now;
    return {
      runId: run.id,
      recipeId: recipe.id,
      title: recipe.title,
      sourceText: source && !isAdjust ? sourceText(source.sections) : "",
      serves: source && !isAdjust ? source.serves : null,
      plates: run.plates ?? DEFAULT_PLATES,
      exchange: storeExchange(run.exchange),
      note: run.note,
      kitchen: mealPlanPeaks(storeMealPlan(currentCycleNumber()).days),
      previous: isAdjust
        ? null
        : storePreviousVersion(recipe.acceptedVersionId),
      adjust:
        isAdjust && base && run.instruction
          ? { base, instruction: run.instruction }
          : null,
    };
  },

  /** The twin of setRunStage: only while a source run is running. */
  setRunStage(runId: string, stage: RunStage): boolean {
    if (!isStoreRunStage(stage)) return false;
    const run = recipeRuns.find((r) => r.id === runId);
    if (!run || !isWritingRun(run) || run.outcome !== "running") {
      return false;
    }
    run.stage = stage;
    return true;
  },

  /**
   * A source run came back with a valid answer (the twin of
   * completeSourceRun): questions hand the recipe back pointing at this run;
   * a recipe for the run's plates is saved straight into the book.
   */
  completeSourceRun(input: {
    runId: string;
    result: SourceProofread;
    usage: RunUsage;
    now?: Date;
  }): RecipeWriteResult<{ versionId: string | null }> {
    const parsed = SourceProofread.safeParse(input.result);
    if (!parsed.success) {
      return { ok: false, error: versionInvalid(parsed.error) };
    }
    const answer = parsed.data;
    const run = recipeRuns.find((r) => r.id === input.runId);
    const recipe = run ? findRecipe(run.recipeId) : null;
    if (
      !run ||
      !isWritingRun(run) ||
      run.outcome !== "running" ||
      !recipe ||
      recipe.status !== "analysing" ||
      recipe.latestRunId !== run.id
    ) {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const asked = run.plates ?? DEFAULT_PLATES;
    if (!answer.needsInfo && answer.recipe!.plates !== asked) {
      return {
        ok: false,
        error: draftPlatesMismatch(asked, answer.recipe!.plates),
      };
    }
    // The sender must still be a Kitchen reviewer when the recipe is written
    // into the book, as the write re-checks in production.
    if (
      !answer.needsInfo &&
      !(run.requestedBy && isKitchenReviewer(run.requestedBy))
    ) {
      return { ok: false, error: SENDER_NOT_A_REVIEWER };
    }
    const now = input.now ?? new Date();
    Object.assign(run, {
      outcome: "succeeded",
      finishedAt: now,
      result: answer,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      error: null,
    } satisfies Partial<TestRecipeRun>);

    if (answer.needsInfo) {
      const to = handBackTo({
        failedRunId: run.id,
        previousStatus: run.previousStatus,
        previousRunId: run.previousRunId,
        previousRunSucceeded: false,
        acceptedVersionId: recipe.acceptedVersionId,
      });
      recipe.status = to.status;
      recipe.latestRunId = run.id;
      recipe.lastError = null;
      recipe.updatedAt = now;
      return { ok: true, versionId: null };
    }

    const written = addStoreVersion(recipe, {
      authorId: run.requestedBy ?? "",
      runId: run.id,
      reason:
        run.kind === "adjust" && run.instruction
          ? adjustReason(run.instruction)
          : "Written by Claude",
      body: answer.recipe!,
      report: answer.report,
      sourceId: run.sourceId,
      scalingNotes: answer.scalingNotes,
    });
    recipe.lastError = null;
    recordRecipeEvent(
      recipe,
      "recipe.written_by_claude",
      run.requestedBy ?? "",
      { version: written.version, runId: run.id },
    );
    return { ok: true, versionId: written.versionId };
  },

  failRun(input: {
    runId: string;
    error: string;
    usage?: RunUsage | null;
    now?: Date;
  }): RecipeWriteResult {
    const run = recipeRuns.find((r) => r.id === input.runId);
    if (!run || run.outcome !== "running") {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const now = input.now ?? new Date();
    const error = input.error.trim().slice(0, 1_000) || "The run failed.";
    run.outcome = "failed";
    run.finishedAt = now;
    run.error = error;
    if (input.usage) {
      run.inputTokens = input.usage.inputTokens;
      run.outputTokens = input.usage.outputTokens;
    }
    // A plate-count run never moved its recipe, so only its own row changes.
    if (run.kind !== "plates") handBackStore(run, "analysing", error, now);
    return { ok: true };
  },

  resetStaleRuns(
    now: Date,
    staleAfterMs: number = STALE_RUN_AFTER_MS,
  ): { reset: number } {
    const cutoff = now.getTime() - staleAfterMs;
    let reset = 0;
    for (const run of recipeRuns) {
      const stopped =
        run.outcome === "running" &&
        run.startedAt !== null &&
        run.startedAt.getTime() < cutoff;
      const neverStarted =
        run.outcome === "queued" && run.requestedAt.getTime() < cutoff;
      if (!stopped && !neverStarted) continue;
      const error = stopped ? STALE_RUN_ERROR : NEVER_STARTED_ERROR;
      run.outcome = "failed";
      run.finishedAt = now;
      run.error = error;
      reset += 1;
      if (run.kind !== "plates") {
        handBackStore(run, stopped ? "analysing" : "queued", error, now);
      }
    }
    return { reset };
  },

  // --- Plate counts: twins of queuePlateProofread and the plate worker ------

  queuePlateProofread(input: {
    recipeId: string;
    versionId: string;
    plates: number;
    rerun: boolean;
    actorId: string;
    now: Date;
    promptVersion: string;
    model: string;
  }): RecipeWriteResult<{ runId: string }> {
    if (!mayRunProofread(input.actorId)) {
      return { ok: false, error: ONLY_A_REVIEWER_SENDS };
    }
    const plates = input.plates;
    if (!Number.isInteger(plates) || plates < 1 || plates > 500) {
      return { ok: false, error: PLATES_OUT_OF_RANGE };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    if (recipe.acceptedVersionId === null) {
      return { ok: false, error: NO_ACCEPTED_VERSION };
    }
    const version = recipeVersions.find((v) => v.id === input.versionId);
    if (recipe.acceptedVersionId !== input.versionId || !version) {
      return { ok: false, error: VERSION_CHANGED };
    }
    if (plates === version.body.plates) {
      return { ok: false, error: plateCountIsBase(plates) };
    }
    const ready = recipePlateCounts.some(
      (p) => p.versionId === version.id && p.plates === plates,
    );
    if (ready && !input.rerun) {
      return { ok: false, error: plateCountReady(plates) };
    }
    const open = recipeRuns.some(
      (r) =>
        r.kind === "plates" &&
        r.versionId === version.id &&
        r.plates === plates &&
        (r.outcome === "queued" || r.outcome === "running"),
    );
    if (open) return { ok: false, error: plateRunOpen(plates) };

    const runId = crypto.randomUUID();
    recipeRuns.push({
      id: runId,
      recipeId: recipe.id,
      requestedBy: input.actorId,
      requestedAt: input.now,
      note: null,
      startedAt: null,
      finishedAt: null,
      promptVersion: input.promptVersion,
      model: input.model,
      inputTokens: null,
      outputTokens: null,
      outcome: "queued",
      error: null,
      result: null,
      kind: "plates",
      plates,
      versionId: version.id,
      sourceId: null,
      stage: null,
      exchange: null,
      previousStatus: null,
      previousRunId: null,
    });
    recordRecipeEvent(recipe, "recipe.plates_queued", input.actorId, {
      version: version.version,
      plates,
      runId,
      rerun: ready,
      promptVersion: input.promptVersion,
      model: input.model,
    });
    return { ok: true, runId };
  },

  claimPlateRun(runId: string, now: Date = new Date()): ClaimedPlateRun | null {
    const run = recipeRuns.find((r) => r.id === runId);
    if (
      !run ||
      run.kind !== "plates" ||
      run.outcome !== "queued" ||
      run.versionId === null ||
      run.plates === null
    ) {
      return null;
    }
    const version = recipeVersions.find((v) => v.id === run.versionId);
    const recipe = findRecipe(run.recipeId);
    if (!version || !recipe || recipe.acceptedVersionId !== version.id) {
      run.outcome = "failed";
      run.finishedAt = now;
      run.error = PLATE_RUN_VERSION_GONE;
      return null;
    }
    run.outcome = "running";
    run.startedAt = now;
    return {
      runId: run.id,
      recipeId: recipe.id,
      title: recipe.title,
      fromPlates: version.body.plates,
      plates: run.plates,
      recipe: version.body,
    };
  },

  completePlateRun(input: {
    runId: string;
    result: PlateProofread;
    usage: RunUsage;
    now?: Date;
  }): RecipeWriteResult {
    const parsed = PlateProofread.safeParse(input.result);
    if (!parsed.success) {
      return { ok: false, error: versionInvalid(parsed.error) };
    }
    const run = recipeRuns.find((r) => r.id === input.runId);
    if (
      !run ||
      run.kind !== "plates" ||
      run.outcome !== "running" ||
      run.versionId === null ||
      run.plates === null
    ) {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const existing = recipePlateCounts.find(
      (p) => p.versionId === run.versionId && p.plates === run.plates,
    );
    if (existing?.source === "version") {
      return { ok: false, error: plateCountIsBase(run.plates) };
    }
    const now = input.now ?? new Date();
    Object.assign(run, {
      outcome: "succeeded",
      finishedAt: now,
      result: parsed.data,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      error: null,
    } satisfies Partial<TestRecipeRun>);
    const stored: TestPlateCount = {
      versionId: run.versionId,
      plates: run.plates,
      lines: parsed.data.lines,
      pots: parsed.data.pots,
      notes: parsed.data.notes,
      report: parsed.data.report,
      source: "proofread",
      runId: run.id,
      createdAt: now,
    };
    if (existing) Object.assign(existing, stored);
    else recipePlateCounts.push(stored);
    return { ok: true };
  },

  failPlateRun(input: {
    runId: string;
    error: string;
    usage?: RunUsage | null;
    now?: Date;
  }): RecipeWriteResult {
    const run = recipeRuns.find((r) => r.id === input.runId);
    if (!run || run.kind !== "plates" || run.outcome !== "running") {
      return { ok: false, error: RECIPE_CHANGED };
    }
    run.outcome = "failed";
    run.finishedAt = input.now ?? new Date();
    run.error = input.error.trim().slice(0, 1_000) || "The run failed.";
    if (input.usage) {
      run.inputTokens = input.usage.inputTokens;
      run.outputTokens = input.usage.outputTokens;
    }
    return { ok: true };
  },

  /**
   * Seed an older `recipe` run that came back with a draft, as rows written
   * before source runs look: nothing writes one any more, but a draft still
   * waiting in `proofread` keeps its Accept button. Unit tests only; no route
   * reaches it.
   */
  seedLegacyDraft(input: {
    recipeId: string;
    actorId: string;
    result: RecipeDraft;
    now?: Date;
  }): string {
    const recipe = findRecipe(input.recipeId);
    if (!recipe) throw new Error(RECIPE_GONE);
    const now = input.now ?? new Date();
    const runId = crypto.randomUUID();
    recipeRuns.push({
      id: runId,
      recipeId: recipe.id,
      requestedBy: input.actorId,
      requestedAt: now,
      note: null,
      startedAt: now,
      finishedAt: now,
      promptVersion: "2026-09-25.1",
      model: "claude-opus-4-8",
      inputTokens: 1,
      outputTokens: 1,
      outcome: "succeeded",
      error: null,
      result: RecipeDraft.parse(input.result),
      kind: "recipe",
      plates: input.result.recipe.plates,
      versionId: null,
      sourceId: null,
      stage: null,
      exchange: null,
      previousStatus: recipe.status,
      previousRunId: recipe.latestRunId,
    });
    recipe.status = "proofread";
    recipe.latestRunId = runId;
    recipe.updatedAt = now;
    return runId;
  },

  /**
   * Accept an older run's draft exactly as Claude wrote it (the twin of
   * acceptProofread): the draft is read from the run, never taken from the
   * caller.
   */
  acceptProofread(input: {
    recipeId: string;
    runId: string;
    actorId: string;
    reason?: string | null;
  }): RecipeWriteResult<{ versionId: string; version: number }> {
    if (!isKitchenReviewer(input.actorId)) {
      return { ok: false, error: NOT_A_KITCHEN_REVIEWER };
    }
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    if (recipe.status !== "proofread" || recipe.latestRunId !== input.runId) {
      return { ok: false, error: RECIPE_CHANGED };
    }
    const run = recipeRuns.find(
      (r) => r.id === input.runId && r.recipeId === recipe.id,
    );
    const draft = readDraft(run?.result);
    if (!draft) return { ok: false, error: DRAFT_UNREADABLE };
    const parsed = KitchenRecipe.safeParse(draft.recipe);
    if (!parsed.success) {
      return { ok: false, error: versionInvalid(parsed.error) };
    }
    const written = addStoreVersion(recipe, {
      authorId: input.actorId,
      runId: input.runId,
      reason: input.reason?.trim() || "Written by Claude",
      body: parsed.data,
      report: draft.report ?? null,
    });
    recordRecipeEvent(recipe, "recipe.accepted", input.actorId, {
      version: written.version,
      runId: input.runId,
    });
    return { ok: true, ...written };
  },

  /**
   * Test only: a version in the book, as a run or an accept would write it,
   * with no reviewer check. The app has no way to write a version by hand any
   * more, so the suites that need one seed it here; lib/recipes.ts does not
   * export it.
   */
  seedAcceptedVersion(input: {
    recipeId: string;
    authorId: string;
    recipe: KitchenRecipe;
    reason?: string;
  }): { versionId: string; version: number } {
    const recipe = findRecipe(input.recipeId);
    if (!recipe) throw new Error(`No recipe ${input.recipeId}`);
    return addStoreVersion(recipe, {
      authorId: input.authorId,
      runId: null,
      reason: input.reason ?? "Seeded",
      body: KitchenRecipe.parse(input.recipe),
      report: null,
    });
  },

  /** The twin of addLesson: on one of the recipe's versions. */
  addLesson(input: {
    recipeId: string;
    versionId: string;
    authorId: string;
    body: string;
  }): RecipeWriteResult<{ id: string }> {
    if (findUserById(input.authorId)?.approvalStatus !== "approved") {
      return { ok: false, error: NOT_AN_APPROVED_MEMBER };
    }
    const body = input.body.trim();
    if (!body) return { ok: false, error: LESSON_NEEDED };
    const recipe = findRecipe(input.recipeId);
    if (!recipe) return { ok: false, error: RECIPE_GONE };
    if (!recipe.acceptedVersionId) {
      return { ok: false, error: NO_ACCEPTED_VERSION };
    }
    const version = recipeVersions.find(
      (v) => v.id === input.versionId && v.recipeId === recipe.id,
    );
    if (!version) return { ok: false, error: LESSON_VERSION_GONE };
    const id = crypto.randomUUID();
    recipeLessons.push({
      id,
      recipeId: recipe.id,
      versionId: version.id,
      authorId: input.authorId,
      body,
      cycle: currentCycleNumber(),
      createdAt: new Date(),
    });
    return { ok: true, id };
  },

  getRecipeSource(recipeId: string): RecipeSourceVersion | null {
    const row = latestStoreSource(recipeId);
    return row ? sourceVersionOf(row) : null;
  },

  /** Every source version, newest first (the twin of listRecipeSources). */
  listRecipeSources(recipeId: string): RecipeSourceHistoryEntry[] {
    return recipeSources
      .filter((row) => row.recipeId === recipeId)
      .sort((a, b) => b.version - a.version)
      .map((row) => ({
        ...sourceVersionOf(row),
        authorName: userName(row.authorId),
        createdAt: row.createdAt,
      }));
  },

  getProofreadProgress(
    recipeId: string,
    runId?: string | null,
  ): ProofreadProgress | null {
    const recipe = findRecipe(recipeId);
    const wanted = runId ?? recipe?.latestRunId;
    const run = recipe
      ? recipeRuns.find((r) => r.id === wanted && r.recipeId === recipe.id)
      : undefined;
    if (!run) return null;
    return {
      runId: run.id,
      kind: run.kind,
      outcome: run.outcome,
      stage: isStoreRunStage(run.stage) ? run.stage : null,
      questions: run.outcome === "succeeded" ? readQuestions(run.result) : null,
      error: run.error,
    };
  },

  listRecipeBook(): RecipeBookEntry[] {
    return recipes
      .filter((r) => r.acceptedVersionId !== null)
      .map((r) => {
        const version = recipeVersions.find(
          (v) => v.id === r.acceptedVersionId,
        )!;
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          version: version.version,
          plates: version.body.plates,
          readyPlates: storePlateCounts(version.id).map((p) => p.plates),
          versionCreatedAt: version.createdAt,
        };
      })
      .sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
      );
  },

  listMySuggestions(userId: string): MySuggestion[] {
    return recipes
      .filter((r) => r.submitterId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        source: r.source,
        createdAt: r.createdAt,
        changesNote: r.changesNote,
        rejectionReason: r.rejectionReason,
      }));
  },

  listReviewQueue(): ReviewQueueEntry[] {
    const rank = (r: TestRecipe) => (r.status === "changes_requested" ? 1 : 0);
    return recipes
      .filter(
        (r) => r.status === "suggested" || r.status === "changes_requested",
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        source: r.source,
        sourceUrl: r.sourceUrl,
        submitterId: r.submitterId,
        submitterName: userName(r.submitterId),
        suitabilityNote: r.suitabilityNote,
        changesNote: r.changesNote,
        createdAt: r.createdAt,
      }));
  },

  listReadyToProofread(): ProofreadCandidate[] {
    return recipes
      .filter((r) => ["approved", "proofread", "accepted"].includes(r.status))
      .sort(
        (a, b) =>
          Number(a.status !== "approved") - Number(b.status !== "approved") ||
          a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        blockedReason: storeTextBlocked(r),
        lastError: r.lastError,
        acceptedVersionId: r.acceptedVersionId,
        rerunRequest: r.rerunRequest
          ? { note: r.rerunRequest, byName: userName(r.rerunRequestedBy) }
          : null,
        updatedAt: r.updatedAt,
      }));
  },

  listAwaitingAcceptance(): AwaitingAcceptance[] {
    const finished = (r: TestRecipe) =>
      recipeRuns.find((run) => run.id === r.latestRunId)?.finishedAt ?? null;
    return recipes
      .filter((r) => r.status === "proofread")
      .map((r) => ({
        id: r.id,
        title: r.title,
        latestRunId: r.latestRunId,
        finishedAt: finished(r),
        acceptedVersionId: r.acceptedVersionId,
      }))
      .sort(
        (a, b) =>
          (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0),
      );
  },

  getRecipeDetail(recipeId: string): RecipeDetail | null {
    const r = findRecipe(recipeId);
    if (!r) return null;
    const run = recipeRuns.find((x) => x.id === r.latestRunId);
    const versions = recipeVersions
      .filter((v) => v.recipeId === r.id)
      .sort((a, b) => b.version - a.version);
    const current = versions.find((v) => v.id === r.acceptedVersionId);
    const currentVersion: RecipeVersionDetail | null = current
      ? {
          id: current.id,
          version: current.version,
          plates: current.body.plates,
          recipe: current.body,
          report: current.report,
          scalingNotes: current.scalingNotes,
          runId: current.runId,
          reason: current.reason,
          authorName: userName(current.authorId),
          createdAt: current.createdAt,
        }
      : null;
    const plateCounts = current
      ? storePlateCounts(current.id).map((p) => ({
          plates: p.plates,
          source: p.source,
          pots: p.pots,
          createdAt: p.createdAt,
        }))
      : [];
    const openPlateRuns = current
      ? recipeRuns
          .filter(
            (x) =>
              x.kind === "plates" &&
              x.versionId === current.id &&
              (x.outcome === "queued" || x.outcome === "running") &&
              x.plates !== null,
          )
          .map((x) => x.plates!)
          .sort((a, b) => a - b)
      : [];
    const failedPlateRuns = current
      ? failedPlateCounts(
          recipeRuns
            .filter((x) => x.kind === "plates" && x.versionId === current.id)
            // Newest first; of two queued at once, the later one.
            .reverse()
            .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()),
          plateCounts.map((p) => p.plates),
          openPlateRuns,
        )
      : [];
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      source: r.source,
      sourceUrl: r.sourceUrl,
      text: r.rawText,
      suitabilityNote: r.suitabilityNote,
      submitterId: r.submitterId,
      submitterName: userName(r.submitterId),
      textAuthorId: r.textAuthorId,
      blockedReason: storeTextBlocked(r),
      rerunRequest:
        r.rerunRequest && r.rerunRequestedAt
          ? {
              note: r.rerunRequest,
              byName: userName(r.rerunRequestedBy),
              at: r.rerunRequestedAt,
            }
          : null,
      changesNote: r.changesNote,
      rejectionReason: r.rejectionReason,
      lastError: r.lastError,
      acceptedVersionId: r.acceptedVersionId,
      createdAt: r.createdAt,
      latestRun: run
        ? runDetail({
            id: run.id,
            outcome: run.outcome,
            requestedAt: run.requestedAt,
            finishedAt: run.finishedAt,
            note: run.note,
            plates: run.plates,
            promptVersion: run.promptVersion,
            model: run.model,
            error: run.error,
            result: run.result,
            stage: run.stage,
          })
        : null,
      currentVersion,
      plateCounts,
      openPlateRuns,
      failedPlateRuns,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        plates: v.body.plates,
        recipe: v.body,
        report: v.report,
        scalingNotes: v.scalingNotes,
        reason: v.reason,
        runId: v.runId,
        authorName: userName(v.authorId),
        createdAt: v.createdAt,
      })),
      lessons: recipeLessons
        .filter((l) => l.recipeId === r.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((l) => ({
          id: l.id,
          versionId: l.versionId,
          body: l.body,
          cycle: l.cycle,
          authorName: userName(l.authorId),
          createdAt: l.createdAt,
        })),
      history: recipeHistory
        .filter((e) => e.recipeId === r.id)
        .map((e) => ({
          action: e.action,
          actorName: userName(e.actorId),
          metadata: e.metadata,
          createdAt: e.createdAt,
        })),
    };
  },

  getPlateCount(versionId: string, plates: number): PlateCountDetail | null {
    const row = recipePlateCounts.find(
      (p) => p.versionId === versionId && p.plates === plates,
    );
    if (!row) return null;
    return {
      plates: row.plates,
      lines: row.lines,
      pots: row.pots,
      notes: row.notes,
      report: row.report,
      source: row.source,
    };
  },

  listProofreadRuns(options: { limit?: number } = {}): ProofreadRunRow[] {
    const limit = Math.min(Math.max(1, options.limit ?? 20), 200);
    return [...recipeRuns]
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      .slice(0, limit)
      .map((run) => ({
        id: run.id,
        recipeId: run.recipeId,
        recipeTitle: findRecipe(run.recipeId)?.title ?? UNTITLED_RECIPE,
        requestedByName: userName(run.requestedBy),
        requestedAt: run.requestedAt,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        outcome: run.outcome,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        promptVersion: run.promptVersion,
        model: run.model,
        error: run.error,
      }));
  },

  proofreadTokenTotals(now: Date): TokenTotals {
    const since = campMonthStartOf(now);
    const month = recipeRuns.filter(
      (run) => run.requestedAt.getTime() >= since.getTime(),
    );
    return {
      since,
      runs: month.length,
      inputTokens: month.reduce((sum, run) => sum + (run.inputTokens ?? 0), 0),
      outputTokens: month.reduce(
        (sum, run) => sum + (run.outputTokens ?? 0),
        0,
      ),
    };
  },

  reset(): void {
    usersByAuthId.clear();
    profilesByUserId.clear();
    idDocsByUserId.clear();
    emergencyContactsByUserId.clear();
    inviteCodes.clear();
    questionnaireEdits.length = 0;
    broadcasts.length = 0;
    deliveries.length = 0;
    promotionRequests.length = 0;
    teamMemberships.length = 0;
    requiredActions.length = 0;
    tasks.length = 0;
    calendarEvents.length = 0;
    payments.length = 0;
    memberRefCodes.clear();
    participations.clear();
    powerLoads.length = 0;
    powerPlans.clear();
    generators.length = 0;
    powerInventory.length = 0;
    recipes.length = 0;
    recipeRuns.length = 0;
    recipeSources.length = 0;
    recipeVersions.length = 0;
    recipePlateCounts.length = 0;
    ingredientCatalogue.length = 0;
    recipeLessons.length = 0;
    recipeHistory.length = 0;
    S.mealPlans.clear();
    S.joinPages.clear();
    S.nextSerial = 1;
    S.teamsConfig = structuredClone(DEFAULT_CAMP_CONFIG);
  },
};

export type {
  TestUser,
  TestBurnerProfile,
  TestInviteCode,
  TestQuestionnaireEdit,
  TestPromotionRequest,
  TestTeamMembership,
  TestRequiredAction,
  TestPayment,
  TestParticipation,
};
