import { describe, expect, it } from "vitest";
import { cellKey, loungeDays } from "@camp404/core";
import type { LoungeProgramme } from "@camp404/db/lounge";
import { printName } from "../lounge-copy";
import {
  buildProgramme,
  dayItems,
  guideEntries,
  guideText,
} from "../lounge-view";

// How the lounge programme is drawn (#269): warnings on the grid, the
// preferences shown only when given, the event guide list and paper names.

const PROGRAMME: LoungeProgramme = {
  offers: [
    {
      id: "yoga",
      kind: "activity",
      title: "Sunrise yoga",
      description: "Bring a mat.",
      durationMinutes: 60,
      recurring: true,
      publicGuide: true,
      hostName: "Sam Moon",
    },
    {
      id: "set",
      kind: "dj_set",
      title: "Sunset set",
      description: null,
      durationMinutes: 120,
      recurring: false,
      publicGuide: false,
      hostName: "DJ Kat",
    },
  ],
  slots: [
    { id: "s1", offerId: "yoga", day: 2, startMinute: 7 * 60 },
    { id: "s2", offerId: "yoga", day: 3, startMinute: 7 * 60 },
    { id: "s3", offerId: "set", day: 2, startMinute: 6 * 60 + 30 },
    // A slot whose offer is not accepted any more is left out.
    { id: "s4", offerId: "gone", day: 1, startMinute: 7 * 60 },
  ],
};

const DAYS = loungeDays({ start: "2027-04-28", end: "2027-05-03" });

describe("buildProgramme", () => {
  it("files items into cells with their overlaps", () => {
    const view = buildProgramme(PROGRAMME, DAYS);
    expect(view.items.map((i) => i.id)).toEqual(["s3", "s1", "s2"]);
    expect(view.cells.get(cellKey(2, "morning"))!.map((i) => i.id)).toEqual([
      "s3",
      "s1",
    ]);
    expect(view.items.find((i) => i.id === "s1")!.clashesWith).toEqual([
      "Sunset set",
    ]);
    expect(view.items.find((i) => i.id === "s2")!.clashesWith).toEqual([]);
  });

  it("says nothing about the host's wishes without the preferences", () => {
    const view = buildProgramme(PROGRAMME, DAYS);
    expect(view.items.every((i) => i.outside === null)).toBe(true);
  });

  it("flags a placement outside the host's wishes for someone who runs the lounge", () => {
    const view = buildProgramme(
      PROGRAMME,
      DAYS,
      new Map([["yoga", { preferredDays: [2], preferredBands: ["morning"] }]]),
    );
    expect(view.items.find((i) => i.id === "s2")!.outside).toEqual({
      day: true,
      band: false,
    });
    expect(view.items.find((i) => i.id === "s1")!.outside).toEqual({
      day: false,
      band: false,
    });
  });

  it("lists items on a day past the grid apart", () => {
    const view = buildProgramme(PROGRAMME, DAYS.slice(0, 2));
    expect(view.offGrid.map((i) => i.id)).toEqual(["s2"]);
    expect(dayItems(view, 2).map((i) => i.id)).toEqual(["s3", "s1"]);
  });
});

describe("the event guide", () => {
  it("lists only offers for the guide, with their times", () => {
    const entries = guideEntries(PROGRAMME, DAYS);
    expect(entries.map((e) => e.title)).toEqual(["Sunrise yoga"]);
    expect(entries[0]!.times).toEqual([
      "Day 2 · Thu 29 Apr, 07:00–08:00",
      "Day 3 · Fri 30 Apr, 07:00–08:00",
    ]);
    expect(guideText(entries)).toBe(
      "Sunrise yoga (Activity, recurring)\nBring a mat.\nDay 2 · Thu 29 Apr, 07:00–08:00; Day 3 · Fri 30 Apr, 07:00–08:00",
    );
  });
});

describe("printName", () => {
  it("prints a first name and a surname initial, never an address", () => {
    expect(printName("Sam Moon")).toBe("Sam M.");
    expect(printName("Sam van der Moon")).toBe("Sam M.");
    expect(printName("Kat")).toBe("Kat");
    expect(printName("sam@example.com")).toBe("Camp member");
    expect(printName("Unnamed member")).toBe("Camp member");
  });
});
