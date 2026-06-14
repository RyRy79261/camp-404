import { redirect } from "next/navigation";
import { Megaphone, Users } from "lucide-react";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { NavCard } from "@camp404/ui/components/nav-card";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp tools — Camp 404" };

// Captains' tool hub — the "Camp Tools" tile on the captain control panel.
// Like the members' /tools page, it's an index of captain-only tooling; new
// captain tools slot in here as cards. Preview-but-locked (D3): non-captains
// see the chrome + a CaptainLock instead of a redirect — the tool list is
// withheld server-side, never sent.

interface ToolEntry {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const TOOLS: ToolEntry[] = [
  {
    href: "/captains/announcements",
    title: "Announcements & notifications",
    description:
      "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry.",
    icon: <Megaphone className="text-primary" />,
  },
  {
    href: "/captains/camp-settings",
    title: "Camp settings",
    description:
      "Manage your camp's teams — rename them, reorder them, or archive ones you're not using. Changes flow through to the roster's team filter.",
    icon: <Users className="text-primary" />,
  },
];

export default async function CaptainToolsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }
  // Captain-clearance gate (D3): render the shell for everyone, withhold the
  // tool list from non-captains rather than redirecting.
  const { cleared } = requireClearance(
    deriveViewerRank(campUser.rank, false),
    "captain",
  );

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <GhostBack href="/" className="-ml-2">
        Captains
      </GhostBack>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold">Camp tools</h1>
          <p className="text-sm text-muted-foreground">
            Captain-only tooling for organising the camp.
          </p>
        </div>

        {cleared ? (
          <div className="flex flex-col gap-3">
            {TOOLS.map((tool) => (
              <NavCard
                key={tool.href}
                href={tool.href}
                icon={tool.icon}
                title={tool.title}
                description={tool.description}
              />
            ))}
          </div>
        ) : (
          <CaptainLock message="This tooling is captain-only. Your rank doesn't have clearance for these tools." />
        )}
      </div>
    </main>
  );
}
