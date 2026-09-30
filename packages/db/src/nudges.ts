import { and, eq, inArray, isNull } from "drizzle-orm";
import type { NotificationPayload } from "@camp404/types";
import { deliveryValues } from "./deliveries";
import type { Tx } from "./index";
import * as schema from "./schema";

// A nudge: "Ask everyone" on the gate spine, never a block. First built for
// the gear order (#241), and shared with the logistics attendance ask, so
// both behave the same way:
//
//  - one NON-blocking `required_actions` row per member, opened again when it
//    was answered in an earlier year (the row is unique per member and key);
//  - one notice per member, but never a second while the first is unread;
//  - answering completes the row and reads the notice (closeNudge).
//
// Both run inside the caller's transaction, beside the caller's own writes
// and audit row.

/**
 * Open (or open again) each member's nudge and send the notice to those who
 * do not already have it unread. Returns how many were sent a notice.
 */
export async function openNudges(
  tx: Tx,
  input: {
    userIds: readonly string[];
    actionKey: string;
    title: string;
    refType: string;
    notice: (requiredActionId: string) => NotificationPayload;
    now: Date;
  },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const userIds = [...input.userIds];
  await tx
    .insert(schema.requiredActions)
    .values(
      userIds.map((userId) => ({
        userId,
        type: "questionnaire" as const,
        actionKey: input.actionKey,
        title: input.title,
        blocking: false,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.requiredActions.userId, schema.requiredActions.actionKey],
      set: { status: "pending", completedAt: null, blocking: false },
    });
  const rows = await tx
    .select({
      id: schema.requiredActions.id,
      userId: schema.requiredActions.userId,
    })
    .from(schema.requiredActions)
    .where(
      and(
        inArray(schema.requiredActions.userId, userIds),
        eq(schema.requiredActions.actionKey, input.actionKey),
      ),
    );
  const unread = await tx
    .select({ userId: schema.notificationDeliveries.userId })
    .from(schema.notificationDeliveries)
    .where(
      and(
        inArray(schema.notificationDeliveries.userId, userIds),
        eq(schema.notificationDeliveries.refType, input.refType),
        isNull(schema.notificationDeliveries.readAt),
      ),
    );
  const stillUnread = new Set(unread.map((u) => u.userId));
  const toNotify = rows.filter((r) => !stillUnread.has(r.userId));
  if (toNotify.length > 0) {
    await tx.insert(schema.notificationDeliveries).values(
      toNotify.map((row) =>
        deliveryValues(input.notice(row.id), {
          userId: row.userId,
          broadcastId: null,
          channel: "both",
          presentation: "feed",
          createdAt: input.now,
        }),
      ),
    );
  }
  return toNotify.length;
}

/** The member answered: their nudge is done, and its notice is read. */
export async function closeNudge(
  tx: Tx,
  input: { userId: string; actionKey: string; refType: string; now: Date },
): Promise<void> {
  await tx
    .update(schema.requiredActions)
    .set({ status: "completed", completedAt: input.now })
    .where(
      and(
        eq(schema.requiredActions.userId, input.userId),
        eq(schema.requiredActions.actionKey, input.actionKey),
        eq(schema.requiredActions.status, "pending"),
      ),
    );
  await tx
    .update(schema.notificationDeliveries)
    .set({ readAt: input.now })
    .where(
      and(
        eq(schema.notificationDeliveries.userId, input.userId),
        eq(schema.notificationDeliveries.refType, input.refType),
        isNull(schema.notificationDeliveries.readAt),
      ),
    );
}
