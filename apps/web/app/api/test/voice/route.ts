import { NextResponse } from "next/server";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { shiftsTestStore } from "@/lib/test-store-shifts";
import { voiceTestStore } from "@/lib/test-store-voice";
import { findCampUserByAuthId } from "@/lib/users";

// Voice's E2E fixture (#356), test mode only:
//  - `seed`: the mock-up's camp for a captain (the Burn's days, build week,
//    a Breakfast cooks and a Breakfast wash-up shift, and the shade cloth
//    task in Doing), and whether they have turned voice on;
//  - `script`: which scripted command the fake transcriber and fake Claude
//    play next (lib/voice/claude-fake.ts);
//  - `moveTask`: someone else moves the shade cloth task, so Do meets the
//    compare-and-set.

export const runtime = "nodejs";

interface Body {
  authUserId?: string;
  seed?: boolean;
  consent?: boolean;
  script?: string;
  moveTask?: "open" | "in_progress" | "done";
}

const SHADE = "Buy 30 m of shade cloth";

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.script !== undefined) voiceTestStore.setScript(body.script);
  if (!body.authUserId) return NextResponse.json({ ok: true });
  const user = await findCampUserByAuthId(body.authUserId);
  if (!user) {
    return NextResponse.json({ error: "No such user" }, { status: 404 });
  }
  if (body.consent !== undefined) {
    voiceTestStore.setConsent(user.id, body.consent ? new Date() : null);
  }
  if (body.seed) {
    const phase = (p: "build" | "burn" | "strike", startDate: string, endDate: string) =>
      testStore.setLogisticsPhase({
        actorId: user.id,
        phase: p,
        startDate,
        endDate,
        place: p === "burn" ? null : "on site",
        note: null,
        expectedVersion: 0,
        newEventId: `voice${p}`,
      });
    phase("build", "2027-04-22", "2027-04-25");
    phase("burn", "2027-04-26", "2027-05-02");
    phase("strike", "2027-05-03", "2027-05-04");
    for (const s of [
      { name: "Breakfast cooks", start: 7 * 60, minutes: 120, places: 4 },
      { name: "Breakfast wash-up", start: 9 * 60, minutes: 60, places: 2 },
    ]) {
      const saved = shiftsTestStore.saveShiftType({
        actorId: user.id,
        team: "kitchen",
        name: s.name,
        startMinute: s.start,
        durationMinutes: s.minutes,
        places: s.places,
        note: null,
        expectedVersion: 0,
      });
      if (saved.ok) shiftsTestStore.fillShiftDays({ actorId: user.id, typeId: saved.type.id });
    }
    const task = testStore.addTask({
      creatorId: user.id,
      title: SHADE,
      description: null,
      team: "structures",
      assigneeId: null,
      dueAt: null,
    });
    if (task.ok) {
      testStore.moveTask({ taskId: task.id, actorId: user.id, from: "open", to: "in_progress" });
    }
  }
  if (body.moveTask) {
    const card = testStore.listBoardTasks(new Date()).find((t) => t.title === SHADE);
    if (card) {
      testStore.moveTask({ taskId: card.id, actorId: user.id, from: card.status, to: body.moveTask });
    }
  }
  return NextResponse.json({ ok: true });
}
