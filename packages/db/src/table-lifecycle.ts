import { getTableColumns, type Column } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Table lifecycle: what happens to each table's rows when the camp names its
// founding year, and when a member is erased. One entry per table in
// schema.ts, so a new table is decided here once instead of in five hand lists
// (setFoundingYear's, sanitiseAccount's and the invariant tests'). Nothing here
// changes the SQL of a table; it is read by cycle-rollover.ts, account.ts and
// __tests__/table-lifecycle.test.ts.
//
// `year`:
// - "none": the table has no `cycle` column.
// - "as-is": setFoundingYear moves its sentinel rows with one plain UPDATE.
// - byHand(how): setFoundingYear adopts it with its own statements (counted
//   for the receipt, or rows that point at each other); `how` says what.
// The type allows "none" only on a table without a `cycle` property and
// requires one of the others on a table with one.
//
// `erasure`, keyed by column, for every column that references `users.id` or
// Better Auth's `user.id` (table-lifecycle.test.ts fails on one left out):
// - del: sanitiseAccount deletes the member's rows by this column, in one loop.
// - scrub(step, does): a named hand step in sanitiseAccount (SCRUB_STEPS in
//   account.ts must have every step; the type checks it).
// - keep(reason): the rows stay and point at the Lost Cat stub.
// - cascade(from): an ON DELETE CASCADE from a table erasure deletes takes
//   them (the test checks the foreign key).
// - undecided: nobody has decided yet (none today); the rows stay. Pinned in
//   the test, so a new one cannot slip in quietly.
// Erasure keeps the `users` row, so the users-level ON DELETE CASCADE never
// fires: a `cascade` decision always names another table.

type Schema = typeof schema;

/** The name of every table schema.ts exports. */
export type TableKey = {
  [K in keyof Schema]: Schema[K] extends PgTable ? K : never;
}[keyof Schema];

type ColumnsOf<K extends TableKey> = Schema[K]["_"]["columns"];

/** setFoundingYear adopts the table with statements of its own. */
export type AdoptedByHand = { byHand: "setFoundingYear"; how: string };

/** The named hand steps of sanitiseAccount (account.ts SCRUB_STEPS). */
export type ScrubStep =
  | "usersRow"
  | "signInIdentity"
  | "liftRequestDriver"
  | "trailerTower"
  | "fuelCans"
  | "pets"
  | "connectorLog"
  | "paymentNotes"
  | "chargeReasons"
  | "refundNotes"
  | "claims";

export type ErasureDecision =
  | { policy: "delete" }
  | { policy: "scrub"; step: ScrubStep; does: string }
  | { policy: "keep"; reason: string }
  | { policy: "cascade"; from: string }
  | { policy: "undecided"; recommend: string };

export type TableLifecycleEntry<K extends TableKey> = {
  year: "cycle" extends keyof ColumnsOf<K> ? "as-is" | AdoptedByHand : "none";
  erasure?: { readonly [C in keyof ColumnsOf<K>]?: ErasureDecision };
};

const del = { policy: "delete" } as const;
const scrub = (step: ScrubStep, does: string) =>
  ({ policy: "scrub", step, does }) as const;
const keep = (reason: string) => ({ policy: "keep", reason }) as const;
const cascade = (from: string) => ({ policy: "cascade", from }) as const;
const byHand = (how: string): AdoptedByHand => ({
  byHand: "setFoundingYear",
  how,
});

/** Who did it (an author, a decider, an editor): the link reads as the Lost Cat. */
const byWhom = keep("who did it: the link stays and reads as the Lost Cat");
/** The dues ledger stays for accounting and holds no words about them. */
const ledger = keep("the dues ledger stays for accounting; no free text");

