import { NextResponse, type NextRequest } from "next/server";

// Neon Auth's verifier-to-cookie exchange runs inside the auth proxy, so
// the auth library will install its own export here once it's wired up.
// For now this is a pass-through with an empty matcher.

export default function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
