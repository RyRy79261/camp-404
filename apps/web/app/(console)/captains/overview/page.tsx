import Link from "next/link";
import {
  ArrowRight,
  FileText,
  GitBranch,
  ListChecks,
  Megaphone,
  ScrollText,
  Settings,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getCurrentCycle } from "@/lib/camp-config";
import { CaptainStatusBoard, RecentActivity } from "./captain-panels";

// The camp overview: the whole camp's operations at a glance, for captains.
// It was the home page until the owner split the two (2026-09-23): "This
// thing is a camp overview thing … as a team member I should have my own
// little dashboard." Members now land on their own home (app/(console)/page.tsx),
// and this lives in the nav for captains.
export const dynamic = "force-dynamic";

export const metadata = { title: "Camp overview — Camp 404" };

/**
 * The console's sections, as cards (the AfrikaBurn console's quick-links
 * grid). This page is captain-only, and a captain may open every one.
 */
const SECTIONS: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}[] = [
  {
    href: "/captains/camp-management",
    icon: Users,
    title: "Roster",
    desc: "Who's coming, their teams and statuses",
  },
  {
    href: "/captains/questionnaires",
    icon: ListChecks,
    title: "Questionnaires",
    desc: "Build, send and read forms",
  },
  {
    href: "/captains/announcements",
    icon: Megaphone,
    title: "Announcements",
    desc: "Post to the camp or your crew",
  },
  {
    href: "/captains/payments",
    icon: Wallet,
    title: "Dues & payments",
    desc: "Record what the bank statement shows",
  },
  {
    href: "/captains/camp-settings",
    icon: Settings,
    title: "Camp settings",
    desc: "Teams and the camp's year",
  },
  {
    href: "/captains/audit",
    icon: ScrollText,
    title: "Audit log",
    desc: "Who changed or read someone's data",
  },
  {
    href: "/tools/forms",
    icon: FileText,
    title: "My forms",
    desc: "Your answers, and what changed",
  },
  {
    href: "/family-tree",
    icon: GitBranch,
    title: "Family tree",
    desc: "Who invited whom",
  },
  {
    href: "/tools/invite",
    icon: UserPlus,
    title: "Invite a member",
    desc: "Make an invite code for someone",
  },
];

export default async function CampOverviewPage() {
  const { cleared } = await captainPageGate("captain");
  const cycle = cleared ? await getCurrentCycle() : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow={
          cycle
            ? `${cycle.name ? `${cycle.year} · ${cycle.name}` : cycle.year} · Captains`
            : "Captains"
        }
        title="Camp overview"
        description="The whole camp at a glance: who is ready, which teams are covered, and what has happened lately."
      />

      {cleared ? (
        <>
          <CaptainStatusBoard />
          <section
            aria-label="Camp sections"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {SECTIONS.map(({ href, icon: Icon, title, desc }) => (
              <Link key={href} href={href} className="group">
                <Card className="h-full transition-colors group-hover:border-accent/60">
                  <CardContent className="flex flex-col gap-1.5 p-5">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-accent" aria-hidden />
                      <span className="text-sm font-semibold">{title}</span>
                      <ArrowRight
                        className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>
          <RecentActivity />
        </>
      ) : (
        <CaptainLock message="The camp overview is captain-only. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}
