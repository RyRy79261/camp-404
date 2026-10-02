import { z } from "zod";

// Power on site and before it (#255 the fuel cans the camp prints, #256 the
// grid plan, #257 generator readiness and sharing with a neighbouring camp).
// What the Power & Lighting team types; the maths lives in @camp404/core and
// who may write is the server's rule (canEditPower), never this shape's.
// There is no money here: litres, amps and dates only.

const RowId = z.guid();

/**
 * A member's id. Not a guid check: the E2E test store's members have ids of
 * their own shape. The database refuses anything but a real member.
 */
const MemberId = z.string().trim().min(1).max(100);

/** A blank form field is no answer, not an empty string. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .max(max, message)
      .nullish()
      .transform((v) => v ?? null),
  );

/** A blank number field is no answer. */
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    schema.nullable(),
  );

// --- The fuel cans (#255; the owner's register, 2026-10-02) ----------------
//
// The camp takes a set number of jerry cans; they are never refilled at the
// burn. AfrikaBurn's Fire & Fuel keep the full ones at their depot, bring
// them to camp and take the empties back, and the four ticks (Filled, At fuel
// depot, At camp, Returned) are made on the printed sheet, never in the app.
// So the app keeps only the list the sheet prints: each can's owner, size,
// what it is made of, the car it travels with, and a note. Who fills a can is
// never stored: it is the driver of the car it travels with.

/** What a can is made of. */
export const CAN_MATERIALS = ["metal", "plastic"] as const;
export const CanMaterial = z.enum(CAN_MATERIALS);
export type CanMaterial = z.infer<typeof CanMaterial>;

/** The largest container the list takes, in litres. */
export const MAX_CAN_LITRES = 250;

const canFields = {
  /** The member who owns it; null is the camp's own can. */
  ownerUserId: MemberId.nullable(),
  sizeLitres: z
    .number({ error: "Give the can's size in litres." })
    .gt(0, "Give the can's size in litres.")
    .max(MAX_CAN_LITRES, `A can holds at most ${MAX_CAN_LITRES} L.`),
  material: CanMaterial,
  /** The car it travels with, by its driver; null is not on a car yet. */
  travelsWithUserId: MemberId.nullable(),
  note: optionalText(80, "Keep the note under 80 characters."),
};

/** A can added to this year's list. */
export const FuelCanInput = z.object(canFields);
export type FuelCanInput = z.infer<typeof FuelCanInput>;

/** A can changed, from the version the editor saw. */
export const EditFuelCanInput = z.object({
  ...canFields,
  canId: RowId,
  expectedVersion: z.number().int().min(0),
});
export type EditFuelCanInput = z.infer<typeof EditFuelCanInput>;

/** A can taken off the list, from the version the editor saw. */
export const RemoveFuelCanInput = z.object({
  canId: RowId,
  expectedVersion: z.number().int().min(0),
});
export type RemoveFuelCanInput = z.infer<typeof RemoveFuelCanInput>;

// --- The grid (#256) -------------------------------------------------------

/** A point on the grid: the generator, a junction, or where things plug in. */
export const GRID_NODE_KINDS = ["generator", "junction", "end_point"] as const;
export const GridNodeKind = z.enum(GRID_NODE_KINDS);
export type GridNodeKind = z.infer<typeof GridNodeKind>;

const gridFields = {
  name: z
    .string()
    .trim()
    .min(1, "Name the point.")
    .max(60, "Keep the name under 60 characters."),
  kind: GridNodeKind,
  /** The point that feeds it; none for a generator. */
  parentId: RowId.nullish().transform((v) => v ?? null),
  /** The cable of the run that feeds it, such as "25 m extension reel". */
  cable: optionalText(80, "Keep the cable under 80 characters."),
  cableLengthM: optionalNumber(
    z.number().gt(0, "Give the length in metres.").max(1_000),
  ),
  /** Conductor size in mm², which suggests a rating; never the rating. */
  cableGaugeMm2: optionalNumber(z.number().gt(0).max(100)),
  /** The amps the cable is rated for; none shows "rating unknown". */
  cableRatedAmps: optionalNumber(
    z.number().gt(0, "Give the rating in amps.").max(1_000),
  ),
  /** The adapter or multiplug at the far end. */
  adapter: optionalText(80, "Keep the adapter under 80 characters."),
  /** True has it, false must get it, null (the default) not checked yet. */
  haveCable: z.boolean().nullable().default(null),
  haveAdapter: z.boolean().nullable().default(null),
};

type GridFields = z.infer<z.ZodObject<typeof gridFields>>;

function checkGridNode(node: GridFields, ctx: z.RefinementCtx) {
  if (node.kind === "generator" && node.parentId !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["parentId"],
      message: "A generator is where the grid starts: nothing feeds it.",
    });
  }
  if (node.kind !== "generator" && node.parentId === null) {
    ctx.addIssue({
      code: "custom",
      path: ["parentId"],
      message: "Say which point feeds it.",
    });
  }
}

/** A generator has no run into it, so it keeps no cable or adapter. */
function normaliseGridNode<T extends GridFields>(node: T): T {
  if (node.kind !== "generator") return node;
  return {
    ...node,
    cable: null,
    cableLengthM: null,
    cableGaugeMm2: null,
    cableRatedAmps: null,
    adapter: null,
    haveCable: null,
    haveAdapter: null,
  };
}

export const GridNodeInput = z
  .object(gridFields)
  .superRefine(checkGridNode)
  .transform(normaliseGridNode);
export type GridNodeInput = z.infer<typeof GridNodeInput>;

export const EditGridNodeInput = z
  .object({
    ...gridFields,
    nodeId: RowId,
    expectedVersion: z.number().int().min(0),
  })
  .superRefine(checkGridNode)
  .transform(normaliseGridNode);
