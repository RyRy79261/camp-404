import { describe, expect, it, vi } from "vitest";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { useTestDb } from "./_harness";
import {
  drainTelegramOutbox,
  TELEGRAM_MAX_DEFERRALS_IN_A_ROW,
  TELEGRAM_MAX_QUEUED_HOURS,
  type TelegramOutbox,
  type TelegramSendResult,
} from "../telegram-outbox";
import * as schema from "../schema";

// The outbox drain's protocol, once, on real Postgres: claim and commit
// `sending` before a send, the time to live, a 429 or three "not now"
// answers in a row ending the run, and the 403 hook. The queue here is a
// bare one over `telegram_announcements`; each real queue (private notices,
// posts) supplies only its rows, skips and send, and keeps its own tests.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const rows = schema.telegramAnnouncements;
const HOUR = 3600_000;

interface Row {
  id: string;
  body: string;
}

/** A queue whose send is `send(body)`; bodies in `skip` are skipped at claim. */
function testOutbox(
  send: (body: string) => Promise<TelegramSendResult>,
  hooks: {
    skip?: readonly string[];
    drop?: readonly string[];
    onBlocked?: (row: Row) => Promise<void>;
    afterSent?: (row: Row) => Promise<void>;
  } = {},
): TelegramOutbox<Row> {
  return {
    async failStuck(tx, cutoff) {
      await tx
        .update(rows)
        .set({ status: "failed" })
        .where(and(eq(rows.status, "sending"), lt(rows.createdAt, cutoff)));
    },
    claim(tx, limit, cutoff) {
      return tx
        .select({
          id: rows.id,
          body: rows.body,
          expired: sql<boolean>`${rows.createdAt} < ${cutoff}`,
        })
        .from(rows)
        .where(eq(rows.status, "queued"))
        .orderBy(asc(rows.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });
    },
    async skipAtClaim() {
      return (row) => (hooks.skip ?? []).includes(row.body);
    },
    async mark(db, id, status, fromSending) {
      await db
        .update(rows)
        .set({ status })
        .where(
          fromSending
            ? and(eq(rows.id, id), eq(rows.status, "sending"))
            : eq(rows.id, id),
        );
    },
    async prepare(row) {
      if ((hooks.drop ?? []).includes(row.body)) return null;
      return {
        send: () => send(row.body),
        afterSent: hooks.afterSent ? () => hooks.afterSent!(row) : undefined,
      };
    },
    onBlocked: hooks.onBlocked,
  };
}

let minute = 0;
async function queue(
  db: DB,
  body: string,
  values: Partial<typeof rows.$inferInsert> = {},
): Promise<string> {
  // Oldest first: each row a minute after the last.
  minute += 1;
  const [row] = await db
    .insert(rows)
    .values({
      chatId: "-100",
      body,
      createdAt: new Date(Date.now() - 2 * HOUR + minute * 60_000),
      ...values,
    })
    .returning({ id: rows.id });
  return row!.id;
}

async function statusOf(db: DB, id: string) {
  const [row] = await db
    .select({ s: rows.status })
    .from(rows)
    .where(eq(rows.id, id));
  return row!.s;
}

const ok = async (): Promise<TelegramSendResult> => ({ ok: true });

