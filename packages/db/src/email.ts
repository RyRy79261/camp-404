import { and, asc, eq } from "drizzle-orm";
import { renderNotificationEmail, type NotificationEmail } from "@camp404/core";
import { withTransaction } from "./index";
import * as schema from "./schema";

// The email drain: sends each queued delivery to its member's verified address,
// one email per recipient (never several addresses in one message, which would
// disclose members' emails to each other), and records the outcome.

export type EmailSend = (
  to: string,
  email: NotificationEmail,
) => Promise<{ ok: true } | { ok: false; error: string }>;

export interface EmailDrainResult {
  sent: number;
  failed: number;
  skipped: number;
}

/** How many queued emails one run sends. The cron runs daily. */
export const EMAIL_DRAIN_LIMIT = 100;

/**
 * Drain queued email deliveries, oldest first.
 *
 * The rows are locked (FOR UPDATE SKIP LOCKED) for the whole run, so two
 * overlapping runs cannot both email the same delivery. A member with no
 * verified address, or an erased or system account, is `skipped`; a send the
 * provider refuses is `failed` and not retried.
 */
export async function drainQueuedEmail(
  send: EmailSend,
  options: { siteUrl: string; limit?: number },
): Promise<EmailDrainResult> {
  return await withTransaction(async (tx) => {
    const queued = await tx
      .select({
        id: schema.notificationDeliveries.id,
        kind: schema.notificationDeliveries.kind,
        title: schema.notificationDeliveries.title,
        body: schema.notificationDeliveries.body,
        refType: schema.notificationDeliveries.refType,
        refId: schema.notificationDeliveries.refId,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
      })
      .from(schema.notificationDeliveries)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.notificationDeliveries.userId),
      )
      .leftJoin(schema.user, eq(schema.user.id, schema.users.authUserId))
      .where(eq(schema.notificationDeliveries.emailStatus, "queued"))
      .orderBy(asc(schema.notificationDeliveries.createdAt))
      .limit(options.limit ?? EMAIL_DRAIN_LIMIT)
      .for("update", { of: schema.notificationDeliveries, skipLocked: true });

    const result: EmailDrainResult = { sent: 0, failed: 0, skipped: 0 };
    for (const row of queued) {
      let status: "sent" | "failed" | "skipped";
      const address = row.email?.trim();
      if (!address || !row.emailVerified || row.isSystem || row.sanitised) {
        status = "skipped";
      } else {
        const email = renderNotificationEmail(
          {
            kind: row.kind,
            title: row.title,
            body: row.body,
            refType: row.refType,
            refId: row.refId,
          },
          options.siteUrl,
        );
        const outcome = await send(address, email).catch(
          (err: unknown) =>
            ({
              ok: false,
              error: err instanceof Error ? err.message : "send failed",
            }) as const,
        );
        status = outcome.ok ? "sent" : "failed";
      }
      await tx
        .update(schema.notificationDeliveries)
        .set({ emailStatus: status })
        .where(
          and(
            eq(schema.notificationDeliveries.id, row.id),
            eq(schema.notificationDeliveries.emailStatus, "queued"),
          ),
        );
      result[status] += 1;
    }
    return result;
  });
}
