// Where tapping a notification takes the member. One mapping, used by the
// inbox row and by the push message, so a reminder opens the same form from
// either place.
//
// A notification that points at nothing the member can open (an unknown or
// malformed reference) goes to the inbox, where it is listed.

export const NOTIFICATION_FALLBACK_LINK = "/notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The in-app path a notification with this reference opens. */
export function notificationLink(
  refType: string | null | undefined,
  refId: string | null | undefined,
): string {
  if (refType === "questionnaire_activation" && refId && UUID.test(refId)) {
    return `/questionnaires/${refId}`;
  }
  if (refType === "announcement" && refId && UUID.test(refId)) {
    return `/announcements/${refId}`;
  }
  // The board has no page per task; the task is a card on /tasks.
  if (refType === "task" && refId && UUID.test(refId)) {
    return "/tasks";
  }
  return NOTIFICATION_FALLBACK_LINK;
}
