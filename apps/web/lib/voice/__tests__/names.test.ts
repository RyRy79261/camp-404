import { describe, expect, it } from "vitest";
import { lookAlikes, namesAlike, soundsAlike, wordsSingleOut } from "../names";

// Spoken names (#356): two people who could fit always get the question.

const ROSTER = [
  { id: "1", name: "Gecko Naidoo" },
  { id: "2", name: "Gekko Naidoo" },
  { id: "3", name: "Thandi Mokoena" },
  { id: "4", name: "Thandi Botha" },
  { id: "5", name: "Kat Jacobs" },
  { id: "6", name: "Priya Pillay" },
];
const of = (id: string) => ROSTER.find((p) => p.id === id)!;

describe("look-alike names", () => {
  it("hears Gecko and Gekko as one sound", () => {
    expect(soundsAlike("gecko", "gekko")).toBe(true);
    expect(namesAlike("Gecko Naidoo", "Gekko Naidoo")).toBe(true);
    expect(soundsAlike("kat", "priya")).toBe(false);
  });

  it("always finds the other of a pair whose whole names sound alike, whatever was said", () => {
    expect(lookAlikes(of("1"), ROSTER, "Put Gecko Naidoo on kitchen").map((p) => p.id)).toEqual(["2"]);
    expect(lookAlikes(of("2"), ROSTER, "Put Gekko Naidoo on kitchen").map((p) => p.id)).toEqual(["1"]);
  });

  it("finds the other Thandi when only the first name was said, and not when the surname was", () => {
    expect(lookAlikes(of("3"), ROSTER, "Put Thandi on vibes").map((p) => p.id)).toEqual(["4"]);
    expect(lookAlikes(of("3"), ROSTER, "Put Thandi Mokoena on vibes")).toEqual([]);
    expect(lookAlikes(of("4"), ROSTER, "Make Thandi Botha a lead")).toEqual([]);
  });

  it("finds nobody for a name that only one member has", () => {
    expect(lookAlikes(of("5"), ROSTER, "Put Kat on kitchen")).toEqual([]);
    expect(lookAlikes(of("6"), ROSTER, "Take Priya off kitchen")).toEqual([]);
  });
});

describe("one claim among several", () => {
  const gas = { description: "Gas bottles, 2 × 9 kg Kitchen", amountCents: 124_000 };
  const ties = { description: "Cable ties and rope Structures", amountCents: 35_000 };
  it("is singled out by what it was for, or by its amount in rands", () => {
    expect(wordsSingleOut("approve the gas bottles claim", gas, [ties])).toBe(true);
    expect(wordsSingleOut("approve the claim for R1,240", gas, [ties])).toBe(true);
    expect(wordsSingleOut("approve Gecko's claim", gas, [ties])).toBe(false);
    // A word both claims share says nothing.
    expect(
      wordsSingleOut("approve the kitchen claim", { description: "Spices Kitchen", amountCents: 1 }, [
        { description: "Firewood Kitchen", amountCents: 2 },
      ]),
    ).toBe(false);
  });
});
