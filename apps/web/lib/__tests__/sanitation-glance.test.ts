import { describe, expect, it } from "vitest";
import type { ShiftsView } from "@/lib/shifts";
import { sanitationGlance } from "@/lib/team-glance/sanitation";

// Sanitation and MOOP's panel: the cleaning roster (this team's shifts only),
// its places filled, the shifts with places open, and when changes close.

const NOW = new Date("2027-04-20T10:00:00Z");

const type = (id: string, team: string, name: string, places: number) => ({
  id,
  team,
  teamLabel: team,
  name,
  places,
});

const CLEAN = type("clean", "sanitation_and_water", "Morning clean", 3);
const COOK = type("cook", "kitchen", "Dinner cooks", 4);

const slot = (
  id: string,
  t: ReturnType<typeof type>,
  day: string,
  taken: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  typeId: t.id,
  day,
  status: "open",
  taken,
  open: day > "2027-04-20",
  people: null,
  type: t,
  ...extra,
});

function view(
  days: { day: string; label: string; slots: ReturnType<typeof slot>[] }[],
  fairness: { userId: string }[] | null = null,
): ShiftsView {
  return { days, fairness } as unknown as ShiftsView;
}

const tile = (g: ReturnType<typeof sanitationGlance>, key: string) =>
  g.tiles.find((t) => t.key === key);

describe("sanitationGlance", () => {
  const ROSTER = view([
    {
      day: "2027-04-29",
      label: "Thu 29 Apr",
      slots: [
        slot("a", CLEAN, "2027-04-29", 3),
        slot("k", COOK, "2027-04-29", 0),
      ],
    },
    {
      day: "2027-04-30",
      label: "Fri 30 Apr",
      slots: [
        slot("b", CLEAN, "2027-04-30", 1),
        slot("c", CLEAN, "2027-04-30", 0, { status: "not_needed" }),
      ],
    },
  ]);

  it("counts only the cleaning shifts that are needed", () => {
    const g = sanitationGlance({ now: NOW, view: ROSTER });
    // Two needed cleaning slots of 3: 3 + 1 taken; the kitchen's is not counted.
    expect(tile(g, "places")?.value).toBe("4 of 6");
    expect(tile(g, "short")?.value).toBe("1");
    expect(g.attention.map((a) => a.text)).toEqual([
      "Fri 30 Apr, Morning clean: 1 of 3.",
    ]);
  });

  it("says when changes close for the first day still to come", () => {
    const g = sanitationGlance({ now: NOW, view: ROSTER });
    expect(tile(g, "close")?.value).toBe("in 9 days");
  });

  it("gives the 'not signed up' count only with who is on each slot and who is coming", () => {
    const member = sanitationGlance({ now: NOW, view: ROSTER });
    expect(tile(member, "not-signed-up")).toBeUndefined();

    const people = (ids: string[]) => ({
      people: ids.map((userId) => ({ userId, name: "x", you: false })),
    });
    const lead = sanitationGlance({
      now: NOW,
      view: view(
        [
          {
            day: "2027-04-29",
            label: "Thu 29 Apr",
            slots: [slot("a", CLEAN, "2027-04-29", 2, people(["u1", "u2"]))],
          },
        ],
        [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }],
      ),
    });
    expect(tile(lead, "not-signed-up")?.value).toBe("1");
  });

  it("says plainly when no cleaning shift is set up", () => {
    const g = sanitationGlance({ now: NOW, view: view([]) });
    expect(tile(g, "places")?.value).toBe("—");
    expect(tile(g, "close")?.hint).toBe("No cleaning days yet");
    expect(g.attention).toEqual([]);
  });
});
