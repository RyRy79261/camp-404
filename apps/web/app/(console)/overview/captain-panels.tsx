import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listAuditLog } from "@camp404/db/audit";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { auditEntry } from "@/lib/audit-format";
import { getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import {
  deriveRosterStats,
  toRosterRow,
  type RosterRow,
} from "@/lib/camp-roster";
import {
  listOpenSendBlocking,
  listOpenSendGates,
} from "@/lib/questionnaire-definitions";
import { getCampManagementRoster, getTeamCoverage } from "@/lib/roster";
import { usesTestStore } from "@/lib/test-mode";
import {
  deriveReadinessFunnel,
  deriveSendCompletion,
  deriveTeamCoverage,
} from "./readiness";
import {
  ReadinessFunnelCard,
  SendCompletionCard,
  TeamCoverageCard,
} from "./status-board";

// The captain-only panels of the Overview (the AfrikaBurn console's status
// board: KPI cards, the funnel, the coverage rails, the activity feed). Server
// components that read their own data; the page renders them only for a
// captain, and every number is a real query result.

interface Kpi {
  label: string;
  value: number;
  hint: string;
  href: string;
}

/**
 * The whole captain status board: the four KPI cards, the readiness funnel and
 * the two coverage rails.
 *
 * One component because the funnel and the KPI cards are the SAME roster read —
 * the counts would be a lie if the two halves of the page could disagree, and a
 * second `getCampManagementRoster()` on one render would be a second answer.
 */
export async function CaptainStatusBoard() {
  // Five independent reads, issued together. The gate read is the only one of
  // them the test store cannot answer, and it answers empty there.
  const [members, openSends, coverage, teamsConfig, gates] = await Promise.all([
    getCampManagementRoster(),
    listOpenSendBlocking(),
    getTeamCoverage(),
    getTeamsConfig(),
    listOpenSendGates(),
  ]);
  const rows = members.map(toRosterRow);
  // The test store models no payments ledger and no required_actions, so those
  // two rungs of the ladder are unknown there rather than zero — the same
  // guard RecentActivity makes for the audit trail it also cannot read.
  const readable = !usesTestStore();
  const funnel = deriveReadinessFunnel(rows, {
    dues: readable,
    actions: readable,
  });
  // The WHOLE configured list, archived entries included: `deriveTeamCoverage`
  // drops an archived team nobody is on and keeps one that still has members,
  // under the label the captain gave it.
  const teams = deriveTeamCoverage(coverage, teamsConfig.teams);
  const sends = deriveSendCompletion(gates);

  return (
    <>
      <CaptainKpis rows={rows} openSends={openSends.size} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ReadinessFunnelCard funnel={funnel} />
        </div>
        <div className="flex flex-col gap-4">
          <TeamCoverageCard rows={teams} />
          {/* No send is modelled in the test store, so "no questionnaires are
              open" would be this panel's only possible sentence there, true or
              not. It withholds itself instead. */}
          {readable && <SendCompletionCard sends={sends} />}
        </div>
      </div>
    </>
  );
}

function CaptainKpis({
  rows,
  openSends,
}: {
  /** The one roster projection the board shares — never mapped twice. */
  rows: RosterRow[];
  openSends: number;
}) {
  const stats = deriveRosterStats(rows);
  const approved = rows.filter((m) => m.approvalStatus === "approved");
  const duesPaid = approved.filter((m) => m.duesPaid).length;

  const kpis: Kpi[] = [
    {
      label: "Members",
      value: stats.approved,
      hint: `${stats.captains} captain${stats.captains === 1 ? "" : "s"}`,
      href: "/captains/camp-management",
    },
    {
      label: "Awaiting approval",
      value: stats.pending,
      hint:
        stats.pending === 0 ? "Nobody waiting" : "Open the roster to decide",
      href: "/captains/camp-management",
    },
    {
      label: "Dues paid",
      value: duesPaid,
      hint: `of ${approved.length} approved`,
      href: "/captains/payments",
    },
    {
      label: "Open sends",
      value: openSends,
      hint:
        openSends === 0
          ? "No questionnaire is open"
          : "Questionnaires collecting answers",
      href: "/captains/questionnaires",
    },
  ];

  return (
    <section
      aria-label="Camp at a glance"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {kpis.map((kpi) => (
        <Link key={kpi.label} href={kpi.href} className="group">
          <Card className="h-full transition-colors group-hover:border-accent/60">
            <CardContent className="flex flex-col gap-1 p-5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </span>
              <span className="text-3xl font-bold tabular-nums">
                {kpi.value}
              </span>
              <span className="text-xs text-muted-foreground">{kpi.hint}</span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </section>
  );
}

export async function RecentActivity() {
  // The E2E test store keeps no audit trail.
  if (usesTestStore()) return null;
  const [page, teams] = await Promise.all([
    listAuditLog({ limit: 6 }),
    getTeamsConfig(),
  ]);
  const labels = teamLabelMap(teams);
  const now = new Date();
  const entries = page.rows.map((row) =>
    auditEntry(row, (key) => labels[key] ?? key, now),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Recent activity</CardTitle>
        <Link
          href="/captains/audit"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          Audit log
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="text-sm">
                  <span className="font-medium">{e.who}</span>{" "}
                  <span className="text-muted-foreground">
                    {e.what.toLowerCase()}
                    {e.about ? ` · ${e.about}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {e.ago ?? e.when}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