export const TABLE_LIFECYCLE = {
  user: {
    year: "none",
    erasure: {
      id: scrub(
        "signInIdentity",
        "the sign-in identity goes: email, password, sessions, second factors, passkeys",
      ),
    },
  },
  session: {
    year: "none",
    erasure: {
      userId: cascade("user"),
    },
  },
  account: {
    year: "none",
    erasure: {
      userId: cascade("user"),
    },
  },
  verification: { year: "none" },
  rateLimit: { year: "none" },
  twoFactor: {
    year: "none",
    erasure: {
      userId: cascade("user"),
    },
  },
  passkey: {
    year: "none",
    erasure: {
      userId: cascade("user"),
    },
  },
  users: {
    year: "none",
    erasure: {
      id: scrub(
        "usersRow",
        "the row stays as the Lost Cat stub: sanitisedUserPatch clears or keeps each column",
      ),
      approvalDecidedByUserId: byWhom,
    },
  },
  inviteCodes: {
    year: "none",
    erasure: {
      createdByUserId: byWhom,
    },
  },
  burnerProfiles: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  dietaryRequirements: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  driverProfiles: {
    year: byHand("first, counted; the car seats ride its ON UPDATE CASCADE"),
    erasure: {
      userId: del,
    },
  },
  // A seat goes whether they were the passenger (here) or the driver (their
  // driver profile's delete cascades to its seats).
  carMembers: {
    year: byHand("counted, then moved by driver_profiles' ON UPDATE CASCADE"),
    erasure: {
      memberUserId: del,
      driverUserId: cascade("driver_profiles"),
    },
  },
  transportTrailers: {
    year: byHand("counted for the receipt"),
    erasure: {
      towedByUserId: scrub(
        "trailerTower",
        "a trailer they towed stays the camp's, with no car",
      ),
    },
  },
  // Their own requests go; a request that named their car becomes any car.
  liftRequests: {
    year: byHand("counted for the receipt"),
    erasure: {
      userId: del,
      driverUserId: scrub(
        "liftRequestDriver",
        "a request that named their car becomes any car: its rider still needs a lift",
      ),
    },
  },
  // Every year's memberships, and the lead flag with them.
  teamMemberships: {
    year: byHand("counted for the receipt"),
    erasure: {
      userId: del,
    },
  },
  campParticipations: {
    year: byHand("counted for the receipt"),
    erasure: {
      userId: del,
      decidedByUserId: byWhom,
    },
  },
  campTickets: {
    year: byHand(
      "a sentinel row is merged into the member's founding-year row first",
    ),
    erasure: {
      userId: del,
      passesUpdatedByUserId: byWhom,
    },
  },
  payments: {
    year: "as-is",
    erasure: {
      userId: scrub(
        "paymentNotes",
        "the ledger row stays for accounting; the note and the proof file's path go",
      ),
      recordedByUserId: byWhom,
    },
  },
  duesYears: {
    year: "as-is",
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  feeTiers: { year: "as-is" },
  duesAccounts: {
    year: "as-is",
    erasure: {
      userId: ledger,
    },
  },
  duesSettleUps: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
    },
  },
  duesCharges: {
    year: "as-is",
    erasure: {
      userId: scrub(
        "chargeReasons",
        "the charge stays for accounting; a concession's reason goes",
      ),
      cancelledByUserId: byWhom,
      createdByUserId: byWhom,
    },
  },
  duesInstalments: {
    year: "as-is",
    erasure: {
      userId: ledger,
    },
  },
  paymentRefunds: {
    year: "as-is",
    erasure: {
      userId: scrub(
        "refundNotes",
        "the refund stays for accounting; its note and decline reason go",
      ),
      requestedByUserId: byWhom,
      decidedByUserId: byWhom,
    },
  },
  rentalItems: { year: "as-is" },
  // Gear rental (#241): their orders go (lines and sharers cascade); the
  // rental charge stays on the dues ledger.
  rentalOrders: {
    year: "as-is",
    erasure: {
      userId: del,
      confirmedByUserId: byWhom,
      filledByUserId: byWhom,
    },
  },
  rentalOrderLines: { year: "none" },
  rentalOrderSharers: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  // Captains' notes ABOUT the member go; notes they wrote stay, by the Lost Cat.
  memberNotes: {
    year: "none",
    erasure: {
      userId: del,
      authorId: byWhom,
    },
  },
  captainPromotionRequests: {
    year: "none",
    erasure: {
      targetUserId: keep(
        "a decision record, like audit_log: it names the Lost Cat",
      ),
      requestedByUserId: byWhom,
    },
  },
  questionnaireActivations: {
    year: byHand("counted for the receipt"),
    erasure: {
      activatedByUserId: byWhom,
    },
  },
  questionnaireActivationTargets: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  questionnaireEdits: {
    year: "none",
    erasure: {
      userId: del,
      editedByUserId: byWhom,
    },
  },
  requiredActions: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  recipes: {
    year: "none",
    erasure: {
      submitterId: byWhom,
      textAuthorId: byWhom,
      approvedBy: byWhom,
      rejectedBy: byWhom,
      queuedBy: byWhom,
      rerunRequestedBy: byWhom,
    },
  },
  recipeSources: {
    year: "none",
    erasure: {
      authorId: byWhom,
    },
  },
  recipeProofreadRuns: {
    year: "none",
    erasure: {
      requestedBy: byWhom,
    },
  },
  ingredients: { year: "none" },
  recipeVersions: {
    year: "none",
    erasure: {
      authorId: byWhom,
    },
  },
  recipeVersionIngredients: { year: "none" },
  recipePlateCounts: { year: "none" },
  recipeLessons: {
    year: "as-is",
    erasure: {
      authorId: byWhom,
    },
  },
  kitchenMealPlans: {
    year: byHand("copied to the year, its days follow, the sentinel plan goes"),
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  kitchenMealPlanDays: {
    year: byHand("follow the copied meal plan (no ON UPDATE CASCADE)"),
  },
  kitchenMenuItems: {
    year: "as-is",
    erasure: {
      addedByUserId: byWhom,
    },
  },
  kitchenSnacks: {
    year: "as-is",
    erasure: {
      addedByUserId: byWhom,
    },
  },
  kitchenShoppingTicks: {
    year: "as-is",
    erasure: {
      tickedByUserId: byWhom,
    },
  },
  kitchenShoppingPrices: {
    year: "as-is",
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  recipeAllergenCorrections: {
    year: "none",
    erasure: {
      setByUserId: byWhom,
    },
  },
  kitchenAllergenPlans: {
    year: "none",
    erasure: {
      setByUserId: byWhom,
    },
  },
  kitchenPrepSteps: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
    },
  },
  documents: {
    year: "none",
    erasure: {
      authorId: byWhom,
    },
  },
  guideSections: {
    year: "none",
    erasure: {
      updatedBy: byWhom,
    },
  },
  documentVersions: {
    year: "none",
    erasure: {
      publishedBy: byWhom,
    },
  },
  documentReads: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  reimbursements: {
    year: "as-is",
    erasure: {
      submitterId: scrub(
        "claims",
        'the claim stays for accounting; bank details become "", the decision note goes, its receipt rows go',
      ),
      approverId: byWhom,
      paidById: byWhom,
    },
  },
  reimbursementFiles: { year: "none" },
  teamBudgets: { year: byHand("counted for the receipt") },
  teamPrograms: { year: "none" },
  teamRoleSettings: { year: "as-is" },
  teamRoles: { year: "as-is" },
  teamRoleHolders: {
    year: "none",
    erasure: {
      userId: del,
      addedByUserId: byWhom,
    },
  },
  teamRoleKeen: {
    year: "as-is",
    erasure: {
      userId: del,
    },
  },
  // Their desktop: icon cells and the folder names they typed.
  desktopLayouts: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  // Their INKBLOT runs: the initials they typed on the board.
  inkblotScores: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  pushTokens: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  broadcasts: {
    year: "none",
    erasure: {
      senderId: byWhom,
      pinnedBy: byWhom,
    },
  },
  broadcastTargets: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  notificationDeliveries: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  tasks: {
    year: "none",
    erasure: {
      assigneeId: byWhom,
      createdByUserId: byWhom,
    },
  },
  taskDeadlineReminders: {
    year: "none",
    erasure: {
      // Owner, 2026-10-19: keep.
      userId: keep(
        "a marker that the reminder went (no words of theirs); deleting it could send the same reminder again",
      ),
    },
  },
  meetingNotes: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
      updatedByUserId: byWhom,
    },
  },
  meetingNoteAttendees: {
    year: "none",
    erasure: {
      // Owner, 2026-10-19: keep.
      userId: keep("the minutes say a Lost Cat was there, like an author link"),
    },
  },
  meetingNoteDecisions: { year: "none" },
  meetingNoteActionItems: {
    year: "none",
    erasure: {
      assigneeId: byWhom,
    },
  },
  campEvents: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
      updatedByUserId: byWhom,
    },
  },
  adoptees: {
    year: byHand("counted for the receipt"),
    erasure: {
      sponsorId: keep(
        "the adoptee is another person's record; their sponsor reads as the Lost Cat",
      ),
      approvedById: byWhom,
    },
  },
  workshops: {
    year: "none",
    erasure: {
      hostId: byWhom,
    },
  },
  workshopRsvps: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  loungeOffers: {
    year: "as-is",
    erasure: {
      hostId: del,
      decidedByUserId: byWhom,
    },
  },
  loungeSlots: {
    year: "as-is",
    erasure: {
      placedByUserId: byWhom,
    },
  },
  loungeSettings: {
    year: "as-is",
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  pets: {
    year: "none",
    erasure: {
      ownerId: scrub(
        "pets",
        "a pet they sent in (it has photos) goes; a seeded cat linked to them stays, linked to nobody",
      ),
      markedInByUserId: byWhom,
    },
  },
  inventoryItems: {
    year: "none",
    erasure: {
      custodianUserId: keep(
        "gear kept at their home keeps pointing at the Lost Cat: the camp still has to find it",
      ),
      lastCheckedByUserId: byWhom,
      createdByUserId: byWhom,
    },
  },
  inventoryUpdates: {
    year: "none",
    erasure: {
      proposedByUserId: byWhom,
      custodianUserId: byWhom,
      reviewedByUserId: byWhom,
    },
  },
  inventoryNeeds: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
    },
  },
  inventoryPledges: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  inventoryBookings: {
    year: "as-is",
    erasure: {
      userId: del,
    },
  },
  inventoryLoans: {
    year: "as-is",
    erasure: {
      lentByUserId: byWhom,
      returnedByUserId: byWhom,
    },
  },
  generators: {
    year: "none",
    erasure: {
      createdByUserId: byWhom,
    },
  },
  powerLoads: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
    },
  },
  powerPlans: {
    year: "as-is",
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  fuelCans: {
    year: "as-is",
    erasure: {
      ownerUserId: scrub(
        "fuelCans",
        "a can they owned becomes the camp's; the can stays on the sheet",
      ),
      travelsWithUserId: scrub("fuelCans", "a can in their car goes on no car"),
      createdByUserId: byWhom,
    },
  },
  powerGridNodes: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
    },
  },
  generatorReadinessItems: {
    year: "as-is",
    erasure: {
      ownerUserId: byWhom,
      doneByUserId: byWhom,
      createdByUserId: byWhom,
    },
  },
  powerWorkPlanTasks: { year: "as-is" },
  powerSharingAgreements: {
    year: "as-is",
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  campLayouts: {
    year: byHand(
      "copied without its share link, which moves once the sentinel layout is gone",
    ),
    erasure: {
      sharedByUserId: byWhom,
    },
  },
  campLayoutVersions: {
    year: byHand("follow the copied layout (no ON UPDATE CASCADE)"),
    erasure: {
      savedByUserId: byWhom,
    },
  },
  logisticsPhases: {
    year: "as-is",
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  logisticsAttendance: {
    year: "as-is",
    erasure: {
      userId: del,
    },
  },
  afrikaburnDeadlines: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
      updatedByUserId: byWhom,
    },
  },
  shiftTypes: {
    year: "as-is",
    erasure: {
      createdByUserId: byWhom,
      updatedByUserId: byWhom,
    },
  },
  shiftSlots: { year: "none" },
  shiftSignups: {
    year: "none",
    erasure: {
      userId: del,
      addedByUserId: byWhom,
    },
  },
  volunteerShifts: {
    year: "as-is",
    erasure: {
      userId: del,
    },
  },
  auditLog: {
    year: "none",
    erasure: {
      actorId: keep(
        "the audit record keeps its actor by design, now the Lost Cat",
      ),
    },
  },
  actionRateLimit: { year: "none" },
  telegramChats: {
    year: "none",
    erasure: {
      addedByUserId: byWhom,
    },
  },
  // Live access grants (this and the two MCP grants): the users-level cascade
  // never fires, so without the delete a token keeps answering for them.
  telegramInvites: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  telegramAnnouncements: { year: "none" },
  // A live way into a member's private chat with Ol' Jeb, like an invite.
  telegramLinkCodes: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  telegramUpdates: { year: "none" },
  mcpOauthClients: { year: "none" },
  mcpAuthCodes: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  mcpAccessTokens: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
  mcpAuditLog: {
    year: "none",
    erasure: {
      userId: scrub(
        "connectorLog",
        "the call log stays, like audit_log; what they passed in and the error text go",
      ),
    },
  },
  campSettings: {
    year: "none",
    erasure: {
      bootstrappedByUserId: byWhom,
    },
  },
  joinSiteContent: {
    year: "as-is",
    erasure: {
      updatedByUserId: byWhom,
    },
  },
  questionnaireDefinitions: {
    year: "none",
    erasure: {
      createdBy: byWhom,
    },
  },
  questionnaireVersions: {
    year: "none",
    erasure: {
      publishedByUserId: byWhom,
    },
  },
  // The builder questionnaires' answer store: every other answer they gave.
  questionnaireResponses: {
    year: byHand("counted for the receipt"),
    erasure: {
      userId: del,
    },
  },
  // Screenshots on bug reports (#313): the web app deletes the pictures after
  // the erasure commits; the public issues never held them.
  reportScreenshots: {
    year: "none",
    erasure: {
      userId: del,
    },
  },
} as const satisfies { readonly [K in TableKey]: TableLifecycleEntry<K> };

