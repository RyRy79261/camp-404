import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

// Puts recipes straight into the test store's recipe book, each with its
// plate counts, so a Kitchen spec (and the owner's screenshots) can stand up
// a book like the approved mock-ups' without driving a proofreading run per
// recipe. Test store only: the database specs write the book themselves.
// The author must already exist (created on their first page load).

export const runtime = "nodejs";

type Seed = Parameters<typeof testStore.seedKitchenBook>[0]["recipes"];

interface Body {
  authUserId?: string;
  recipes?: Seed;
}

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.authUserId || !Array.isArray(body.recipes)) {
    return NextResponse.json(
      { error: "authUserId and recipes are required" },
      { status: 400 },
    );
  }
  const user = await findCampUserByAuthId(body.authUserId);
  if (!user) {
    return NextResponse.json(
      { error: `No user for authUserId ${body.authUserId}` },
      { status: 404 },
    );
  }
  try {
    const ids = testStore.seedKitchenBook({
      authorId: user.id,
      recipes: body.recipes,
    });
    return NextResponse.json({ ok: true, ids });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
