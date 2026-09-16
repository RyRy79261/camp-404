import {
  CalendarClock,
  ClipboardList,
  Megaphone,
  Shield,
  Users,
} from "lucide-react";
import { hasClearance } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { NavCard } from "@camp404/ui/components/nav-card";
import { captainPageGate } from "@/lib/captain-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp tools — Camp 404" };

// Captains' tool hub — the "Camp Tools" tile on the captain control panel.
// Like the members' /tools page, it's an index of console tooling; new tools
// slot in here as cards. Each card carries its own clearance bar: a team lead
// sees the Questionnaires card (owner's call, 2026-09-16) and a CaptainLock for
// the rest. Preview-but-locked (D3): a card the viewer can't open is withheld
// server-side, never sent.

interface ToolEntry {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** The lowest rank that may open this tool. */
  rank: ViewerRank;
}

const TOOLS: ToolEntry[] = [
  {
    href: "/captains/announcements",
    title: "Announcements & notifications",
    description:
      "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry.",
    icon: <Megaphone className="text-primary" />,
    rank: "captain",
  },
  {
    href: "/captains/camp-management",
    title: "Roster & approvals",
    description:
      "Review the member roster, approve or reject pending applications, and manage ranks.",
    icon: <Shield className="text-primary" />,
    rank: "captain",
  },
  {
    href: "/captains/questionnaires",
    title: "Questionnaires",
    description:
      "Build questionnaires block by block, preview them as a member sees them, then publish and send them to camp.",
    icon: <ClipboardList className="text-primary" />,
    rank: "team_lead",
  },
  {
    href: "/captains/camp-settings",
    title: "Camp settings",
    description:
      "Manage your camp's teams — rename them, reorder them, or archive ones you're not using. Changes flow through to the roster's team filter.",
    icon: <Users className="text-primary" />,
    rank: "captain",
  },
  {
    href: "/captains/camp-settings/cycle",
    // Covers BOTH screens behind this route: a camp that has never said what
    // year it is gets asked, and one that has gets the rollover. "Start a new
    // year" would misdescribe the first of those.
    title: "The camp's year",
    description:
      "Say what year the camp is in, and when it moves on to the next burn, say so here. See exactly which questionnaires go out again before anything changes — and everything that stays untouched.",
    icon: <CalendarClock className="text-primary" />,
    rank: "captain",
  },
];

export default async function CaptainToolsPage() {
  // The lowest card bar is `team_lead`, so the viewer's rank is exact here.
  const { rank } = await captainPageGate("team_lead");
  const tools = TOOLS.filter((tool) => hasClearance(rank, tool.rank));
  const locked = tools.length < TOOLS.length;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <GhostBack href="/" className="-ml-2">
        {rank === "captain" ? "Captains" : "Home"}
      </GhostBack>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">Camp tools</h1>
          <p className="text-sm text-muted-foreground">
            Captain-only tooling for organising the camp.
          </p>
        </div>

        {tools.length > 0 && (
          <div className="flex flex-col gap-3">
            {tools.map((tool) => (
              <NavCard
                key={tool.href}
                href={tool.href}
                icon={tool.icon}
                title={tool.title}
                description={tool.description}
              />
            ))}
          </div>
        )}
        {locked && (
          <CaptainLock
            message={
              tools.length === 0
                ? "This tooling is captain-only. Your rank doesn't have clearance for these tools."
                : "The other camp tools are captain-only."
            }
          />
        )}
      </div>
    </main>
  );
}