export type EditGridNodeInput = z.infer<typeof EditGridNodeInput>;

/** Plug a load in at a point on the grid, or take it off (null). */
export const AssignLoadInput = z.object({
  loadId: RowId,
  nodeId: RowId.nullable(),
});
export type AssignLoadInput = z.infer<typeof AssignLoadInput>;

// --- Generator readiness (#257) --------------------------------------------

/**
 * The checklist every generator starts the year with (the power lead's plan).
 * Keys are stored; labels are what people read.
 */
export const READINESS_TEMPLATE = [
  { key: "runs", label: "Starts and runs under load" },
  { key: "serviced", label: "Serviced, or checked it doesn't need it" },
  { key: "oil", label: "Oil checked and topped up" },
  { key: "spark_plug", label: "Spark plug checked" },
  { key: "tank_clean", label: "Tank clean, old fuel drained" },
  { key: "transport", label: "Transport booked" },
  { key: "sound_boards", label: "Sound boards packed" },
  { key: "earthing", label: "Earth spike and lead packed" },
  { key: "extinguisher", label: "Fire extinguisher at the generator" },
] as const;

/** The key of an item someone added beyond the template. */
export const CUSTOM_READINESS_KEY = "custom";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(v: string): boolean {
  if (!DAY.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toISOString().slice(0, 10) === v;
}

export const AddReadinessItemInput = z.object({
  generatorId: RowId,
  label: z
    .string()
    .trim()
    .min(1, "Say what needs doing.")
    .max(80, "Keep it under 80 characters."),
});
export type AddReadinessItemInput = z.infer<typeof AddReadinessItemInput>;

/** Who sees to an item and by when. */
export const EditReadinessItemInput = z.object({
  itemId: RowId,
  expectedVersion: z.number().int().min(0),
  ownerUserId: MemberId.nullable(),
  dueOn: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().refine(isCalendarDay, "Pick a real day.").nullable(),
  ),
});
export type EditReadinessItemInput = z.infer<typeof EditReadinessItemInput>;

/** Tick an item done, or not, from the state the member saw. */
export const TickReadinessItemInput = z.object({
  itemId: RowId,
  done: z.boolean(),
});
export type TickReadinessItemInput = z.infer<typeof TickReadinessItemInput>;

/**
 * The Power & Lighting team's work plan: the tasks it starts the year with on
 * the task board, when there is no earlier year to copy.
 */
export const POWER_WORK_PLAN_TEMPLATE = [
  {
    title: "Generator: transport, check or service, install, sound boards",
    description:
      "Get it running before the burn, book the transport, set it up on site and put the sound boards round it.",
  },
  {
    title: "Grid: cables, junctions and set-up",
    description:
      "Check the grid plan, find or buy what is missing, and lay it out on set-up day.",
  },
  {
    title: "Fuel: amount, transport and decanting",
    description:
      "Buy the litres the fuel estimate says, carry them safely and decant on site.",
  },
  {
    title: "Fuelling shifts",
    description: "Who fills the generator, and when, through the burn.",
  },
  {
    title: "Functional lighting",
    description: "Kitchen, paths, toilets and the campsite.",
  },
  {
    title: "Decorative lighting",
    description: "The lights that make the camp look good at night.",
  },
] as const;

// --- Sharing with a neighbouring camp (#257) -------------------------------

/** Whose generator a shared year runs on. */
export const SHARE_GENERATOR_SOURCES = ["ours", "theirs"] as const;
export const ShareGeneratorSource = z.enum(SHARE_GENERATOR_SOURCES);
export type ShareGeneratorSource = z.infer<typeof ShareGeneratorSource>;

/**
 * Whether text looks like a phone number or an email address. The agreement
 * names a role ("their power lead"), never a person's contact details.
 */
export function looksLikeContactDetail(text: string): boolean {
  if (text.includes("@")) return true;
  // A phone number is 7 or more digits once its spaces, dashes, brackets and
  // plus are gone. Times ("00:00–08:00") keep their colons, so they pass.
  return /\d{7,}/.test(text.replace(/[\s\-–().+/]/g, ""));
}

const noContactDetails = (max: number, label: string) =>
  optionalText(max, `Keep ${label} under ${max} characters.`).refine(
    (v) => v === null || !looksLikeContactDetail(v),
    "Give a role, not a phone number or an email address.",
  );

export const SharingAgreementInput = z
  .object({
    partnerCamp: z
      .string()
      .trim()
      .min(1, "Name the neighbouring camp.")
      .max(80, "Keep the camp's name under 80 characters."),
    /** Who to speak to there, as a role: "their power lead". */
    contactRole: noContactDetails(60, "the role"),
    generatorSource: ShareGeneratorSource,
    /** Ours: which of the camp's generators. */
    generatorId: RowId.nullish().transform((v) => v ?? null),
    /** Theirs: what it is, as a note. */
    theirGenerator: optionalText(80, "Keep the generator under 80 characters."),
    /**
     * Their share of the fuel, in percent. Null uses the share proposed from
     * each camp's kWh.
     */
    partnerFuelPct: optionalNumber(
      z.number().min(0, "Use 0% to 100%.").max(100, "Use 0% to 100%."),
    ),
    /** Who covers which generator watches: camps and times, no names. */
    watchCover: noContactDetails(300, "the watches"),
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((a, ctx) => {
    if (a.generatorSource === "ours" && a.generatorId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["generatorId"],
        message: "Pick which of our generators.",
      });
    }
  })
  .transform((a) => ({
    ...a,
    generatorId: a.generatorSource === "ours" ? a.generatorId : null,
    theirGenerator: a.generatorSource === "theirs" ? a.theirGenerator : null,
  }));
export type SharingAgreementInput = z.infer<typeof SharingAgreementInput>;
