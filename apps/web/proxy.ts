import { NextResponse, type NextRequest } from "next/server";
import { CAMP_PATH_HEADER, campPathOf } from "./lib/camp-path";

// Next 16's proxy (the file once called middleware.ts). It does one thing:
// tell the server gates which page was asked for, so a signed-out visitor sent
// to sign in comes back to it (`?next=`, lib/sign-in-redirect.ts). A push,
// email or reminder link opens /notifications, /announcements/<id> or
// /questionnaires/<id>; without this, signing in lost the target.
//
// Security: the header is always rebuilt here from the URL, after deleting any
// copy the client sent, so on every path the matcher covers a spoofed
// `x-camp-path` never reaches `headers()`. The matcher leaves out only exact,
// named files (below), never "anything with a dot", because a console page's
// dynamic segment may hold one (/announcements/a.b, /tools/forms/<key.v2>).
// The gate checks the value again anyway (`safeInternalPath` and
// `matchProgram`), and that re-check is the real boundary: even a path the
// proxy skipped cannot turn the header into a way off the app. It never
// redirects, rewrites or answers, and it never runs on /api (so it is no
// second switch beside `authMayServe` for /api/auth/*), /auth, Next's own
// files or the app's static files.
//
// Cost: it runs on the Node runtime for every matched request, page loads and
// the client router's RSC requests alike (on Vercel Hobby, an invocation
// each). If that proves material, the fallback is for each gate caller to
// pass its own path (docs/plans/2026-09-25-404-os-console-migration.md, PR B).

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(CAMP_PATH_HEADER);
  headers.set(CAMP_PATH_HEADER, campPathOf(request.nextUrl));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    // Everything except: /api and /auth (and below), Next's own /_next files,
    // /.well-known, the generated icons and images, and the app's own files
    // at the root, each by its exact name (favicon.ico, icon.svg,
    // manifest.webmanifest, the service worker). A negative list, so a new
    // console folder is covered without an edit (lib/__tests__/proxy.test.ts
    // checks every (console) folder is, a dotted page segment included). A
    // new root file left off this list only costs a proxy run; it is served
    // the same.
    "/((?!api/|api$|auth/|auth$|_next/|\\.well-known/|apple-icon|opengraph-image|twitter-image|favicon\\.ico$|icon\\.svg$|manifest\\.webmanifest$|firebase-messaging-sw\\.js$).*)",
  ],
};
