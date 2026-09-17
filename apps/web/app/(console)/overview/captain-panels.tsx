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
import { deriveRosterStats, toRosterRow } from "@/lib/camp-roster";
import { listOpenSendBlocking } from "@/lib/questionnaire-definitions";
import { getCampManagementRoster } from "@/lib/roster";
import { usesTestStore } from "@/lib/test-mode";

// The captain-only panels of the Overview (the AfrikaBurn console's KPI cards
// and activity feed). Server components that read their own data; the page
// renders them only for a captain, and every number is a real query result.

interface Kpi {
  label: string;
  value: number;
  hint: string;
  href: string;
}

export async function CaptainKpis() {
  const [members, openSends] = await Promise.all([
    getCampManagementRoster(),
    listOpenSendBlocking(),
  ]);
  const stats = deriveRosterStats(members.map(toRosterRow));
  const approved = members.filter((m) => m.approvalStatus === "approved");
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
      value: openSends.size,
      hint:
        openSends.size === 0
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
