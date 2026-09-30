import "server-only";

import {
  campStockInUse,
  campStockTaken,
  canManageRental,
  checkRentalLines,
  GEAR_ORDER_ACTION_KEY,
  GEAR_ORDER_ACTION_TITLE,
  GEAR_ORDER_REF_TYPE,
  gearOrderAskNotification,
  holdsSharers,
  isAskedForGear,
  priceRentalOrder,
  rentalChargeDescription,
  rentalSummary,
  tentInUse,
  type RentalLineDraft,
} from "@camp404/core";
import { reachRank } from "@camp404/db/power";
import {
  NOT_A_RENTAL_MANAGER,
  OWN_TENT,
  RENTAL_ITEM_MISSING,
  RENTAL_NO_SUCH_MEMBER,
  RENTAL_NOTHING_TO_SEND,
  RENTAL_ORDER_CHANGED,
  RENTAL_ORDER_CONFIRMED,
  RENTAL_ORDER_MOVED,
  RENTAL_ORDER_SENT,
  RENTAL_REOPEN_FIRST,
  RENTAL_SHARER_GONE,
  RENTAL_TENT_NOT_CONFIRMED,
  TOO_MANY_RENTAL_ITEMS,
  type MyRental,
  type RentalItem,
  type RentalLine,
  type RentalOrder,
  type RentalOverview,
  type RentalResult,
  type RentalUnanswered,
} from "@camp404/db/rental";
import type {
  RentalChoice,
  ParticipationStatus,
  RentalItemInput,
  RentalOrderStatus,
  RentalSource,
} from "@camp404/types";
import { testStore } from "./test-store";
import {
  addRentalChargeInStore,
  cancelChargeInStore,
  isChargeLiveInStore,
} from "./test-store-dues";

// The in-memory twin of @camp404/db/rental (#241), for E2E_TEST_MODE. The same
// rules, sentences and results as the database module, over the store's own
// rows: only a captain runs gear rental (the twin of lockRentalManager), a
// member writes only their own order, the confirmation is a compare-and-set
// on `submitted` and the version, and it charges the dues store. The store
// keeps no audit log and is one synchronous process, so there is nothing to
// lock. "Ask everyone" opens the store's non-blocking required action and
// pushes its notice, as the database does. Kept apart from test-store.ts, which calls in here only to reset.

interface ItemRow extends RentalItem {
  archivedAt: Date | null;
}

interface LineRow {
  id: string;
  itemId: string;
  choice: RentalChoice;
  quantity: number;
  source: RentalSource | null;
  unitPriceCents: number | null;
  tentLabel: string | null;
  ownDescription: string | null;
  ownSleeps: number | null;
  sharerIds: string[];
}

interface OrderRow {
  id: string;
  userId: string;
  cycle: number;
  status: RentalOrderStatus;
  version: number;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  totalCents: number | null;
  chargeId: string | null;
  filledByUserId: string | null;
  lines: LineRow[];
}

interface RentalState {
  items: ItemRow[];
  orders: OrderRow[];
}

const KEY = "__camp404RentalTestStore__";

function state(): RentalState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= { items: [], orders: [] } satisfies RentalState;
  return g[KEY] as RentalState;
}

/** Clear every rental row (testStore.reset calls this). */
export function resetRentalStore(): void {
  const r = state();
  r.items.length = 0;
  r.orders.length = 0;
}

/** A captain (lockRentalManager's twin). */
function isManager(actorId: string): boolean {
  if (!testStore.findUserById(actorId)) return false;
  const reach = testStore.senderReach(actorId);
  return canManageRental(reachRank(reach), reach ?? []);
}

function manager<T extends object>(
  actorId: string,
  fn: () => T | string,
): RentalResult<T> {
  if (!isManager(actorId)) return { ok: false, error: NOT_A_RENTAL_MANAGER };
  const result = fn();
  return typeof result === "string"
    ? { ok: false, error: result }
    : { ok: true, ...result };
}

