import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ViewerRank } from "@camp404/types";
import { PROGRAM_ROUTES } from "../program-routes";
import { PROGRAM_REGISTRY } from "../programs";

// Each program carries the lowest rank its page clears. Hiding an icon is
// never the security boundary (the page's gate is), but an icon whose bar is
// LOWER than its page's leads a member to a lock, and one whose bar is HIGHER
// hides a program they may use. So this reads every console page's source.
//
// Most pages ask the registry for their gate: `programPage("<id>")`
// (lib/program-page.ts) runs the entry's rank and rule, so the two cannot
// disagree as long as the page names its OWN program. That is what is checked
// for them: every `programPage(` call in the page names the program its route
// opens, and a program whose pages use it uses it on every page.
//
// The pages left alone still name their bar, read with a regex (Next
// validates a page's exports, so a page cannot export it as a constant):
//   requireMemberPage(          → camp_member
//   captainPageGate("<rung>")   → that rung, and only on the EXPLAINED list
// A page that names none sits on EXPLAINED below with its reason; a new page
// on none fails, and a new page should call programPage.

const CONSOLE = path.resolve(__dirname, "../../app/(console)");

/** Every Power section renders inside PowerFrame, which reads powerViewer(). */
const POWER_GATE = {
  file: "../../lib/power-overview.ts",
  has: 'captainPageGate("camp_member")',
};

const RESULTS_GATE = {
  file: "captains/questionnaires/[key]/metrics/results-data.ts",
  has: 'captainPageGate("captain")',
};

interface Explained {
  rank: ViewerRank | "none";
  why: string;
  /** Where the real gate is read, when not in the page. */
  via?: { file: string; has: string };
  /** What the regex reads in the page, when it reads something misleading. */
  reads?: ViewerRank;
}

/** The routes of one program, for a list that names each of them. */
const routesOf = (id: string) =>
  PROGRAM_ROUTES.filter((r) => r.programId === id).map((r) => r.pattern);

/** Pages that do not call programPage, and whose gate the regex cannot read. */
const EXPLAINED: Record<string, Explained> = {
  "/": {
    rank: "none",
    why: "The desktop itself: the member ladder, no program.",
  },
  "/tools": { rank: "none", why: "Redirects to the desktop." },
  "/captains/tools": { rank: "none", why: "Redirects to the desktop." },
  ...Object.fromEntries(
    routesOf("power").map((route) => [
      route,
      {
        rank: "camp_member",
        why: "A Power section; PowerFrame gates through powerViewer() at camp_member.",
        via: POWER_GATE,
      } satisfies Explained,
    ]),
  ),
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
  ...Object.fromEntries(
    [...routesOf("results"), ...routesOf("respondent-answers")].map((route) => [
      route,
      {
        rank: "captain",
        why: "Gated in results-data.ts (loadResults).",
        via: RESULTS_GATE,
      } satisfies Explained,
    ]),
  ),
};

function consolePages(): string[] {
  return (readdirSync(CONSOLE, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file === "page.tsx" || file.endsWith("/page.tsx"));
}

const routeOf = (file: string) =>
  `/${file.slice(0, -"page.tsx".length)}`.replace(/\/$/, "") || "/";

/** The program ids a page's source asks `programPage` for, in order. */
function programPageIds(source: string): string[] {
  return [...source.matchAll(/programPage\(\s*(?:"([^"]*)")?/g)].map(
    (m) => m[1] ?? "<not a string literal>",
  );
}

/** The bar a left-alone page's source names, or null when it names none. */
function gateIn(source: string): ViewerRank | null {
  const captain =
    /captainPageGate\(\s*"(camp_member|team_lead|captain)"\s*\)/.exec(source);
  if (captain) return captain[1] as ViewerRank;
  if (/requireMemberPage\(/.test(source)) return "camp_member";
  return null;
}

const pages = consolePages().map((file) => {
  const route = routeOf(file);
  const source = readFileSync(path.join(CONSOLE, file), "utf8");
  const match = PROGRAM_ROUTES.find((r) => r.pattern === route);
  return { file, route, source, programId: match?.programId };
});

describe("every page asks its own program's gate", () => {
  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(40);
    expect(
      pages.filter((p) => programPageIds(p.source).length > 0).length,
    ).toBeGreaterThan(40);
  });

  for (const page of pages.filter((p) => programPageIds(p.source).length)) {
    it(`${page.route} → programPage("${page.programId}")`, () => {
      expect(
        page.programId,
        `${page.route} has no program route`,
      ).toBeDefined();
      for (const id of programPageIds(page.source)) {
        expect(
          id,
          `app/(console)/${page.file} asks another program's gate`,
        ).toBe(page.programId);
      }
      expect(
        gateIn(page.source),
        `app/(console)/${page.file} calls programPage and names a bar of its own too`,
      ).toBeNull();
    });
  }

  it("moves a program's pages together: none is left on its own bar", () => {
    const migrated = new Set(
      pages
        .filter((p) => programPageIds(p.source).length)
        .map((p) => p.programId),
    );
    const halfway = pages
      .filter((p) => migrated.has(p.programId))
      .filter((p) => programPageIds(p.source).length === 0)
      .map((p) => p.route);
    expect(halfway).toEqual([]);
  });
});

describe("every page left alone names its registry bar", () => {
  for (const page of pages.filter((p) => !programPageIds(p.source).length)) {
    const { route, source } = page;
    it(`${route}`, () => {
      const read = gateIn(source);
      const explained = EXPLAINED[route];
      expect(page.programId, `${route} has no program route`).toBeDefined();
      const entry = PROGRAM_REGISTRY.find((e) => e.id === page.programId);

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
          expect(page.programId).toBe("desktop");
        } else {
          expect(entry?.rank, route).toBe(explained.rank);
        }
        return;
      }

      expect(
        read,
        `app/(console)${route}/page.tsx calls neither programPage nor requireMemberPage: call programPage("${page.programId}"), or add it to EXPLAINED with a reason`,
      ).not.toBeNull();
      expect(
        /captainPageGate\(/.test(source),
        `app/(console)${route}/page.tsx calls captainPageGate itself: call programPage("${page.programId}") instead`,
      ).toBe(false);
      expect(
        entry,
        `${route} → ${page.programId} has no registry entry`,
      ).toBeDefined();
      expect(
        entry!.rule,
        `${route} → ${entry!.id} has a rule its page does not ask: call programPage`,
      ).toBeUndefined();
      expect(entry!.rank, `${route} → ${entry!.id}`).toBe(read);
    });
  }

  it("lists only pages that are left alone", () => {
    const routes = new Set(pages.map((p) => p.route));
    for (const route of Object.keys(EXPLAINED)) {
      expect(
        routes.has(route),
        `${route} is on EXPLAINED but has no page`,
      ).toBe(true);
    }
  });
});

describe("the registry against the routes", () => {
  it("gives every program an entry, and every entry a route", () => {
    const routed = new Set(
      PROGRAM_ROUTES.map((r) => r.programId).filter((id) => id !== "desktop"),
    );
    const registered = new Set(PROGRAM_REGISTRY.map((e) => e.id));
    expect([...routed].sort()).toEqual([...registered].sort());
  });
});
