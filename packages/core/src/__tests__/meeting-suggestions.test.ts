import { describe, expect, it } from "vitest";
import {
  campEventKindFor,
  comparable,
  matchMember,
  meetingSuggestionsFrom,
  type MeetingSuggestionRaw,
} from "../index";

const members = [
  { id: "ryan", displayName: "Ryan James Noble" },
  { id: "caitlin", displayName: "Caitlin" },
  { id: "sam-1", displayName: "Sam" },
  { id: "sam-2", displayName: "sam" },
  { id: "rene", displayName: "René Venter" },
];

const context = {
  members,
  said: "(Ryan James Noble) fees. (Speaker 3) logistics. Caitlin tells everyone.",
  teams: ["finance", "structures"],
  meetingTeam: null,
  existing: { decisions: [], actionItems: [] },
};

function item(
  text: string,
  extra: Partial<MeetingSuggestionRaw["action_items"][number]> = {},
) {
  return {
    text,
    person: null,
    team: null,
    due: null,
    due_said: null,
    already_listed: false,
    ...extra,
  };
}

describe("matchMember", () => {
  it("takes only one member's whole name, case, spaces and accents aside", () => {
    expect(matchMember("Ryan James Noble", members)).toBe("ryan");
    expect(matchMember("  ryan   james noble ", members)).toBe("ryan");
    expect(matchMember("Rene Venter", members)).toBe("rene");
  });

  it("never guesses: part of a name, two members or a label is nobody", () => {
    expect(matchMember("Ryan", members)).toBeNull();
    expect(matchMember("Sam", members)).toBeNull();
    expect(matchMember("Speaker 3", members)).toBeNull();
    expect(matchMember("Team leads", members)).toBeNull();
    expect(matchMember(null, members)).toBeNull();
    expect(matchMember("  ", members)).toBeNull();
  });
});

describe("matchMember against the notes", () => {
  it("takes a whole name only when the notes write it", () => {
    expect(matchMember("Ryan James Noble", members, "(Ryan) fees")).toBeNull();
    expect(
      matchMember("Ryan James Noble", members, "(Ryan James Noble) fees"),
    ).toBe("ryan");
    // "Caitlin" inside another word is not the name.
    expect(matchMember("Caitlin", members, "Caitlinesque plans")).toBeNull();
  });
});

describe("meetingSuggestionsFrom", () => {
  it("asks who it is when the notes give only a first name, whatever Claude answered", () => {
    const mikes = [
      { id: "mike-s", displayName: "Mike Smith" },
      { id: "mike-j", displayName: "Mike Jones" },
    ];
    const out = meetingSuggestionsFrom(
      {
        decisions: [],
        action_items: [
          item("Get the tent quote", { person: "Mike Smith" }),
          item("Book the truck", { person: "Mike" }),
        ],
      },
      {
        ...context,
        // Claude was told about one Mike; the camp has two.
        members: [mikes[0]!],
        everyone: mikes,
        said: "(Mike) get the tent quote. (Mike) book the truck.",
      },
    );
    expect(out.actionItems.map((i) => [i.assigneeId, i.unmatchedName])).toEqual(
      [
        [null, "Mike Smith"],
        [null, "Mike"],
      ],
    );
  });

  it("never matches a name two people in camp share, though Claude saw one", () => {
    const out = meetingSuggestionsFrom(
      {
        decisions: [],
        action_items: [item("Get the tent quote", { person: "Mike" })],
      },
      {
        ...context,
        members: [{ id: "mike-1", displayName: "Mike" }],
        everyone: [
          { id: "mike-1", displayName: "Mike" },
          { id: "mike-2", displayName: "Mike" },
        ],
        said: "(Mike) get the tent quote",
      },
    );
    expect(out.actionItems[0]).toMatchObject({
      assigneeId: null,
      unmatchedName: "Mike",
    });
  });

  it("keeps matched people, known teams and real dates, and asks who the rest are", () => {
    const out = meetingSuggestionsFrom(
      {
        decisions: [{ text: "Camp targets 35 people", already_listed: false }],
        action_items: [
          item("Start collecting camp fees", {
            person: "Ryan James Noble",
            team: "finance",
            due: "2026-10-19",
            due_said: "next week",
          }),
          item("Take on the logistics lead role", {
            person: "Speaker 3",
            team: "transport",
            due: "next week",
            due_said: "next week",
          }),
          item("Tell everyone", { person: "Caitlin", team: "camp" }),
          item("Check the date", { due: "2026-02-30" }),
        ],
      },
      { ...context, meetingTeam: "structures" },
    );
    expect(out.decisions).toEqual([{ text: "Camp targets 35 people" }]);
    expect(out.actionItems).toEqual([
      {
        text: "Start collecting camp fees",
        assigneeId: "ryan",
        unmatchedName: null,
        team: "finance",
        due: "2026-10-19",
        dueSaid: "next week",
      },
      {
        text: "Take on the logistics lead role",
        assigneeId: null,
        unmatchedName: "Speaker 3",
        // Not an active team: filed under the meeting's.
        team: "structures",
        due: null,
        dueSaid: null,
      },
      {
        text: "Tell everyone",
        assigneeId: "caitlin",
        unmatchedName: null,
        team: null,
        due: null,
        dueSaid: null,
      },
      {
        text: "Check the date",
        assigneeId: null,
        unmatchedName: null,
        team: "structures",
        due: null,
        dueSaid: null,
      },
    ]);
  });

  it("does not propose again what the note holds, or twice, and counts it", () => {
    const out = meetingSuggestionsFrom(
      {
        decisions: [
          { text: "Kitchen and lounge stay separate", already_listed: true },
          { text: "No cold recruiting.", already_listed: false },
          { text: "no cold recruiting", already_listed: false },
        ],
        action_items: [
          item("Import all existing Camp 404 documentation"),
          item("Build a submit-your-pet module", { already_listed: true }),
          item("Book the truck"),
        ],
      },
      {
        ...context,
        existing: {
          decisions: [],
          actionItems: ["import all existing camp 404 documentation"],
        },
      },
    );
    expect(out.decisions.map((d) => d.text)).toEqual(["No cold recruiting."]);
    expect(out.actionItems.map((i) => i.text)).toEqual(["Book the truck"]);
    expect(out.alreadyThere).toEqual({ decisions: 2, actionItems: 2 });
  });

  it("cuts a line to what the editor takes, and an inactive meeting team files under the whole camp", () => {
    const long = `Get ${"the very long quote ".repeat(10)}done`;
    const out = meetingSuggestionsFrom(
      { decisions: [], action_items: [item(long)] },
      { ...context, meetingTeam: "water" },
    );
    expect(out.actionItems[0]!.text.length).toBeLessThanOrEqual(120);
    expect(out.actionItems[0]!.team).toBeNull();
  });
});

describe("comparable", () => {
  it("drops case, accents and punctuation", () => {
    expect(comparable("  Café, Lounge!  ")).toBe("cafe lounge");
  });
});

describe("campEventKindFor", () => {
  it("makes an event with an agenda a meeting, and leaves one without as asked", () => {
    expect(campEventKindFor("event", "1. Shade")).toBe("meeting");
    expect(campEventKindFor("event", "  ")).toBe("event");
    expect(campEventKindFor("meeting", "")).toBe("meeting");
  });
});
