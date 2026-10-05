import { and, asc, eq } from "drizzle-orm";
import { renderNotificationEmail, type NotificationEmail } from "@camp404/core";
import { withTransaction } from "./index";
import * as schema from "./schema";

// The email drain: sends each queued delivery to its member's verified address,
// one email per recipient (never several addresses in one message, which would
// disclose members' emails to each other), and records the outcome.

/**
 * What a send answered. `retryable` is a refusal that says "not now" (a rate
 * limit, the provider down, no answer in time), never "never": the row stays
 * queued for the next run instead of being marked failed for good.
 */
export type EmailSendResult =
  | { ok: true }
  | { ok: false; error: string; retryable?: boolean };

export type EmailSend = (
  to: string,
  email: NotificationEmail,
  options: {
    /**
     * The same for every attempt at one delivery, so the provider sends it
     * once even when a run is cut short after sending and its transaction
     * rolls the row back to queued (Resend keeps the key for 24 hours).
     */
    idempotencyKey: string;
  },
) => Promise<EmailSendResult>;

export interface EmailDrainResult {
  sent: number;
  failed: number;
  skipped: number;
  /** Left queued after a "not now" answer; the run stopped there. */
  deferred: number;
}

/** The provider's idempotency key for one delivery's email. */
export function emailIdempotencyKey(deliveryId: string): string {
  return `notification-delivery/${deliveryId}`;
}

/** How many queued emails one run sends; a later page load sends the rest. */
export const EMAIL_DRAIN_LIMIT = 100;

/**
 * Drain queued email deliveries, oldest first.
 *
 * The rows are locked (FOR UPDATE SKIP LOCKED) for the whole run, so two
 * overlapping runs cannot both email the same delivery. A member with no
 * verified address, or an erased or system account, is `skipped`; a send the
 * provider refuses for good (a bad address, an unverified domain) is `failed`
 * and not retried.
 *
 * A "not now" answer (rate limited, the provider down or slow, or a send that
 * throws) leaves that row queued and ends the run: the rest would meet the
 * same wall, and each one could wait out a timeout inside this transaction.
 * The next run (a page load, at most every five minutes) tries again.
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

    const result: EmailDrainResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      deferred: 0,
    };
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
        const outcome: EmailSendResult = await send(address, email, {
          idempotencyKey: emailIdempotencyKey(row.id),
        }).catch((err: unknown) => ({
          ok: false,
          error: err instanceof Error ? err.message : "send failed",
          // A throw is not the provider's answer about this email.
          retryable: true,
        }));
        if (!outcome.ok && outcome.retryable) {
          result.deferred += 1;
          break;
        }
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