const nameOf = (userId: string) =>
  testStore.findUserById(userId)?.displayName?.trim() || "Unnamed burner";

function itemsOf(cycle: number, includeArchived = false): ItemRow[] {
  return state()
    .items.filter(
      (i) => i.cycle === cycle && (includeArchived || i.archivedAt === null),
    )
    .sort(
      (a, b) =>
        Number(b.isTent) - Number(a.isTent) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

function toItem(row: ItemRow): RentalItem {
  const { archivedAt, ...item } = row;
  return { ...item, archived: archivedAt !== null };
}

function itemFields(item: RentalItemInput) {
  return {
    name: item.name,
    isTent: item.isTent,
    sleeps: item.isTent ? item.sleeps : 1,
    campPriceCents: item.campPriceCents,
    campStockCount: item.campStockCount,
    supplierPriceCents: item.supplierPriceCents,
    reserveCount: item.reserveCount,
    reserveSource: item.reserveSource,
  };
}

/** The twin of campTakenByOrders. */
function campTakenByOrders(
  cycle: number,
  exceptOrderId?: string,
): Map<string, number> {
  const taken = new Map<string, number>();
  for (const order of state().orders) {
    if (
      order.cycle !== cycle ||
      order.status !== "confirmed" ||
      order.id === exceptOrderId
    ) {
      continue;
    }
    for (const line of order.lines) {
      if (line.choice !== "need" || line.source !== "camp") continue;
      taken.set(line.itemId, (taken.get(line.itemId) ?? 0) + line.quantity);
    }
  }
  return taken;
}

/** The twin of loadOrders' shaping. */
function toOrder(row: OrderRow): RentalOrder {
  const items = new Map(state().items.map((i) => [i.id, i]));
  const lines = row.lines
    .map((l): RentalLine => {
      const item = items.get(l.itemId)!;
      return {
        id: l.id,
        itemId: l.itemId,
        itemName: item.name,
        isTent: item.isTent,
        sleeps: item.sleeps,
        choice: l.choice,
        quantity: l.quantity,
        source: l.source,
        unitPriceCents: l.unitPriceCents,
        tentLabel: l.tentLabel,
        ownDescription: l.ownDescription,
        ownSleeps: l.ownSleeps,
        sharers: l.sharerIds
          .filter((id) => testStore.findUserById(id))
          .map((id) => ({
            id,
            name: nameOf(id),
            accepted:
              testStore.getParticipation(id, row.cycle)?.status === "accepted",
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort(
      (a, b) =>
        Number(b.isTent) - Number(a.isTent) ||
        a.itemName.localeCompare(b.itemName),
    );
  return {
    id: row.id,
    userId: row.userId,
    memberName: nameOf(row.userId),
    participation:
      testStore.getParticipation(row.userId, row.cycle)?.status ?? null,
    cycle: row.cycle,
    status: row.status,
    version: row.version,
    submittedAt: row.submittedAt,
    confirmedAt: row.confirmedAt,
    totalCents: row.totalCents,
    chargeId:
      row.chargeId && isChargeLiveInStore(row.chargeId) ? row.chargeId : null,
    filledByCaptain: row.filledByUserId !== null,
    lines,
  };
}

function orderOf(userId: string, cycle: number): OrderRow | undefined {
  return state().orders.find((o) => o.userId === userId && o.cycle === cycle);
}

/** The twin of `unanswered`: coming this year, with no order or only a draft. */
function unansweredRows(cycle: number) {
  return testStore
    .allUsers()
    .filter((u) => u.approvalStatus === "approved")
    .flatMap((u) => {
      const place = testStore.getParticipation(u.id, cycle)?.status ?? null;
      const order = orderOf(u.id, cycle);
      return place !== null &&
        isAskedForGear(place) &&
        (!order || order.status === "draft")
        ? [
            {
              userId: u.id,
              participation: place,
              draft: order?.status === "draft",
            },
          ]
        : [];
    });
}

/** The twin of storeOrder: the member's own save, or a captain's fill-in. */
function storeOrder(input: {
  userId: string;
  cycle: number;
  lines: readonly RentalLineDraft[];
  submit: boolean;
  expectedVersion: number;
  from: readonly RentalOrderStatus[];
  filledBy: string | null;
  locked: (status: RentalOrderStatus | undefined) => string;
}): RentalResult<{ version: number; status: RentalOrderStatus }> {
  const refuse = (error: string) => ({ ok: false as const, error });
  if (!testStore.findUserById(input.userId)) {
    return refuse(RENTAL_NO_SUCH_MEMBER);
  }
  const checked = checkRentalLines(
    itemsOf(input.cycle),
    input.lines,
    input.userId,
  );
  if (!checked.ok) return refuse(checked.error);
  if (input.submit && checked.lines.length === 0) {
    return refuse(RENTAL_NOTHING_TO_SEND);
  }
  const sharers = checked.lines.flatMap((l) => l.sharerIds);
  if (
    sharers.some(
      (id) => testStore.findUserById(id)?.approvalStatus !== "approved",
    )
  ) {
    return refuse(RENTAL_SHARER_GONE);
  }
  const current = orderOf(input.userId, input.cycle);
  const matches =
    input.expectedVersion === 0
      ? !current
      : current !== undefined &&
        input.from.includes(current.status) &&
        current.version === input.expectedVersion;
  if (!matches) {
    return refuse(
      input.locked(
        current && !input.from.includes(current.status)
          ? current.status
          : undefined,
      ),
    );
  }
  const status: RentalOrderStatus = input.submit ? "submitted" : "draft";
  const version = input.expectedVersion + 1;
  const order: OrderRow = current ?? {
    id: crypto.randomUUID(),
    userId: input.userId,
    cycle: input.cycle,
    status,
    version,
    submittedAt: null,
    confirmedAt: null,
    totalCents: null,
    chargeId: null,
    filledByUserId: null,
    lines: [],
  };
  order.status = status;
  order.version = version;
  order.submittedAt = input.submit ? new Date() : null;
  order.filledByUserId = input.filledBy;
  order.lines = checked.lines.map((l) => ({
    id: crypto.randomUUID(),
    itemId: l.itemId,
    choice: l.choice,
    quantity: l.quantity,
    source: null,
    unitPriceCents: null,
    tentLabel: null,
    ownDescription: l.ownDescription,
    ownSleeps: l.ownSleeps,
    sharerIds: [...l.sharerIds],
  }));
  if (!current) state().orders.push(order);
  if (input.submit) {
    testStore.satisfyRequiredAction(input.userId, GEAR_ORDER_ACTION_KEY);
    testStore.readNotices(input.userId, GEAR_ORDER_REF_TYPE);
  }
  return { ok: true, version, status };
}

export const rentalTestStore = {
  // --- The catalogue -----------------------------------------------------------

  listRentalItems(
    cycle: number,
    options: { includeArchived?: boolean } = {},
  ): RentalItem[] {
    return itemsOf(cycle, options.includeArchived).map(toItem);
  },

  addRentalItem(input: {
    cycle: number;
    item: RentalItemInput;
    actorId: string;
  }): RentalResult<{ id: string }> {
    return manager(input.actorId, () => {
      if (itemsOf(input.cycle).length >= 30) return TOO_MANY_RENTAL_ITEMS;
      const id = crypto.randomUUID();
      state().items.push({
        id,
        cycle: input.cycle,
        ...itemFields(input.item),
        currency: "ZAR",
        archived: false,
        archivedAt: null,
      });
      return { id };
    });
  },

  editRentalItem(input: {
    itemId: string;
    item: RentalItemInput;
    actorId: string;
  }): RentalResult {
    return manager(input.actorId, () => {
      const row = state().items.find(
        (i) => i.id === input.itemId && i.archivedAt === null,
      );
      if (!row) return RENTAL_ITEM_MISSING;
      const inUse = state()
        .orders.filter((o) => o.status !== "draft")
        .flatMap((o) => o.lines)
        .filter((l) => l.itemId === row.id && l.choice === "need")
        .map((l) => ({ quantity: l.quantity, sharers: l.sharerIds.length }));
      if (!holdsSharers(input.item, inUse)) return tentInUse(input.item.name);
      const taken = campStockTaken(
        input.item,
        campTakenByOrders(row.cycle).get(row.id) ?? 0,
      );
      if (taken > (input.item.campStockCount ?? 0)) {
        return campStockInUse(input.item.name, taken);
      }
      Object.assign(row, itemFields(input.item));
      return {};
    });
  },

  archiveRentalItem(input: { itemId: string; actorId: string }): RentalResult {
    return manager(input.actorId, () => {
      const row = state().items.find(
        (i) => i.id === input.itemId && i.archivedAt === null,
      );
      if (!row) return RENTAL_ITEM_MISSING;
      row.archivedAt = new Date();
      return {};
    });
  },

  // --- Reads -------------------------------------------------------------------

  getMyRental(userId: string, cycle: number): MyRental {
    const row = orderOf(userId, cycle);
    const mine = row ? toOrder(row) : null;
    const confirmed = mine?.status === "confirmed";
    const items = new Map(state().items.map((i) => [i.id, i]));
    return {
      items: itemsOf(cycle).map(toItem),
      asked:
        testStore.hasOpenNudge(userId, GEAR_ORDER_ACTION_KEY) &&
        (mine === null || mine.status === "draft"),
      order: mine && {
        ...mine,
        participation: null,
        totalCents: confirmed ? mine.totalCents : null,
        lines: mine.lines.map((l) => ({
          ...l,
          source: confirmed ? l.source : null,
          unitPriceCents: confirmed ? l.unitPriceCents : null,
          tentLabel: confirmed ? l.tentLabel : null,
          sharers: l.sharers.map((s) => ({ ...s, accepted: null })),
        })),
      },
      sharedWithMe: state()
        .orders.filter((o) => o.cycle === cycle && o.status !== "draft")
        .flatMap((o) =>
          o.lines
            .filter(
              (l) =>
                items.get(l.itemId)?.isTent && l.sharerIds.includes(userId),
            )
            .map((l) => ({
              lineId: l.id,
              itemName:
                l.choice === "own"
                  ? (l.ownDescription ?? OWN_TENT)
                  : items.get(l.itemId)!.name,
              tentLabel: o.status === "confirmed" ? l.tentLabel : null,
              confirmed: o.status === "confirmed",
              ownerName: nameOf(o.userId),
              otherSharers: l.sharerIds
                .filter((id) => id !== userId && testStore.findUserById(id))
                .map(nameOf)
                .sort((a, b) => a.localeCompare(b)),
            })),
        )
        .sort((a, b) => a.ownerName.localeCompare(b.ownerName)),
    };
  },

  listRentalSharerChoices(userId: string): { id: string; name: string }[] {
    return testStore
      .allUsers()
      .filter((u) => u.approvalStatus === "approved" && u.id !== userId)
      .map((u) => ({ id: u.id, name: nameOf(u.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  listRentalOrders(cycle: number): RentalOrder[] {
    const rank: Record<RentalOrderStatus, number> = {
      submitted: 0,
      confirmed: 1,
      draft: 2,
    };
    return state()
      .orders.filter((o) => o.cycle === cycle)
      .map(toOrder)
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          a.memberName.localeCompare(b.memberName),
      );
  },

  getRentalOrderOf(userId: string, cycle: number): RentalOrder | null {
    const row = orderOf(userId, cycle);
    return row ? toOrder(row) : null;
  },

  listRentalUnanswered(cycle: number): RentalUnanswered[] {
    return unansweredRows(cycle)
      .map((r) => ({
        ...r,
        name: nameOf(r.userId),
        asked: testStore.hasOpenNudge(r.userId, GEAR_ORDER_ACTION_KEY),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  getRentalMember(
    userId: string,
    cycle: number,
  ): {
    userId: string;
    name: string;
    participation: ParticipationStatus | null;
  } | null {
    const user = testStore.findUserById(userId);
    if (!user || user.approvalStatus !== "approved") return null;
    return {
      userId,
      name: nameOf(userId),
      participation: testStore.getParticipation(userId, cycle)?.status ?? null,
    };
  },

  getRentalOverview(cycle: number): RentalOverview {
    const orders = this.listRentalOrders(cycle);
    const confirmed = orders.filter((o) => o.status === "confirmed");
    const lines = confirmed.flatMap((o) =>
      o.lines.flatMap((l) =>
        l.choice === "need" && l.source !== null && l.unitPriceCents !== null
          ? [
              {
                itemId: l.itemId,
                quantity: l.quantity,
                source: l.source,
                unitPriceCents: l.unitPriceCents,
              },
            ]
          : [],
      ),
    );
    const used = new Set(lines.map((l) => l.itemId));
    return {
      summary: rentalSummary(
        itemsOf(cycle, true)
          .map(toItem)
          .filter((i) => !i.archived || used.has(i.id)),
        lines,
      ),
      waiting: orders.filter((o) => o.status === "submitted").length,
      confirmed: confirmed.length,
      tents: confirmed
        .flatMap((o) =>
          o.lines
            .filter((l) => l.isTent && l.choice === "need")
            .map((l) => ({
              lineId: l.id,
              itemName: l.itemName,
              quantity: l.quantity,
              tentLabel: l.tentLabel,
              source: l.source,
              ownerName: o.memberName,
              sharers: l.sharers.map((s) => s.name),
            })),
        )
        .sort(
          (a, b) =>
            (a.tentLabel ?? "￿").localeCompare(b.tentLabel ?? "￿", undefined, {
              numeric: true,
            }) || a.ownerName.localeCompare(b.ownerName),
        ),
      ownTents: orders
        .filter((o) => o.status !== "draft")
        .flatMap((o) =>
          o.lines
            .filter((l) => l.isTent && l.choice === "own")
            .map((l) => ({
              lineId: l.id,
              ownerName: o.memberName,
              description: l.ownDescription,
              sleeps: l.ownSleeps,
              sharers: l.sharers.map((s) => s.name),
            })),
        )
        .sort((a, b) => a.ownerName.localeCompare(b.ownerName)),
    };
  },

  // --- A member's writes ---------------------------------------------------------

  saveRentalOrder(input: {
    userId: string;
    cycle: number;
    lines: readonly RentalLineDraft[];
    submit: boolean;
    expectedVersion: number;
  }): RentalResult<{ version: number; status: RentalOrderStatus }> {
    return storeOrder({
      ...input,
      from: ["draft"],
      filledBy: null,
      locked: (status) =>
        status === "submitted"
          ? RENTAL_ORDER_SENT
          : status === "confirmed"
            ? RENTAL_ORDER_CONFIRMED
            : RENTAL_ORDER_CHANGED,
    });
  },

  withdrawRentalOrder(input: {
    userId: string;
    cycle: number;
    expectedVersion: number;
  }): RentalResult<{ version: number }> {
    const order = orderOf(input.userId, input.cycle);
    if (
      !order ||
      order.status !== "submitted" ||
      order.version !== input.expectedVersion
    ) {
      return {
        ok: false,
        error:
          order?.status === "confirmed"
            ? RENTAL_ORDER_CONFIRMED
            : RENTAL_ORDER_CHANGED,
      };
    }
    order.status = "draft";
    order.version += 1;
    order.submittedAt = null;
    return { ok: true, version: order.version };
  },

  // --- A captain's writes ----------------------------------------------------------

  fillRentalOrderFor(input: {
    userId: string;
    cycle: number;
    lines: readonly RentalLineDraft[];
    expectedVersion: number;
    actorId: string;
  }): RentalResult<{ version: number }> {
    if (!isManager(input.actorId)) {
      return { ok: false, error: NOT_A_RENTAL_MANAGER };
    }
    const saved = storeOrder({
      userId: input.userId,
      cycle: input.cycle,
      lines: input.lines,
      submit: true,
      expectedVersion: input.expectedVersion,
      from: ["draft", "submitted"],
      filledBy: input.actorId,
      locked: (status) =>
        status === "confirmed" ? RENTAL_REOPEN_FIRST : RENTAL_ORDER_MOVED,
    });
    return saved.ok ? { ok: true, version: saved.version } : saved;
  },

  askForGearOrders(input: {
    cycle: number;
    actorId: string;
  }): RentalResult<{ asked: number; notified: number }> {
    return manager(input.actorId, () => {
      const targets = unansweredRows(input.cycle);
      let notified = 0;
      for (const target of targets) {
        testStore.openNudge({
          userId: target.userId,
          actionKey: GEAR_ORDER_ACTION_KEY,
          title: GEAR_ORDER_ACTION_TITLE,
        });
        if (testStore.hasUnreadNotice(target.userId, GEAR_ORDER_REF_TYPE)) {
          continue;
        }
        testStore.pushNotice(
          target.userId,
          gearOrderAskNotification({ requiredActionId: null }),
        );
        notified += 1;
      }
      return { asked: targets.length, notified };
    });
  },

  confirmRentalOrder(input: {
    orderId: string;
    expectedVersion: number;
    sources: readonly { lineId: string; source: RentalSource }[];
    actorId: string;
  }): RentalResult<{ totalCents: number; chargeId: string | null }> {
    return manager(input.actorId, () => {
      const order = state().orders.find((o) => o.id === input.orderId);
      if (
        !order ||
        order.status !== "submitted" ||
        order.version !== input.expectedVersion
      ) {
        return RENTAL_ORDER_MOVED;
      }
      const items = itemsOf(order.cycle, true);
      const orders = campTakenByOrders(order.cycle, order.id);
      const taken = new Map(
        items.map((i) => [i.id, campStockTaken(i, orders.get(i.id) ?? 0)]),
      );
      const priced = priceRentalOrder(items, order.lines, input.sources, taken);
      if (!priced.ok) return priced.error;
      for (const line of priced.lines) {
        const row = order.lines.find((l) => l.id === line.lineId)!;
        row.source = line.source;
        row.unitPriceCents = line.unitPriceCents;
      }
      order.status = "confirmed";
      order.version += 1;
      order.confirmedAt = new Date();
      order.totalCents = priced.totalCents;
      order.chargeId =
        priced.totalCents > 0
          ? addRentalChargeInStore({
              userId: order.userId,
              cycle: order.cycle,
              description: rentalChargeDescription(priced.lines),
              amountCents: priced.totalCents,
            })
          : null;
      return { totalCents: priced.totalCents, chargeId: order.chargeId };
    });
  },

  reopenRentalOrder(input: {
    orderId: string;
    expectedVersion: number;
    actorId: string;
  }): RentalResult {
    return manager(input.actorId, () => {
      const order = state().orders.find((o) => o.id === input.orderId);
      if (
        !order ||
        order.status !== "confirmed" ||
        order.version !== input.expectedVersion
      ) {
        return RENTAL_ORDER_MOVED;
      }
      if (order.chargeId) cancelChargeInStore(order.chargeId);
      order.status = "submitted";
      order.version += 1;
      order.confirmedAt = null;
      order.totalCents = null;
      order.chargeId = null;
      return {};
    });
  },

  setTentLabel(input: {
    lineId: string;
    label: string | null;
    actorId: string;
  }): RentalResult {
    return manager(input.actorId, () => {
      const items = new Map(state().items.map((i) => [i.id, i]));
      for (const order of state().orders) {
        const line = order.lines.find((l) => l.id === input.lineId);
        if (!line) continue;
        if (
          order.status !== "confirmed" ||
          line.choice !== "need" ||
          !items.get(line.itemId)?.isTent
        ) {
          return RENTAL_TENT_NOT_CONFIRMED;
        }
        line.tentLabel = input.label;
        return {};
      }
      return RENTAL_TENT_NOT_CONFIRMED;
    });
  },
};
