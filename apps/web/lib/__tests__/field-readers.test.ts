import { describe, expect, it } from "vitest";
import { canReadMemberField, canReadProfileAnswer } from "@camp404/core";
import type { PublicRosterRow } from "@/lib/camp-roster";
import { presentPublicMember } from "@/lib/public-member";

// The member-facing views were built before the field-access list
// (MEMBER_FIELD_READERS in @camp404/core). These pin them under it: everything
// a plain member is shown about someone else must be readable at camp_member.

const OTHER_MEMBER = { rank: "camp_member", isSelf: false } as const;
const OTHER_AS_LEAD = { rank: "team_lead", isSelf: false } as const;

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
  // Only on a team lead's rows: `toPublicRosterRow` leaves the key off a plain
  // member's, which is why it is in LEAD_ONLY below.
  thisYear: ["campParticipations.status"],
} satisfies Record<keyof PublicRosterRow, readonly string[]>;

/** Columns a plain member's row never carries; a team lead's does. */
const LEAD_ONLY: ReadonlySet<keyof PublicRosterRow> = new Set(["thisYear"]);

function readable(source: string): boolean {
  return source.startsWith("answer:")
    ? canReadProfileAnswer(OTHER_MEMBER, source.slice("answer:".length))
    : canReadMemberField(OTHER_MEMBER, source);
}

describe("the member roster shows nothing a member may not read", () => {
  it("draws every public row column from member-readable fields", () => {
    const unreadable = Object.entries(PUBLIC_ROSTER_SOURCES)
      .filter(([column]) => !LEAD_ONLY.has(column as keyof PublicRosterRow))
      .flatMap(([column, sources]) =>
        sources.filter((s) => !readable(s)).map((s) => `${column} <- ${s}`),
      );
    expect(unreadable).toEqual([]);
  });

  it("draws the lead-only columns from fields a lead may read and a member may not", () => {
    for (const column of LEAD_ONLY) {
      for (const source of PUBLIC_ROSTER_SOURCES[column]) {
        expect(canReadMemberField(OTHER_AS_LEAD, source)).toBe(true);
        // Were a member able to read it, it would not need to be lead-only.
        expect(canReadMemberField(OTHER_MEMBER, source)).toBe(false);
      }
    }
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
