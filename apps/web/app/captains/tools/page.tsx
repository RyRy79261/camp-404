import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Button } from "@camp404/ui/components/button";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { CaptainLock } from "@/components/captain-lock";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp tools — Camp 404" };

// Captains' tool hub — the "Camp Tools" quadrant on the captain control
// layer. Like the members' /tools page, it's an index of captain-only
// tooling; new captain tools slot in here as cards. Preview-but-locked (D3):
// non-captains see the chrome + a CaptainLock instead of a redirect — the tool
// list is withheld server-side, never sent.

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
    icon: <Megaphone className="h-5 w-5" />,
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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <a href="/">
          <ChevronLeft className="h-4 w-4" /> Captains
        </a>
      </Button>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Camp tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Captain-only tooling for running the camp.
        </p>
      </header>

      {cleared ? (
        <ul className="space-y-3">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="transition-colors hover:bg-accent/30">
                  <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">
                      {tool.icon}
                    </span>
                    <div className="flex-1">
                      <CardTitle className="text-base">{tool.title}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {tool.description}
                      </CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <CaptainLock />
      )}
    </main>
  );
}
