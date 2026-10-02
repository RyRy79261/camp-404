import { NextResponse } from "next/server";
import { LoungeOfferInput, type LoungeDecision } from "@camp404/types";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { findCampUserByAuthId } from "@/lib/users";

// Puts lounge offers straight into the test store, each through the store's
// own write twins (offer, decide, place), so a lounge spec and the owner's
// screenshots can stand up a realistic week without driving the offer form
// once per offer. Test store only. The hosts and the runner must already
// exist (created on their first page load); the runner must be a captain or a
// Ministry of Vibes lead, as the real writes require.

export const runtime = "nodejs";

interface SeedOffer {
  hostAuthUserId: string;
  offer: unknown;
  decision?: Exclude<LoungeDecision, "accepted"> | "accepted";
  reason?: string;
  places?: { day: number; startMinute: number }[];
}

interface Body {
  runnerAuthUserId?: string;
  offers?: SeedOffer[];
  musicPolicy?: string;
}

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.runnerAuthUserId || !Array.isArray(body.offers)) {
    return fail("runnerAuthUserId and offers are required");
  }
  const runner = await findCampUserByAuthId(body.runnerAuthUserId);
  if (!runner) return fail(`No user for ${body.runnerAuthUserId}`, 404);

  const ids: string[] = [];
  for (const seed of body.offers) {
    const host = await findCampUserByAuthId(seed.hostAuthUserId);
    if (!host) return fail(`No user for ${seed.hostAuthUserId}`, 404);
    const parsed = LoungeOfferInput.safeParse(seed.offer);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "");
    const added = testStore.addLoungeOffer({
      ...parsed.data,
      actorId: host.id,
    });
    if (!added.ok) return fail(added.error);
    ids.push(added.id);
    if (seed.decision) {
      const decided = testStore.decideLoungeOffer({
        actorId: runner.id,
        offerId: added.id,
        decision: seed.decision,
        expectedStatus: "offered",
        expectedVersion: 1,
        reason: seed.reason ?? null,
      });
      if (!decided.ok) return fail(decided.error);
    }
    for (const place of seed.places ?? []) {
      const placed = testStore.placeLoungeOffer({
        actorId: runner.id,
        offerId: added.id,
        ...place,
      });
      if (!placed.ok) return fail(placed.error);
    }
  }
  if (body.musicPolicy) {
    const current = testStore.getLoungeSettings();
    const saved = testStore.setLoungeMusicPolicy({
      actorId: runner.id,
      musicPolicy: body.musicPolicy,
      expectedVersion: current.version,
    });
    if (!saved.ok) return fail(saved.error);
  }
  return NextResponse.json({ ok: true, ids });
}
