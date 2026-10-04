import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { canApproveRecipe, canRunLounge } from "@camp404/core";
import { SEARCH_KINDS, type SearchViewer } from "@camp404/db/search";
import { captainActionGate } from "@/lib/captain-gate";
import { RECENT_MAX } from "@/lib/program-search";
import { resolveRecent, searchCamp } from "@/lib/search";
import { getLeadTeams } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ctrl+K's camp entries (#326, step 2). The box calls this while it is open:
// `?q=` as the member types (debounced, the previous request aborted), or
// `?recent=` once when it opens with entries in Recent. A GET route, not a
// server action: Next runs a page's actions one at a time and cannot cancel
// them, so typing would queue up.
//
// The gate is the console's own (captainActionGate at the camp_member rung):
// signed in, camp-active, approved. Each kind's rule is the page's, applied
// in the query (@camp404/db/search) with the viewer's rank and lead teams, so
// an answer holds only what this member may open. Never cached.

const NO_STORE = { "Cache-Control": "no-store" };

const SEARCH_QUERY_MAX = 80;

const Query = z.string().trim().min(1).max(SEARCH_QUERY_MAX);

const Ref = z
  .string()
  .regex(/^[a-z]+:[A-Za-z0-9_-]{1,100}$/)
  .transform((raw) => {
    const at = raw.indexOf(":");
    return { kind: raw.slice(0, at), id: raw.slice(at + 1) };
  })
  .pipe(z.object({ kind: z.enum(SEARCH_KINDS), id: z.string() }));

const Recent = z
  .string()
  .transform((raw) => raw.split(",").filter(Boolean))
  .pipe(z.array(Ref).min(1).max(RECENT_MAX));

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.has("q") ? Query.safeParse(params.get("q")) : null;
  const recent =
    !query && params.has("recent")
      ? Recent.safeParse(params.get("recent"))
      : null;
  if (!query?.success && !recent?.success) {
    return NextResponse.json(
      { error: "Ask with q (1 to 80 characters) or recent." },
      { status: 400, headers: NO_STORE },
    );
  }

  const access = await captainActionGate("camp_member");
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      {
        status: access.error === "Not signed in." ? 401 : 403,
        headers: NO_STORE,
      },
    );
  }
  const { campUser, rank } = access;
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const viewer: SearchViewer = {
    userId: campUser.id,
    rank,
    runsLounge: canRunLounge(rank, leadTeams),
    reviewsRecipes: canApproveRecipe(rank, leadTeams),
  };

  const entries = query?.success
    ? await searchCamp(viewer, query.data)
    : await resolveRecent(viewer, recent!.data!);
  return NextResponse.json({ entries }, { headers: NO_STORE });
}
