import { describe, expect, it } from "vitest";
import { planSmallCamp, SEED_AUTH_PREFIX, TEAM_KEYS } from "../seed-plan";

// The small-camp scenario's shape. The wipe relies on every seeded person
// carrying the prefix, and the roster needs every team to have a lead.

describe("planSmallCamp", () => {
  const members = planSmallCamp();

  it("has 35 people across every standing, each marked as seeded", () => {
    expect(members).toHaveLength(35);
    const count = (standing: string) =>
      members.filter((m) => m.standing === standing).length;
    expect([
      count("approved"),
      count("pending"),
      count("rejected"),
      count("onboarding"),
    ]).toEqual([24, 4, 2, 5]);
    for (const m of members)
      expect(m.authUserId.startsWith(SEED_AUTH_PREFIX)).toBe(true);
    expect(new Set(members.map((m) => m.authUserId)).size).toBe(35);
  });

  it("puts only approved members on teams, three a team, one lead each", () => {
    for (const team of TEAM_KEYS) {
      const onTeam = members.filter((m) => m.team === team);
      expect(onTeam).toHaveLength(3);
      expect(onTeam.filter((m) => m.leadsTeam)).toHaveLength(1);
      for (const m of onTeam) expect(m.standing).toBe("approved");
    }
  });

  it("has one extra captain, and answers and payments only from approved members", () => {
    expect(members.filter((m) => m.captain)).toHaveLength(1);
    const answered = members.filter((m) => m.answers);
    const paid = members.filter((m) => m.paid);
    expect([answered.length, paid.length]).toEqual([12, 10]);
    for (const m of [...answered, ...paid]) expect(m.standing).toBe("approved");
  });
});
