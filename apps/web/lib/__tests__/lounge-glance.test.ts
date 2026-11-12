import { describe, expect, it } from "vitest";
import { loungeDays } from "@camp404/core";
import type { LoungeProgramme } from "@/lib/lounge";
import { loungeGlance } from "@/lib/team-glance/lounge";

// The Ministry of Vibes' panel: how full the days × times grid is, what waits
// on the Ministry, the DJ sets and activities on, and the empty times.

const DAYS = loungeDays(null).slice(0, 2); // two days × six bands = 12 times

const offer = (id: string, kind: "dj_set" | "activity" | "workshop") => ({
  id,
  kind,
  title: id,
  description: null,
  durationMinutes: 60,
  recurring: false,
  publicGuide: true,
  hostName: "Someone",
});

// Programme minutes are clock minutes; 10:00 is morning, 22:00 is night.
const PROGRAMME: LoungeProgramme = {
  offers: [
    offer("dj", "dj_set"),
    offer("yoga", "activity"),
    offer("talk", "workshop"),
  ],
  slots: [
    { id: "s1", offerId: "dj", day: 1, startMinute: 22 * 60 },
    { id: "s2", offerId: "dj", day: 2, startMinute: 22 * 60 },
    { id: "s3", offerId: "yoga", day: 1, startMinute: 7 * 60 },
  ],
};

const tile = (g: ReturnType<typeof loungeGlance>, key: string) =>
  g.tiles.find((t) => t.key === key);

describe("loungeGlance", () => {
  it("counts the filled times of the grid, the DJ sets and the activities on", () => {
    const g = loungeGlance({ days: DAYS, programme: PROGRAMME, stages: [] });
    expect(tile(g, "slots")?.value).toBe("3 of 12");
    expect(tile(g, "dj")?.value).toBe("1");
    // The workshop is accepted but not placed: not on the programme.
    expect(tile(g, "activities")?.value).toBe("1");
  });

  it("counts what waits on the Ministry: new offers and accepted ones not placed", () => {
    const g = loungeGlance({
      days: DAYS,
      programme: PROGRAMME,
      stages: ["new", "to_place", "on", "changes", "declined"],
    });
    expect(tile(g, "waiting")?.value).toBe("2");
    expect(g.attention[0]?.text).toBe(
      "2 offers are waiting for a yes or a place on the grid.",
    );
  });

  it("names empty times, at most five lines, the rest as a count", () => {
    const g = loungeGlance({ days: DAYS, programme: PROGRAMME, stages: [] });
    expect(g.attention).toHaveLength(5);
    expect(g.attention[0]?.text).toBe("Day 1 midday has nothing on.");
    expect(g.attention.at(-1)?.text).toBe("5 more times with nothing on.");
  });

  it("says one plain thing when nothing is on yet", () => {
    const g = loungeGlance({
      days: DAYS,
      programme: { offers: [], slots: [] },
      stages: [],
    });
    expect(tile(g, "slots")?.value).toBe("0 of 12");
    expect(tile(g, "slots")?.hint).toBe("Nothing on the programme yet");
    expect(g.attention).toEqual([]);
  });
});
