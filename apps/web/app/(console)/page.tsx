import Link from "next/link";
import { redirect } from "next/navigation";
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
import { deriveViewerRank, hasClearance } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { getAuthenticatedUser } from "@/lib/auth";
import { isCampBootstrapped } from "@/lib/bootstrap";
import { getCurrentCycle } from "@/lib/camp-config";
import { resolveMemberState } from "@/lib/member-gate";
import { getPendingQuestionnaires, isTeamLead } from "@/lib/users";
import { QueueCard } from "@/components/questionnaire/queue-card";
import { EnablePush } from "@/components/push/enable-push";
import { LandingHero } from "../landing-hero";
import { CaptainStatusBoard, RecentActivity } from "./overview/captain-panels";

// Reads the Neon Auth session cookie on every request, so can't be
// statically prerendered.
export const dynamic = "force-dynamic";

/**
 * The console destinations, as cards (the AfrikaBurn console's quick-links
 * grid). Each carries the same rank bar as its nav entry and page gate, so a
 * card never leads somewhere that refuses.
 */
const QUICK_LINKS: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  rank: ViewerRank;
}[] = [
  {
    href: "/captains/camp-management",
    icon: Users,
    title: "Roster",
    desc: "Who's coming, their teams and statuses",
    rank: "camp_member",
  },
  {
    href: "/captains/questionnaires",
    icon: ListChecks,
    title: "Questionnaires",
    desc: "Build, send and read forms",
    rank: "team_lead",
  },
  {
    href: "/captains/announcements",
    icon: Megaphone,
    title: "Announcements",
    desc: "Post to the camp or your crew",
    rank: "team_lead",
  },
  {
    href: "/captains/payments",
    icon: Wallet,
    title: "Dues & payments",
    desc: "Record what the bank statement shows",
    rank: "captain",
  },
  {
    href: "/captains/camp-settings",
    icon: Settings,
    title: "Camp settings",
    desc: "Teams and the camp's year",
    rank: "captain",
  },
  {
    href: "/captains/audit",
    icon: ScrollText,
    title: "Audit log",
    desc: "Who changed or read someone's data",
    rank: "captain",
  },
  {
    href: "/tools/forms",
    icon: FileText,
    title: "My forms",
    desc: "Your answers, and what changed",
    rank: "camp_member",
  },
  {
    href: "/family-tree",
    icon: GitBranch,
    title: "Family tree",
    desc: "Who invited whom",
    rank: "camp_member",
  },
  {
    href: "/tools/invite",
    icon: UserPlus,
    title: "Invite a member",
    desc: "Make an invite code for someone",
    rank: "camp_member",
  },
];

export default async function OverviewPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return <LandingHero />;
  }

  // First-time setup: on a fresh system (no captain yet) the first signed-in
  // person becomes the founding captain, before any invite or onboarding gate.
  if (!(await isCampBootstrapped())) {
    redirect("/setup");
  }

  // The member ladder every member page shares (lib/member-gate): an invite,
  // any blocking questionnaire, a finished burner profile, then approval.
  const state = await resolveMemberState();
  if (state.kind === "signed_out") redirect("/auth/sign-in");
  if (state.block) redirect(state.block.href);
  const { campUser } = state;

  const [lead, pending, cycle] = await Promise.all([
    isTeamLead(campUser.id),
    getPendingQuestionnaires(campUser.id),
    getCurrentCycle(),
  ]);
  const viewerRank = deriveViewerRank(campUser.rank, lead);
  const isCaptain = viewerRank === "captain";
  const links = QUICK_LINKS.filter((l) => hasClearance(viewerRank, l.rank));
  const firstName = campUser.displayName?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow={
          cycle
            ? `${cycle.name ? `${cycle.year} · ${cycle.name}` : cycle.year} · Camp 404`
            : "Camp 404"
        }
        title="Overview"
        description={
          firstName
            ? `Welcome back, ${firstName}. Everything at camp, at a glance.`
            : "Everything at camp, at a glance."
        }
      />

      {isCaptain && <CaptainStatusBoard />}

      {pending.length > 0 && (
        <section
          aria-labelledby="needs-your-answer"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="needs-your-answer"
              className="text-base font-bold normal-case tracking-normal"
            >
              Needs your answer
            </h2>
            <p className="text-sm text-muted-foreground">
              {pending.length === 1
                ? "A captain is waiting on this questionnaire. It stays here until you finish it."
                : `A captain is waiting on these ${pending.length} questionnaires. They stay here until you finish them.`}
            </p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {pending.map((q) => (
              <li key={q.activationId}>
                <QueueCard
                  title={q.title}
                  status="next-up"
                  blocking={q.blocking}
                  dueAt={q.dueAt}
                  href={`/questionnaires/${q.activationId}`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-label="Camp sections"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {links.map(({ href, icon: Icon, title, desc }) => (
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

      {isCaptain && <RecentActivity />}

      {/* Web push opt-in; renders nothing unless push is supported and the
          member has not decided yet. */}
      <EnablePush />
    </div>
  );
}
