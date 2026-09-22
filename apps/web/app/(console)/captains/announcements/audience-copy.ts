// Refusal copy for announcement audiences, shared by the actions and their
// tests. (A "use server" module may only export async functions.)

export const NOT_YOUR_TEAM =
  "You can only send to a team you lead. Pick one of your teams.";

// Pinning follows posting: whoever may address an audience may pin to it. So
// the refusal says the same thing the send refusal says, about the pin.
export const NOT_YOUR_PIN =
  "You can only pin an announcement to a team you lead.";
