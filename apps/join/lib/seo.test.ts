import { describe, expect, it } from "vitest";
import { DEFAULT_JOIN_DATA, type JoinData } from "./join-data";
import { joinJsonLd, joinSummary, jsonLdScript, plainText } from "./seo";

describe("join's summary for search engines", () => {
  it("says the README's first words, the Burn's dates and every team", () => {
    const summary = joinSummary(DEFAULT_JOIN_DATA);
    expect(summary.heading).toBe("Camp 404 is a place for the lost.");
    expect(summary.intro).toMatch(/^As a theme camp we provide/);
    expect(summary.dates).toBe(
      "AfrikaBurn 2027: 26 April – 2 May 2027, Tankwa Town.",
    );
    expect(summary.teams).toEqual(DEFAULT_JOIN_DATA.teams.map((t) => t.label));
    expect(summary.steps).toHaveLength(3);
  });

  it("drops a captain's bold and italic marks", () => {
    expect(plainText("We are **very** *lost*")).toBe("We are very lost");
  });

  it("has no dates line before a captain sets them", () => {
    expect(joinSummary({ ...DEFAULT_JOIN_DATA, burn: null }).dates).toBeNull();
  });
});

describe("join's JSON-LD", () => {
  const graph = (data: JoinData) =>
    joinJsonLd(data)["@graph"] as Record<string, unknown>[];

  it("names the camp, and its Burn as an event with the dates", () => {
    const [camp, event] = graph(DEFAULT_JOIN_DATA);
    expect(camp).toMatchObject({
      "@type": "Organization",
      name: "Camp 404",
      url: "https://join.camp-404.com",
    });
    expect(event).toMatchObject({
      "@type": "Event",
      name: "Camp 404 at AfrikaBurn 2027",
      startDate: "2027-04-26",
      endDate: "2027-05-02",
      organizer: { "@id": "https://join.camp-404.com/#camp" },
    });
  });

  it("leaves the event out without dates, or with a date that does not parse", () => {
    expect(graph({ ...DEFAULT_JOIN_DATA, burn: null })).toHaveLength(1);
    expect(
      graph({ ...DEFAULT_JOIN_DATA, burn: { start: "soon", end: "later" } }),
    ).toHaveLength(1);
  });

  it("cannot close its script tag early", () => {
    const text = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text)).toEqual({
      name: "</script><script>alert(1)</script>",
    });
  });
});
