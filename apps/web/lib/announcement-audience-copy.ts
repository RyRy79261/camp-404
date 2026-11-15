// Refusal copy for announcement audiences, shared by the actions and their
// tests. (A "use server" module may only export async functions.)

export const NOT_YOUR_TEAM =
  "You can only send to a team you lead. Pick one of your teams.";

// Pinning follows posting: whoever may address an audience may pin to it. So
// the refusal says the same thing the send refusal says, about the pin.
export const NOT_YOUR_PIN =
  "You can only pin an announcement to a team you lead.";

// A captain's chosen people (#313) are checked against the camp when the draft
// is saved and when it is published: someone erased, or not approved, since
// they were picked cannot be sent to.
export const PERSON_GONE =
  "One of the people you picked isn't in the camp any more. Take them off and try again.";
