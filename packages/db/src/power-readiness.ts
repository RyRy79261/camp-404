import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  max,
  sql,
} from "drizzle-orm";
import { POWER_TEAM } from "@camp404/core";
import {
  CUSTOM_READINESS_KEY,
  POWER_WORK_PLAN_TEMPLATE,
  READINESS_TEMPLATE,
  type AddReadinessItemInput,
  type EditReadinessItemInput,
  type SharingAgreementInput,
  type ShareGeneratorSource,
  type Team,
} from "@camp404/types";
import type { DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, type Tx } from "./index";
import {
  GENERATOR_GONE,
  UUID,
  assertPowerEditor,
  refuse,
  write,
  type PowerWriteResult,
} from "./power";
import * as schema from "./schema";
import { addTaskWithin } from "./tasks";

// Before the burn (#257): each generator's readiness checklist, the Power &
// Lighting team's work plan on the task board, and a year's agreement to
// share a generator with a neighbouring camp.
//
//  - Anyone in the camp reads them; only a captain or a Power & Lighting lead
//    writes (assertPowerEditor, inside each write's transaction).
//  - All three are the year's, stamped with currentCycleNumber() in the write.
//  - Edits are compare-and-set: an item's version, the agreement's version,
//    and a tick against the done state the member saw.
//  - The agreement names a camp and a contact ROLE, never a person's phone or
//    email, and splits fuel in percent and litres, never money. It is shown
//    only inside the app.
//
// No audit_log rows: team planning data. PGlite has one connection: inside a
// transaction, only `tx`.

export const READINESS_ALREADY_STARTED =
  "This generator's checklist is already started. Reload the page.";
export const READINESS_ITEM_GONE =
  "That item isn't on the checklist any more. Reload the page.";
export const READINESS_ITEM_CHANGED =
  "Someone changed this item first. Reload the page.";
export const READINESS_TICKED_FIRST =
  "Someone ticked this item first. Reload the page.";
export const READINESS_OWNER_NOT_MEMBER =
  "Pick an approved camp member to see to it.";
export const WORK_PLAN_ALREADY_ON_BOARD =
  "This year's work plan is already on the task board.";
export const SHARING_CHANGED =
  "Someone changed the sharing agreement first. Reload the page.";
export const SHARING_GONE =
  "There is no sharing agreement to remove. Reload the page.";

// --- Shapes ------------------------------------------------------------------

export interface ReadinessItemRow {
  id: string;
  cycle: number;
  generatorId: string;
  itemKey: string;
  label: string;
  ownerUserId: string | null;
  ownerName: string | null;
  dueOn: string | null;
  doneAt: Date | null;
  doneByName: string | null;
  sort: number;
  version: number;
}

export interface WorkPlanTaskRow {
  taskId: string;
  title: string;
  status: string;
  assigneeName: string | null;
  dueAt: Date | null;
}

export interface SharingAgreement {
  cycle: number;
  partnerCamp: string;
  contactRole: string | null;
  generatorSource: ShareGeneratorSource;
  generatorId: string | null;
  theirGenerator: string | null;
  partnerFuelPct: number | null;
  watchCover: string | null;
  version: number;
  updatedAt: Date;
}

// --- Readiness ---------------------------------------------------------------

/** A year's checklist items for every generator, in checklist order. */
export async function listReadinessItems(
  cycle?: number,
): Promise<ReadinessItemRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const owner = aliasedTable(schema.users, "owner");
  const doneBy = aliasedTable(schema.users, "done_by");
  const i = schema.generatorReadinessItems;
  return db
    .select({
      id: i.id,
      cycle: i.cycle,
      generatorId: i.generatorId,
      itemKey: i.itemKey,
      label: i.label,
      ownerUserId: i.ownerUserId,
      ownerName: owner.displayName,
      dueOn: i.dueOn,
      doneAt: i.doneAt,
      doneByName: doneBy.displayName,
      sort: i.sort,
      version: i.version,
    })
    .from(i)
    .leftJoin(owner, eq(owner.id, i.ownerUserId))
    .leftJoin(doneBy, eq(doneBy.id, i.doneByUserId))
    .where(eq(i.cycle, year))
    .orderBy(asc(i.sort), asc(i.createdAt));
}

