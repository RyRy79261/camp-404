// The words of a captain's "Send password reset link" (owner's mock-up, step
// 7). A plain module, not the "use server" actions file: that may export only
// async functions.
export const RESET_COPY = {
  tooMany: "Too many reset links for now. Wait an hour and try again.",
  sendFailed: "The link couldn't be sent. Try again in a moment.",
  signInOff:
    "Sign-in is switched off on this copy of the app, so no link can be sent.",
} as const;

/** "lerato•••@gmail.com": enough to recognise, not the whole address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const keep = local.length <= 2 ? 1 : Math.min(6, local.length - 2);
  return `${local.slice(0, keep)}•••${email.slice(at)}`;
}
