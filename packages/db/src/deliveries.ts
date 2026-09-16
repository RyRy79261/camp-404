import {
  shouldEmailNotification,
  type NotificationPayload,
} from "@camp404/core";
import * as schema from "./schema";

// The one way a notification_deliveries row is shaped from a payload. Every
// writer (announcements, scheduled broadcasts, questionnaire notices, the year
// rollover, approval) goes through it, so what a member reads always comes from
// a builder in @camp404/core and the kind column is never left to its default.

type Channel = (typeof schema.notificationChannelEnum.enumValues)[number];
type Presentation =
  (typeof schema.broadcastPresentationEnum.enumValues)[number];

export function deliveryValues(
  payload: NotificationPayload,
  input: {
    userId: string;
    broadcastId: string | null;
    channel: Channel;
    presentation: Presentation;
    createdAt?: Date;
  },
): typeof schema.notificationDeliveries.$inferInsert {
  return {
    broadcastId: input.broadcastId,
    userId: input.userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    channel: input.channel,
    presentation: input.presentation,
    refType: payload.refType,
    refId: payload.refId,
    emailStatus: shouldEmailNotification(payload.kind, input.presentation)
      ? "queued"
      : "skipped",
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
}
