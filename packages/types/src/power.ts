import { z } from "zod";

// Power and fuel (#253 load list and power calculator, #254 generators and
// fuel estimate). What the Power & Lighting team types: the loads the camp
// plugs in, the generators it can run them on, and the year's plan. The maths
// lives in @camp404/core (power.ts); who may edit is the server's rule
// (canEditPower), never this shape's. There is no money here: fuel prices and
// purchases belong to the budget work, not to this plan.

/** What kind of thing a load is; refrigeration surges on start-up. */
export const LOAD_CATEGORIES = [
  "refrigeration",
  "lighting_functional",
  "lighting_decorative",
  "sound",
  "charging",
  "tools",
  "other",
] as const;
export const LoadCategory = z.enum(LOAD_CATEGORIES);
export type LoadCategory = z.infer<typeof LoadCategory>;

/** Areas the form suggests. A load's area is free text; these are hints. */
export const LOAD_AREA_SUGGESTIONS = [
  "kitchen",
  "lounge",
  "campsite",
  "sound",
  "charging",
  "other",
] as const;
export const LOAD_AREA_MAX = 60;

/**
 * When a load runs: all day, a number of hours somewhere in the day, or in
 * set time windows (whole hours, which may run past midnight).
 */
export const LOAD_SCHEDULES = [
  "full_time",
  "hours_per_day",
  "windows",
] as const;
export const LoadSchedule = z.enum(LOAD_SCHEDULES);
export type LoadSchedule = z.infer<typeof LoadSchedule>;

/**
 * Whose a load is. A member-owned load names no member: the camp sees only
 * "member-owned".
 */
export const LOAD_OWNERS = ["camp", "member", "neighbour"] as const;
export const LoadOwner = z.enum(LOAD_OWNERS);
export type LoadOwner = z.infer<typeof LoadOwner>;

/** Whose a generator is. A lent one names no member either. */
export const GENERATOR_OWNERS = ["camp", "member_lent", "hired"] as const;
export const GeneratorOwner = z.enum(GENERATOR_OWNERS);
export type GeneratorOwner = z.infer<typeof GeneratorOwner>;

export const FUEL_TYPES = ["petrol", "diesel"] as const;
export const FuelType = z.enum(FUEL_TYPES);
export type FuelType = z.infer<typeof FuelType>;

export const CURRENT_KINDS = ["ac", "dc"] as const;
export const CurrentKind = z.enum(CURRENT_KINDS);
export type CurrentKind = z.infer<typeof CurrentKind>;

/** The longest stay a plan covers, and the highest day number a load names. */
export const MAX_DAYS_ON_SITE = 30;
/** The most time windows one load can have. */
export const MAX_LOAD_WINDOWS = 4;

/**
 * Row ids. Postgres accepts any 8-4-4-4-12 hex string as a uuid, and so does
 * this; z.uuid() would also demand the RFC version bits.
 */
const RowId = z.guid();

/** A blank form field is no answer, not an empty string. */
const optionalText = (max: number, message?: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, message).nullish(),
  );

const hour = (message: string) =>
  z.number().int(message).min(0, message).max(23, message);

/** A whole-hour slot in the day, 0 to 23. */
const Hour = hour("Use a whole hour from 0 to 23.");

/**
 * One time window, from the start of `fromHour` to the start of `toHour`.
 * A `toHour` below `fromHour` runs past midnight (18 to 2 is 18:00–02:00).
 */
export const HourWindow = z
  .object({ fromHour: Hour, toHour: Hour })
  .refine((w) => w.fromHour !== w.toHour, {
    message: "A window must start and end at different hours.",
    path: ["toHour"],
  });
export type HourWindow = z.infer<typeof HourWindow>;

/** A day on site, counted from 1. Not a date, so last year's list still fits. */
const SiteDay = z
  .number()
  .int("Use a whole day number.")
  .min(1, "Days on site start at day 1.")
  .max(MAX_DAYS_ON_SITE, `Use a day from 1 to ${MAX_DAYS_ON_SITE}.`);

// --- Loads -----------------------------------------------------------------