/** Holds one generator's checklist for the year. */
async function lockChecklist(tx: Tx, cycle: number, generatorId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`readiness:${generatorId}`}), ${cycle})`,
  );
}

/** A generator in service, or a refusal. */
async function assertLiveGenerator(tx: DbOrTx, generatorId: string) {
  if (!UUID.test(generatorId)) refuse(GENERATOR_GONE);
  const [row] = await tx
    .select({ id: schema.generators.id })
    .from(schema.generators)
    .where(
      and(
        eq(schema.generators.id, generatorId),
        isNull(schema.generators.archivedAt),
      ),
    );
  if (!row) refuse(GENERATOR_GONE);
}

/** The checklist's next place for a generator this year. */
async function nextSort(tx: Tx, cycle: number, generatorId: string) {
  const [row] = await tx
    .select({ sort: max(schema.generatorReadinessItems.sort) })
    .from(schema.generatorReadinessItems)
    .where(
      and(
        eq(schema.generatorReadinessItems.cycle, cycle),
        eq(schema.generatorReadinessItems.generatorId, generatorId),
      ),
    );
  return (row?.sort ?? -1) + 1;
}

/** Starts a generator's checklist for the year from the template. */
export async function startReadinessChecklist(input: {
  actorId: string;
  generatorId: string;
}): Promise<PowerWriteResult<{ count: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    await assertLiveGenerator(tx, input.generatorId);
    const cycle = await currentCycleNumber(tx);
    await lockChecklist(tx, cycle, input.generatorId);
    if ((await nextSort(tx, cycle, input.generatorId)) > 0) {
      refuse(READINESS_ALREADY_STARTED);
    }
    await tx.insert(schema.generatorReadinessItems).values(
      READINESS_TEMPLATE.map((item, sort) => ({
        cycle,
        generatorId: input.generatorId,
        itemKey: item.key,
        label: item.label,
        sort,
        createdByUserId: input.actorId,
      })),
    );
    return { count: READINESS_TEMPLATE.length };
  });
}

/** Adds an item of the team's own to a generator's checklist. */
export async function addReadinessItem(
  input: AddReadinessItemInput & { actorId: string },
): Promise<PowerWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    await assertLiveGenerator(tx, input.generatorId);
    const cycle = await currentCycleNumber(tx);
    await lockChecklist(tx, cycle, input.generatorId);
    const [row] = await tx
      .insert(schema.generatorReadinessItems)
      .values({
        cycle,
        generatorId: input.generatorId,
        itemKey: CUSTOM_READINESS_KEY,
        label: input.label,
        sort: await nextSort(tx, cycle, input.generatorId),
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.generatorReadinessItems.id });
    return { id: row!.id };
  });
}

async function assertApprovedMember(tx: DbOrTx, userId: string) {
  if (!UUID.test(userId)) refuse(READINESS_OWNER_NOT_MEMBER);
  const [row] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    );
  if (!row) refuse(READINESS_OWNER_NOT_MEMBER);
}

async function itemLoss(tx: Tx, itemId: string, cycle: number): Promise<never> {
  const [row] = await tx
    .select({ id: schema.generatorReadinessItems.id })
    .from(schema.generatorReadinessItems)
    .where(
      and(
        eq(schema.generatorReadinessItems.id, itemId),
        eq(schema.generatorReadinessItems.cycle, cycle),
      ),
    );
  refuse(row ? READINESS_ITEM_CHANGED : READINESS_ITEM_GONE);
}

/** Who sees to an item and by when; compare-and-set on its version. */
export async function updateReadinessItem(
  input: EditReadinessItemInput & { actorId: string },
): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.itemId)) refuse(READINESS_ITEM_GONE);
    if (input.ownerUserId !== null) {
      await assertApprovedMember(tx, input.ownerUserId);
    }
    const cycle = await currentCycleNumber(tx);
    const i = schema.generatorReadinessItems;
    const [row] = await tx
      .update(i)
      .set({
        ownerUserId: input.ownerUserId,
        dueOn: input.dueOn,
        version: sql`${i.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(i.id, input.itemId),
          eq(i.cycle, cycle),
          eq(i.version, input.expectedVersion),
        ),
      )
      .returning({ id: i.id });
    if (!row) await itemLoss(tx, input.itemId, cycle);
    return {};
  });
}

