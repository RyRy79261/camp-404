import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ViewerRank } from "@camp404/types";
import { PROGRAM_ROUTES, matchProgram } from "../program-routes";
import { PROGRAM_REGISTRY } from "../programs";

// Each program carries the lowest rank its page clears. Hiding an icon is
// never the security boundary (the page's gate is), but an icon whose bar is
// LOWER than its page's leads a member to a lock, and one whose bar is HIGHER
// hides a program they may use. So this reads every console page's source and
// checks its gate against the registry.
//
// Next validates a page's exports, so a page cannot export its bar as a
// constant; the gate call is read with a regex instead:
//   captainPageGate("<rung>")  → that rung
//   requireMemberPage(          → camp_member
// A page that calls neither sits on EXPLAINED below with its reason; a new
// page on neither fails.

const CONSOLE = path.resolve(__dirname, "../../app/(console)");

/** Pages whose gate the regex cannot read, each with why and its real bar. */
const EXPLAINED: Record<
  string,
  {
    rank: ViewerRank | "none";
    why: string;
    /** Where the real gate is read, when not in the page. */
    via?: { file: string; has: string };
    /** What the regex reads in the page, when it reads something misleading. */
    reads?: ViewerRank;
  }
> = {
  "/": {
    rank: "none",
    why: "The desktop itself: the member ladder, no program.",
  },
  "/tools": { rank: "none", why: "Redirects to the desktop." },
  "/captains/tools": { rank: "none", why: "Redirects to the desktop." },
  "/power": {
    rank: "camp_member",
    why: "Redirects to /power/loads, which gates at camp_member.",
    via: {
      file: "power/loads/page.tsx",
      has: 'captainPageGate("camp_member")',
    },
  },
  "/notifications": {
    rank: "camp_member",
    why: "Gates on camp access only, so a pending applicant opens it too (the registry marks it `applicants`).",
    via: { file: "notifications/page.tsx", has: "hasCampAccess" },
  },
  "/announcements/[id]": {
    rank: "camp_member",
    why: "Gates on camp access, then recipients only.",
    via: { file: "announcements/[id]/page.tsx", has: "hasCampAccess" },
  },
  "/questionnaires/[activationId]": {
    rank: "camp_member",
    why: "Gates on camp access, then the member's own required action.",
    via: {
      file: "questionnaires/[activationId]/page.tsx",
      has: "hasCampAccess",
    },
  },
  "/questionnaires/[activationId]/complete": {
    rank: "camp_member",
    why: "The runner's last page, same gate.",
    via: {
      file: "questionnaires/[activationId]/complete/page.tsx",
      has: "hasCampAccess",
    },
  },
  "/captains/camp-management": {
    rank: "camp_member",
    why: "Roster: the captain gate there picks the projection (captain, lead or member); it never locks.",
    reads: "captain",
    via: {
      file: "captains/camp-management/page.tsx",
      has: "rosterForViewer",
    },
  },
  "/captains/questionnaires/[key]/metrics": {
    rank: "captain",
    why: "Gated in results-data.ts (loadResults).",
    via: {
      file: "captains/questionnaires/[key]/metrics/results-data.ts",
      has: 'captainPageGate("captain")',
    },
  },
  "/captains/questionnaires/[key]/responses": {
    rank: "captain",
    why: "Gated in results-data.ts (loadResults).",
    via: {
      file: "captains/questionnaires/[key]/metrics/results-data.ts",
      has: 'captainPageGate("captain")',
    },
  },
  "/captains/questionnaires/[key]/responses/[userId]": {
    rank: "captain",
    why: "Gated in results-data.ts (loadResults).",
    via: {
      file: "captains/questionnaires/[key]/metrics/results-data.ts",
      has: 'captainPageGate("captain")',
    },
  },
};

function consolePages(): string[] {
  return (readdirSync(CONSOLE, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file === "page.tsx" || file.endsWith("/page.tsx"));
}

const routeOf = (file: string) =>
  `/${file.slice(0, -"page.tsx".length)}`.replace(/\/$/, "") || "/";

/** The bar the page's source names, or null when it names none. */
function gateIn(source: string): ViewerRank | null {
  const captain =
    /captainPageGate\(\s*"(camp_member|team_lead|captain)"\s*\)/.exec(source);
  if (captain) return captain[1] as ViewerRank;
  if (/requireMemberPage\(/.test(source)) return "camp_member";
  return null;
}

describe("every registry bar equals its page's gate", () => {
  const pages = consolePages();

  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(40);
  });

  for (const file of pages) {
    const route = routeOf(file);
    it(`${route}`, () => {
      const source = readFileSync(path.join(CONSOLE, file), "utf8");
      const read = gateIn(source);
      const explained = EXPLAINED[route];
      const match = PROGRAM_ROUTES.find((r) => r.pattern === route);
      expect(match, `${route} has no program route`).toBeDefined();
      const entry = PROGRAM_REGISTRY.find((e) => e.id === match!.programId);

      if (explained) {
        expect(
          read,
          `${route} is on the EXPLAINED list but its gate now reads as ${read}; check the entry`,
        ).toBe(explained.reads ?? null);
        if (explained.via) {
          const via = readFileSync(
            path.join(CONSOLE, explained.via.file),
            "utf8",
          );
          expect(via, explained.why).toContain(explained.via.has);
        }
        if (explained.rank === "none") {
          expect(match!.programId).toBe("desktop");
        } else {
          expect(entry?.rank, route).toBe(explained.rank);
        }
        return;
      }

      expect(
        read,
        `app/(console)${route}/page.tsx calls neither captainPageGate nor requireMemberPage: add it to EXPLAINED with a reason`,
      ).not.toBeNull();
      expect(
        entry,
        `${route} → ${match!.programId} has no registry entry`,
      ).toBeDefined();
      expect(entry!.rank, `${route} → ${entry!.id}`).toBe(read);
    });
  }
});

describe("the registry against the routes", () => {
  it("gives every program an entry, and every entry a route", () => {
    const routed = new Set(
      PROGRAM_ROUTES.map((r) => r.programId).filter((id) => id !== "desktop"),
    );
    const registered = new Set(PROGRAM_REGISTRY.map((e) => e.id));
    expect([...routed].sort()).toEqual([...registered].sort());
  });

  it("points every icon at a page of its own program", () => {
    for (const entry of PROGRAM_REGISTRY) {
      if (!entry.href) continue;
      expect(matchProgram(entry.href)?.programId, entry.id).toBe(entry.id);
    }
  });

  it("gives an icon to every program with a place, and a place to every icon", () => {
    for (const entry of PROGRAM_REGISTRY) {
      if (entry.perTeam) continue;
      expect(Boolean(entry.href), entry.id).toBe(entry.place !== null);
    }
  });
});
