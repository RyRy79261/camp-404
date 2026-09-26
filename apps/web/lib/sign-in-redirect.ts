import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CAMP_PATH_HEADER } from "./camp-path";
import { matchProgram } from "./program-routes";
import { safeInternalPath } from "./safe-redirect";

// Where a signed-out visitor goes, and how they come back. A push, an email or
// a reminder opens a console page (/notifications, /announcements/<id>,
// /questionnaires/<id>); before this the gates sent a signed-out visitor to a
// bare /auth/sign-in, so the link lost its target. Now the gate names the page
// in `?next=`, and the sign-in form (which already honours `next`) sends them
// back to it.
//
// The page's path comes from the `x-camp-path` request header, which
// apps/web/proxy.ts sets from the URL on every page request, after deleting
// any copy a client sent. It is still a redirect target taken from a request,
// so it is checked twice before it is used: it must stay on this app
// (`safeInternalPath`) and it must be a console window (`matchProgram`).
// Otherwise `next` is left off, so it never names a route handler (a CSV
// export, /auth/sign-out) or an /auth page.

const SIGN_IN = "/auth/sign-in";

/**
 * The sign-in URL for a visitor who asked for `requested` (a path and query,
 * or null). Pure, so the refusals are unit-tested.
 */
export function signInPath(requested: string | null | undefined): string {
  if (!requested) return SIGN_IN;
  // The WHATWG parse drops tabs and newlines and treats "\" as "/", so a
  // value that leaves the app comes back as "/".
  const safe = safeInternalPath(requested);
  if (safe === "/") return SIGN_IN;
  const [path] = safe.split(/[?#]/, 1);
  const match = matchProgram(path ?? "");
  if (!match || match.programId === "desktop") return SIGN_IN;
  // The hash never reaches the server anyway; keep the path and query.
  const withoutHash = safe.split("#", 1)[0]!;
  return `${SIGN_IN}?next=${encodeURIComponent(withoutHash)}`;
}

/**
 * Send a signed-out visitor to sign in, naming the page they asked for when it
 * is a console window. Every gate that sends someone to sign in calls this.
 */
export async function signInRedirect(): Promise<never> {
  const requested = (await headers()).get(CAMP_PATH_HEADER);
  redirect(signInPath(requested));
}
