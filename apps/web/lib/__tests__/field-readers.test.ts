import { describe, expect, it } from "vitest";
import { canReadMemberField, canReadProfileAnswer } from "@camp404/core";
import type { PublicRosterRow } from "@/lib/camp-roster";
import { presentPublicMember } from "@/lib/public-member";

// The member-facing views were built before the field-access list
// (MEMBER_FIELD_READERS in @camp404/core). These pin them under it: everything
// a plain member is shown about someone else must be readable at camp_member.

const OTHER_MEMBER = { rank: "camp_member", isSelf: false } as const;

// Where each public roster column comes from. `satisfies` makes a new
// PublicRosterRow key fail typecheck until it names its source here.
const PUBLIC_ROSTER_SOURCES = {
  id: ["users.id"],
  displayName: ["users.displayName"],
  handle: ["users.telegramHandle"],
  rankLabel: ["users.rank", "teamMemberships.isLead"],
  rank: ["users.rank"],
  isLead: ["teamMemberships.isLead"],
  teams: ["teamMemberships.team"],
  country: ["answer:country"],
  inSouthAfrica: ["answer:country"],
  // Owner's ruling, 2026-09-22: everyone may see who has applied.
  standing: ["users.approvalStatus"],
} satisfies Record<keyof PublicRosterRow, readonly string[]>;

function readable(source: string): boolean {
  return source.startsWith("answer:")
    ? canReadProfileAnswer(OTHER_MEMBER, source.slice("answer:".length))
    : canReadMemberField(OTHER_MEMBER, source);
}

describe("the member roster shows nothing a member may not read", () => {
  it("draws every public row column from member-readable fields", () => {
    const unreadable = Object.entries(PUBLIC_ROSTER_SOURCES).flatMap(
      ([column, sources]) =>
        sources.filter((s) => !readable(s)).map((s) => `${column} <- ${s}`),
    );
    expect(unreadable).toEqual([]);
  });
});

describe("the public profile shows nothing a member may not read", () => {
  it("returns only answers a member may read", () => {
    const every = {
      "bio.statement": "Long-time burner.",
      "ideas.this_year": "A tea dome.",
      phone: "+27 82 555 0000",
      "id.number": "8001015009087",
    };
    const shown = presentPublicMember({ responses: every });
    const leaked = Object.entries(every)
      .filter(([, value]) => Object.values(shown).includes(value))
      .map(([id]) => id)
      .filter((id) => !canReadProfileAnswer(OTHER_MEMBER, id));
    expect(leaked).toEqual([]);
    expect(shown).toEqual({
      bio: "Long-time burner.",
      contribution: "A tea dome.",
    });
  });
});