const loadFields = {
  name: z.string().trim().min(1, "Name the load.").max(80),
  area: z
    .string()
    .trim()
    .min(1, "Say where it is used.")
    .max(LOAD_AREA_MAX, `Keep the area under ${LOAD_AREA_MAX} characters.`),
  category: LoadCategory,
  quantity: z
    .number()
    .int("Count whole items.")
    .min(1, "Count at least 1.")
    .max(500, "Count at most 500."),
  /** The running draw of one item, in watts. */
  wattsEach: z
    .number()
    .gt(0, "Give the watts it draws.")
    .max(20_000, "One item draws at most 20000 W."),
  /** The start-up draw of one item; the calculator's default when absent. */
  surgeWattsEach: z.number().max(100_000).nullish(),
  /** The share of the time it actually draws, such as a fridge compressor. */
  dutyPct: z
    .number()
    .min(1, "The duty cycle is at least 1%.")
    .max(100, "The duty cycle is at most 100%.")
    .default(100),
  schedule: LoadSchedule,
  hoursPerDay: z
    .number()
    .gt(0, "Give more than 0 hours.")
    .max(24, "A day has 24 hours.")
    .nullish(),
  windows: z
    .array(HourWindow)
    .min(1, "Add a time window.")
    .max(MAX_LOAD_WINDOWS, `Use at most ${MAX_LOAD_WINDOWS} windows.`)
    .nullish(),
  /** The first and last day on site it runs; neither means every day. */
  fromDay: SiteDay.nullish(),
  toDay: SiteDay.nullish(),
  volts: z.number().gt(0, "Give the voltage.").max(1_000).default(230),
  current: CurrentKind.default("ac"),
  owner: LoadOwner,
  /** The neighbouring camp that shares the generator. */
  neighbourCamp: optionalText(80, "Keep the camp's name under 80 characters."),
  inventoryItemId: RowId.nullish(),
  circuit: optionalText(40, "Keep the circuit under 40 characters."),
};

type LoadFields = z.infer<z.ZodObject<typeof loadFields>>;

function checkLoad(load: LoadFields, ctx: z.RefinementCtx) {
  if (
    load.surgeWattsEach !== undefined &&
    load.surgeWattsEach !== null &&
    load.surgeWattsEach < load.wattsEach
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["surgeWattsEach"],
      message: "The start-up draw is at least the running draw.",
    });
  }
  if (load.schedule === "hours_per_day" && load.hoursPerDay == null) {
    ctx.addIssue({
      code: "custom",
      path: ["hoursPerDay"],
      message: "Say how many hours a day it runs.",
    });
  }
  if (load.schedule === "windows" && load.windows == null) {
    ctx.addIssue({
      code: "custom",
      path: ["windows"],
      message: "Add a time window.",
    });
  }
  const { fromDay, toDay } = load;
  if ((fromDay == null) !== (toDay == null)) {
    ctx.addIssue({
      code: "custom",
      path: [fromDay == null ? "fromDay" : "toDay"],
      message: "Give both the first and the last day, or neither.",
    });
  } else if (fromDay != null && toDay != null && fromDay > toDay) {
    ctx.addIssue({
      code: "custom",
      path: ["toDay"],
      message: "The last day comes on or after the first.",
    });
  }
  if (load.owner !== "neighbour" && load.neighbourCamp != null) {
    ctx.addIssue({
      code: "custom",
      path: ["neighbourCamp"],
      message: "Only a neighbour's load names a camp.",
    });
  }
}

/**
 * What the form sends, stored as it will be kept: the fields the schedule does
 * not use are null, so a switch from windows to full time leaves no stale
 * windows behind.
 */
function normaliseLoad<T extends LoadFields>(load: T) {
  return {
    ...load,
    surgeWattsEach: load.surgeWattsEach ?? null,
    hoursPerDay:
      load.schedule === "hours_per_day" ? (load.hoursPerDay ?? null) : null,
    windows: load.schedule === "windows" ? (load.windows ?? null) : null,
    fromDay: load.fromDay ?? null,
    toDay: load.toDay ?? null,
    neighbourCamp: load.neighbourCamp ?? null,
    inventoryItemId: load.inventoryItemId ?? null,
    circuit: load.circuit ?? null,
  };
}

/** A load added to this year's list. */
export const LoadInput = z
  .object(loadFields)
  .superRefine(checkLoad)
  .transform(normaliseLoad);
export type LoadInput = z.infer<typeof LoadInput>;

/** An edit carries the load and the version the editor opened. */
export const EditLoadInput = z
  .object({
    ...loadFields,
    loadId: RowId,
    expectedVersion: z.number().int().min(0),
  })
  .superRefine(checkLoad)
  .transform(normaliseLoad);
export type EditLoadInput = z.infer<typeof EditLoadInput>;

// --- Generators ------------------------------------------------------------

const generatorFields = {
  model: z.string().trim().min(1, "Name the generator.").max(80),
  /** The continuous output the datasheet rates it for. */
  ratedKva: z.number().gt(0, "Give the rated kVA.").max(2_000),
  /** The most it gives for a moment, such as a motor starting. */
  maxKva: z.number().gt(0, "Give the maximum kVA.").max(2_000),
  tankLitres: z.number().gt(0, "Give the tank size.").max(5_000),
  /** Hours a full tank lasts at half load, from the datasheet. */
  runtime50Hours: z.number().gt(0, "Give the runtime at 50% load.").max(1_000),
  /** Hours a full tank lasts at full load, from the datasheet. */
  runtime100Hours: z
    .number()
    .gt(0, "Give the runtime at 100% load.")
    .max(1_000),
  fuelType: FuelType,
  owner: GeneratorOwner,
  inventoryItemId: RowId.nullish(),
  noiseNote: optionalText(200, "Keep the noise note under 200 characters."),
};

type GeneratorFields = z.infer<z.ZodObject<typeof generatorFields>>;