describe("drainTelegramOutbox", () => {
  const h = useTestDb();

  it("commits sending before a send, then writes the answer", async () => {
    const db = h.db();
    const id = await queue(db, "a");
    const during: string[] = [];
    const result = await drainTelegramOutbox(
      testOutbox(async () => {
        during.push(await statusOf(db, id));
        return { ok: true };
      }),
    );
    expect(during).toEqual(["sending"]);
    expect(await statusOf(db, id)).toBe("sent");
    expect(result).toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
      deferred: 0,
      expired: 0,
    });
  });

  it("skips at the claim and as it goes, and fails what waited too long", async () => {
    const db = h.db();
    const skipped = await queue(db, "skip me");
    const dropped = await queue(db, "drop me");
    const old = await queue(db, "old", {
      createdAt: new Date(Date.now() - (TELEGRAM_MAX_QUEUED_HOURS + 1) * HOUR),
    });
    const send = vi.fn(ok);
    const result = await drainTelegramOutbox(
      testOutbox(send, { skip: ["skip me"], drop: ["drop me"] }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(await statusOf(db, skipped)).toBe("skipped");
    expect(await statusOf(db, dropped)).toBe("skipped");
    expect(await statusOf(db, old)).toBe("failed");
    expect(result).toEqual({
      sent: 0,
      failed: 1,
      skipped: 2,
      deferred: 0,
      expired: 1,
    });
  });

  it("never sends a row left sending, and fails it once it is old", async () => {
    const db = h.db();
    const recent = await queue(db, "recent", { status: "sending" });
    const stuck = await queue(db, "stuck", {
      status: "sending",
      createdAt: new Date(Date.now() - (TELEGRAM_MAX_QUEUED_HOURS + 1) * HOUR),
    });
    const send = vi.fn(ok);
    await drainTelegramOutbox(testOutbox(send));
    expect(send).not.toHaveBeenCalled();
    expect(await statusOf(db, recent)).toBe("sending");
    expect(await statusOf(db, stuck)).toBe("failed");
  });

  it("ends the run at a 429 and hands back what it never tried", async () => {
    const db = h.db();
    const first = await queue(db, "a");
    const second = await queue(db, "b");
    const send = vi.fn(
      async (): Promise<TelegramSendResult> => ({
        ok: false,
        error: "Telegram 429",
        rateLimited: true,
      }),
    );
    const result = await drainTelegramOutbox(testOutbox(send));
    expect(send).toHaveBeenCalledOnce();
    expect(result.deferred).toBe(1);
    expect(await statusOf(db, first)).toBe("queued");
    expect(await statusOf(db, second)).toBe("queued");
  });

  it("ends the run after three not-now answers in a row; a send between resets the count", async () => {
    const db = h.db();
    const bodies = ["down", "down", "up", "down", "down", "down", "never"];
    const ids: string[] = [];
    for (const body of bodies) ids.push(await queue(db, body));
    const send = vi.fn(
      async (body: string): Promise<TelegramSendResult> =>
        body === "up"
          ? { ok: true }
          : body === "down"
            ? { ok: false, error: "Telegram 502", retryable: true }
            : { ok: true },
    );
    const result = await drainTelegramOutbox(testOutbox(send));
    // down, down, up (resets), down, down, down: the third in a row ends it.
    expect(send).toHaveBeenCalledTimes(6);
    expect(result.deferred).toBe(2 + TELEGRAM_MAX_DEFERRALS_IN_A_ROW);
    expect(result.sent).toBe(1);
    expect(await statusOf(db, ids[2]!)).toBe("sent");
    expect(await statusOf(db, ids[6]!)).toBe("queued");
  });

  it("puts a row whose send threw back in the queue", async () => {
    const db = h.db();
    const id = await queue(db, "a");
    const result = await drainTelegramOutbox(
      testOutbox(async () => {
        throw new Error("socket hang up");
      }),
    );
    expect(result.deferred).toBe(1);
    expect(await statusOf(db, id)).toBe("queued");
  });

  it("skips a blocked row through the queue's hook, and fails it without one", async () => {
    const db = h.db();
    const blocked = async (): Promise<TelegramSendResult> => ({
      ok: false,
      error: "Telegram 403",
      blocked: true,
    });
    const hooked = await queue(db, "a");
    const onBlocked = vi.fn(async () => undefined);
    await drainTelegramOutbox(testOutbox(blocked, { onBlocked }));
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(await statusOf(db, hooked)).toBe("skipped");

    const bare = await queue(db, "b");
    await drainTelegramOutbox(testOutbox(blocked));
    expect(await statusOf(db, bare)).toBe("failed");
  });

  it("runs the after-send step only once a row is recorded sent", async () => {
    const db = h.db();
    const sentId = await queue(db, "ok");
    await queue(db, "refused");
    const seen: string[] = [];
    await drainTelegramOutbox(
      testOutbox(
        async (body) =>
          body === "ok" ? { ok: true } : { ok: false, error: "Telegram 400" },
        {
          afterSent: async (row) => {
            seen.push(`${row.body}:${await statusOf(db, row.id)}`);
          },
        },
      ),
    );
    expect(seen).toEqual(["ok:sent"]);
    expect(await statusOf(db, sentId)).toBe("sent");
  });
});
