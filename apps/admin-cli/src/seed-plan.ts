// The "small-camp" seed scenario as data: who exists, where each person stands,
// and who is on which team. Pure, so the shape is tested without a database;
// seed.ts turns it into rows through the app's own writers.

export const SEED_AUTH_PREFIX = "seed-";

export const SEED_YEAR = 2026;

export const SEED_INVITE_CODE = "seed-crew-2026";

// The eight founding teams. The demo camp places 24 approved members three to a
// team, so it leaves out teams added later (Finance, Transport and Logistics,
// Communications & HR, Mutant Vehicle, Sound, Water): an empty team is a fair
// thing for a demo to show.
export const TEAM_KEYS = [
  "kitchen",
  "structures",
  "power_and_lighting",
  "sanitation_and_water",
  "health_and_safety",
  "art_and_activities",
  "ministry_of_memes",
  "ministry_of_vibes",
] as const;

export type SeedTeam = (typeof TEAM_KEYS)[number];

/**
 * Where a seeded member stands on the member ladder. `onboarding` is invited
 * with the profile not finished.
 */
export type SeedStanding = "approved" | "pending" | "rejected" | "onboarding";

export interface SeedMember {
  authUserId: string;
  displayName: string;
  standing: SeedStanding;
  /** A second captain beside the founder. */
  captain: boolean;
  team: SeedTeam | null;
  leadsTeam: boolean;
  /** Answers the seeded questionnaire. */
  answers: boolean;
  /** Has a received dues payment this year. */
  paid: boolean;
}

const NAMES = [
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Margaret Hamilton",
  "Linus Pauling",
  "Rosalind Franklin",
  "Nikola Tesla",
  "Hedy Lamarr",
  "Marie Curie",
  "Richard Feynman",
  "Barbara McClintock",
  "Carl Sagan",
  "Chien-Shiung Wu",
  "Tim Berners-Lee",
  "Dorothy Vaughan",
  "Claude Shannon",
  "Mary Jackson",
  "John Nash",
  "Emmy Noether",
  "Srinivasa Ramanujan",
  "Lise Meitner",
  "Niels Bohr",
  "Jane Goodall",
  "Charles Babbage",
  "Ada Yonath",
  "Enrico Fermi",
  "Vera Rubin",
  "James Clerk Maxwell",
  "Florence Nightingale",
  "Gregor Mendel",
  "Rachel Carson",
  "Max Planck",
  "Mae Jemison",
  "Werner Heisenberg",
];

/**
 * 35 members beside the founder: 24 approved (one a second captain, eight
 * leading a team), 4 waiting for approval, 2 rejected, and 5 who have not
 * finished their profile. Approved members fill the eight teams three at a
 * time; 12 of them answer the questionnaire and 10 have paid.
 */
export function planSmallCamp(): SeedMember[] {
  return NAMES.map((displayName, i) => {
    const standing: SeedStanding =
      i < 24
        ? "approved"
        : i < 28
          ? "pending"
          : i < 30
            ? "rejected"
            : "onboarding";
    const approved = standing === "approved";
    const team = approved ? TEAM_KEYS[i % TEAM_KEYS.length]! : null;
    return {
      authUserId: `${SEED_AUTH_PREFIX}member-${String(i + 1).padStart(2, "0")}`,
      displayName,
      standing,
      captain: i === 0,
      team,
      // The first approved member placed on each team leads it.
      leadsTeam: approved && i < TEAM_KEYS.length,
      answers: approved && i < 12,
      paid: approved && i >= 4 && i < 14,
    };
  });
}