function checkGenerator(gen: GeneratorFields, ctx: z.RefinementCtx) {
  if (gen.maxKva < gen.ratedKva) {
    ctx.addIssue({
      code: "custom",
      path: ["maxKva"],
      message: "The maximum is at least the rated kVA.",
    });
  }
  if (gen.runtime100Hours >= gen.runtime50Hours) {
    ctx.addIssue({
      code: "custom",
      path: ["runtime100Hours"],
      message: "A tank runs out sooner at full load than at half load.",
    });
  }
}

function normaliseGenerator<T extends GeneratorFields>(gen: T) {
  return {
    ...gen,
    inventoryItemId: gen.inventoryItemId ?? null,
    noiseNote: gen.noiseNote ?? null,
  };
}

export const GeneratorInput = z
  .object(generatorFields)
  .superRefine(checkGenerator)
  .transform(normaliseGenerator);
export type GeneratorInput = z.infer<typeof GeneratorInput>;

export const EditGeneratorInput = z
  .object({
    ...generatorFields,
    generatorId: RowId,
    expectedVersion: z.number().int().min(0),
  })
  .superRefine(checkGenerator)
  .transform(normaliseGenerator);
export type EditGeneratorInput = z.infer<typeof EditGeneratorInput>;

// --- The year's plan -------------------------------------------------------

/** A calendar day, typed as YYYY-MM-DD. Only ever a label for day numbers. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const POWER_PLAN_DEFAULTS = {
  powerFactor: 0.8,
  daysOnSite: 7,
  /** The comparison scenario: 12 hours a day, 18:00 to 06:00. */
  compareRunFromHour: 18,
  compareRunToHour: 6,
  lowLoadFactor: 1,
  safetyMarginPct: 20,
  canLitres: 20,
  cansOwned: 0,
} as const;

const D = POWER_PLAN_DEFAULTS;

const RunHour = hour("Use a whole hour from 0 to 23.").nullable();

/** Both hours null is 24 hours a day; otherwise one daily on-window. */
function checkRunWindow(
  from: number | null,
  to: number | null,
  fromKey: string,
  toKey: string,
  ctx: z.RefinementCtx,
) {
  if ((from === null) !== (to === null)) {
    ctx.addIssue({
      code: "custom",
      path: [from === null ? fromKey : toKey],
      message:
        "Give both the start and the stop hour, or neither for 24 hours.",
    });
  } else if (from !== null && from === to) {
    ctx.addIssue({
      code: "custom",
      path: [toKey],
      message: "The generator must start and stop at different hours.",
    });
  }
}

export const PowerPlanInput = z
  .object({
    generatorId: RowId.nullable(),
    /** A second generator, recorded as a note: the plan runs on one. */
    secondGeneratorNote: optionalText(
      200,
      "Keep the note under 200 characters.",
    ),
    powerFactor: z
      .number()
      .min(0.5, "The power factor is at least 0.5.")
      .max(1, "The power factor is at most 1.")
      .default(D.powerFactor),
    daysOnSite: z
      .number()
      .int("Count whole days.")
      .min(1, "Count at least 1 day.")
      .max(MAX_DAYS_ON_SITE, `Count at most ${MAX_DAYS_ON_SITE} days.`)
      .default(D.daysOnSite),
    /** The date of day 1, only to label the days. */
    firstPoweredDay: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z
        .string()
        .regex(DAY, "Pick the first powered day.")
        .refine(
          (v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
          "Pick the first powered day.",
        )
        .nullish()
        .transform((v) => v ?? null),
    ),
    runFromHour: RunHour.default(null),
    runToHour: RunHour.default(null),
    compareRunFromHour: RunHour.default(D.compareRunFromHour),
    compareRunToHour: RunHour.default(D.compareRunToHour),
    /** Extra fuel for each running hour below half load ("extra margin"). */
    lowLoadFactor: z
      .number()
      .min(1, "The low-load factor is at least 1.")
      .max(3, "The low-load factor is at most 3.")
      .default(D.lowLoadFactor),
    safetyMarginPct: z
      .number()
      .min(0, "The margin cannot be below 0%.")
      .max(100, "The margin is at most 100%.")
      .default(D.safetyMarginPct),
    canLitres: z
      .number()
      .gt(0, "Give the can size.")
      .max(1_000)
      .default(D.canLitres),
    cansOwned: z
      .number()
      .int("Count whole cans.")
      .min(0, "Count 0 or more cans.")
      .max(10_000)
      .default(D.cansOwned),
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((plan, ctx) => {
    checkRunWindow(
      plan.runFromHour,
      plan.runToHour,
      "runFromHour",
      "runToHour",
      ctx,
    );
    checkRunWindow(
      plan.compareRunFromHour,
      plan.compareRunToHour,
      "compareRunFromHour",
      "compareRunToHour",
      ctx,
    );
  })
  .transform((plan) => ({
    ...plan,
    secondGeneratorNote: plan.secondGeneratorNote ?? null,
  }));
export type PowerPlanInput = z.infer<typeof PowerPlanInput>;
