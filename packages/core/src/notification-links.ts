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
  // A driver's message is about the car the rider shares: My lift.
  if (refType === "car_message") {
    return "/lift";
  }
  // The board has no page per task; the task is a card on /tasks.
  if (refType === "task" && refId && UUID.test(refId)) {
    return "/tasks";
  }
  // A captain's ask for the gear order opens the order itself: My gear.
  if (refType === "gear_order") {
    return "/gear";
  }
  // A captain's ask for logistics attendance opens Logistics, where the
  // member answers.
  if (refType === "logistics_attendance") {
    return "/logistics";
  }
  // A captain's ask to take the minimum shifts opens the roster, where the
  // member signs up.
  if (refType === "shift_minimum") {
    return "/shifts";
  }
  // A required action has no page of its own; home sends the member on to
  // whatever still blocks them (requireMemberPage).
  if (refType === "required_action" && refId && UUID.test(refId)) {
    return "/";
  }
  return NOTIFICATION_FALLBACK_LINK;
}