/**
 * Ticks an item done, or not done. A compare-and-set on the state the member
 * saw: ticking an item someone ticked first is refused, not repeated.
 */
export async function tickReadinessItem(input: {
  actorId: string;
  itemId: string;
  done: boolean;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.itemId)) refuse(READINESS_ITEM_GONE);
    const cycle = await currentCycleNumber(tx);
    const i = schema.generatorReadinessItems;
    const now = new Date();
    const [row] = await tx
      .update(i)
      .set({
        doneAt: input.done ? now : null,
        doneByUserId: input.done ? input.actorId : null,
        version: sql`${i.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(i.id, input.itemId),
          eq(i.cycle, cycle),
          input.done ? isNull(i.doneAt) : isNotNull(i.doneAt),
        ),
      )
      .returning({ id: i.id });
    if (row) return {};
    const [exists] = await tx
      .select({ id: i.id })
      .from(i)
      .where(and(eq(i.id, input.itemId), eq(i.cycle, cycle)));
    refuse(exists ? READINESS_TICKED_FIRST : READINESS_ITEM_GONE);
  });
}

/** Takes an item off the checklist, if nobody changed it first. */
export async function removeReadinessItem(input: {
  actorId: string;
  itemId: string;
  expectedVersion: number;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.itemId)) refuse(READINESS_ITEM_GONE);
    const cycle = await currentCycleNumber(tx);
    const i = schema.generatorReadinessItems;
    const [row] = await tx
      .delete(i)
      .where(
        and(
          eq(i.id, input.itemId),
          eq(i.cycle, cycle),
          eq(i.version, input.expectedVersion),
        ),
      )
      .returning({ id: i.id });
    if (!row) await itemLoss(tx, input.itemId, cycle);
    return {};
  });
}

// --- The work plan -----------------------------------------------------------

/** A year's work-plan tasks (this year by default), as the board has them now. */
export async function listWorkPlanTasks(
  cycle?: number,
): Promise<WorkPlanTaskRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const assignee = aliasedTable(schema.users, "assignee");
  return db
    .select({
      taskId: schema.tasks.id,
      title: schema.tasks.title,
      status: schema.tasks.status,
      assigneeName: assignee.displayName,
      dueAt: schema.tasks.dueAt,
    })
    .from(schema.powerWorkPlanTasks)
    .innerJoin(
      schema.tasks,
      eq(schema.tasks.id, schema.powerWorkPlanTasks.taskId),
    )
    .leftJoin(assignee, eq(assignee.id, schema.tasks.assigneeId))
    .where(eq(schema.powerWorkPlanTasks.cycle, year))
    .orderBy(asc(schema.powerWorkPlanTasks.sort));
}

/** The latest year before this one with a work plan, or null. */
export async function previousWorkPlanCycle(): Promise<number | null> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const [row] = await db
    .select({ cycle: max(schema.powerWorkPlanTasks.cycle) })
    .from(schema.powerWorkPlanTasks)
    .where(lt(schema.powerWorkPlanTasks.cycle, cycle));
  return row?.cycle ?? null;
}

/**
 * Puts the year's work plan on the task board, as Power & Lighting tasks with
 * nobody on them yet: last year's plan as the team left it (its titles and
 * notes, from the board), or the template when there is no earlier year.
 * Once a year: a second press, or two at once, is refused.
 */
export async function addWorkPlanToBoard(input: {
  actorId: string;
}): Promise<PowerWriteResult<{ count: number; fromCycle: number | null }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('power_work_plan'), ${cycle})`,
    );
    const [here] = await tx
      .select({ taskId: schema.powerWorkPlanTasks.taskId })
      .from(schema.powerWorkPlanTasks)
      .where(eq(schema.powerWorkPlanTasks.cycle, cycle))
      .limit(1);
    if (here) refuse(WORK_PLAN_ALREADY_ON_BOARD);

    const [prev] = await tx
      .select({ cycle: schema.powerWorkPlanTasks.cycle })
      .from(schema.powerWorkPlanTasks)
      .where(lt(schema.powerWorkPlanTasks.cycle, cycle))
      .orderBy(desc(schema.powerWorkPlanTasks.cycle))
      .limit(1);
    const fromCycle = prev?.cycle ?? null;
    let plan: { title: string; description: string | null }[] =
      POWER_WORK_PLAN_TEMPLATE.map((t) => ({ ...t }));
    if (fromCycle !== null) {
      const last = await tx
        .select({
          title: schema.tasks.title,
          description: schema.tasks.description,
        })
        .from(schema.powerWorkPlanTasks)
        .innerJoin(
          schema.tasks,
          eq(schema.tasks.id, schema.powerWorkPlanTasks.taskId),
        )
        .where(eq(schema.powerWorkPlanTasks.cycle, fromCycle))
        .orderBy(asc(schema.powerWorkPlanTasks.sort));
      if (last.length > 0) plan = last;
    }

    const made: string[] = [];
    for (const task of plan) {
      const added = await addTaskWithin(tx, {
        creatorId: input.actorId,
        title: task.title,
        description: task.description,
        team: POWER_TEAM as Team,
        assigneeId: null,
        dueAt: null,
      });
      if (!added.ok) refuse(added.error);
      made.push(added.id);
    }
    await tx
      .insert(schema.powerWorkPlanTasks)
      .values(made.map((taskId, sort) => ({ cycle, taskId, sort })));
    return { count: made.length, fromCycle };
  });
}

