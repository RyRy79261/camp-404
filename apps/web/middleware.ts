// Stack (Neon Auth) handles session cookies natively, so no middleware is
// required for auth. This file is intentionally minimal — add route gating
// here when public/private route boundaries become non-trivial.
//
// Pages that need a user should call `stackServerApp.getUser({ or: "redirect" })`
// from their server component.

export const config = {
  matcher: [],
};