type Lifecycle = typeof TABLE_LIFECYCLE;
const TABLE_KEYS = Object.keys(TABLE_LIFECYCLE) as TableKey[];

type AsIsKey = {
  [K in TableKey]: Lifecycle[K]["year"] extends "as-is" ? K : never;
}[TableKey];

/** The SQL name of a table. */
export function tableName(key: TableKey): string {
  return getTableConfig(schema[key]).name;
}

/**
 * The year-scoped tables setFoundingYear moves off the sentinel with one plain
 * UPDATE each (`year: "as-is"`).
 */
export const YEAR_TABLES_ADOPTED_AS_IS = TABLE_KEYS.filter(
  (key) => TABLE_LIFECYCLE[key].year === "as-is",
).map((key) => schema[key]) as Schema[AsIsKey][];

/** The year-scoped tables setFoundingYear adopts one by one, by SQL name. */
export const YEAR_TABLES_ADOPTED_BY_HAND: readonly string[] = TABLE_KEYS.filter(
  (key) => typeof TABLE_LIFECYCLE[key].year === "object",
).map(tableName);

/** Every table with a `cycle` column, by SQL name, sorted. */
export const YEAR_SCOPED_TABLES: readonly string[] = TABLE_KEYS.filter(
  (key) => TABLE_LIFECYCLE[key].year !== "none",
)
  .map(tableName)
  .sort();

/** Every column's erasure decision, flat: one row per (table, column). */
export const ERASURE_DECISIONS: readonly {
  key: TableKey;
  table: PgTable;
  property: string;
  column: Column;
  decision: ErasureDecision;
}[] = TABLE_KEYS.flatMap((key) => {
  const entry = TABLE_LIFECYCLE[key] as {
    erasure?: Record<string, ErasureDecision>;
  };
  const columns: Record<string, Column> = getTableColumns(schema[key]);
  return Object.entries(entry.erasure ?? {}).map(([property, decision]) => {
    const column = columns[property];
    if (!column) throw new Error(`table-lifecycle: no ${key}.${property}`);
    return { key, table: schema[key], property, column, decision };
  });
});

/** What sanitiseAccount deletes in its loop: the member's rows by each column. */
export const ERASURE_DELETES = ERASURE_DECISIONS.filter(
  (d) => d.decision.policy === "delete",
).map(({ table, column }) => ({ table, column }));