// --- Sharing -----------------------------------------------------------------

type AgreementRow = typeof schema.powerSharingAgreements.$inferSelect;

function agreementOf(row: AgreementRow): SharingAgreement {
  return {
    cycle: row.cycle,
    partnerCamp: row.partnerCamp,
    contactRole: row.contactRole,
    generatorSource: row.generatorSource,
    generatorId: row.generatorId,
    theirGenerator: row.theirGenerator,
    partnerFuelPct: row.partnerFuelPct,
    watchCover: row.watchCover,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

/** A year's sharing agreement (this year by default), or null. */
export async function getSharingAgreement(
  cycle?: number,
): Promise<SharingAgreement | null> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const [row] = await db
    .select()
    .from(schema.powerSharingAgreements)
    .where(eq(schema.powerSharingAgreements.cycle, year));
  return row ? agreementOf(row) : null;
}

/**
 * Saves this year's agreement. `expectedVersion` 0 means the editor saw none,
 * so the save inserts one (and is refused if someone saved first); otherwise
 * it is a compare-and-set on the version.
 */
export async function saveSharingAgreement(
  input: SharingAgreementInput & { actorId: string },
): Promise<PowerWriteResult<{ version: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (input.generatorId !== null) {
      await assertLiveGenerator(tx, input.generatorId);
    }
    const cycle = await currentCycleNumber(tx);
    const a = schema.powerSharingAgreements;
    const values = {
      partnerCamp: input.partnerCamp,
      contactRole: input.contactRole,
      generatorSource: input.generatorSource,
      generatorId: input.generatorId,
      theirGenerator: input.theirGenerator,
      partnerFuelPct: input.partnerFuelPct,
      watchCover: input.watchCover,
      updatedByUserId: input.actorId,
      updatedAt: new Date(),
    };
    if (input.expectedVersion === 0) {
      const [row] = await tx
        .insert(a)
        .values({ ...values, cycle, version: 1 })
        .onConflictDoNothing({ target: a.cycle })
        .returning({ version: a.version });
      if (!row) refuse(SHARING_CHANGED);
      return { version: row.version };
    }
    const [row] = await tx
      .update(a)
      .set({ ...values, version: sql`${a.version} + 1` })
      .where(and(eq(a.cycle, cycle), eq(a.version, input.expectedVersion)))
      .returning({ version: a.version });
    if (!row) refuse(SHARING_CHANGED);
    return { version: row.version };
  });
}

/** Removes this year's agreement, if nobody changed it first. */
export async function removeSharingAgreement(input: {
  actorId: string;
  expectedVersion: number;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const a = schema.powerSharingAgreements;
    const [row] = await tx
      .delete(a)
      .where(and(eq(a.cycle, cycle), eq(a.version, input.expectedVersion)))
      .returning({ cycle: a.cycle });
    if (row) return {};
    const [exists] = await tx
      .select({ cycle: a.cycle })
      .from(a)
      .where(eq(a.cycle, cycle));
    refuse(exists ? SHARING_CHANGED : SHARING_GONE);
  });
}
