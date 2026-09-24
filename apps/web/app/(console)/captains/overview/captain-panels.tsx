import { cache } from "react";
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
import { toRosterRow } from "@/lib/camp-roster";
import { ledgerCycle, receivedTotalsByCurrency } from "@/lib/payments";
import {
  listOpenSendBlocking,
  listOpenSendGates,
} from "@/lib/questionnaire-definitions";
import { getCampManagementRoster, getTeamCoverage } from "@/lib/roster";
import { usesTestStore } from "@/lib/test-mode";
import {
  deriveKpis,
  deriveReadinessFunnel,
  deriveSendCompletion,
  deriveTeamCoverage,
} from "./readiness";
import {
  KpiCards,
  ReadinessFunnelCard,
  SendCompletionCard,
  TeamCoverageCard,
} from "./status-board";

// The captain-only panels of the Overview (the AfrikaBurn console's status
// board: KPI cards, the funnel, the coverage rails, the activity feed). Server
// components that read their own data; the page renders them only for a
// captain, and every number is a real query result — or says it is not
// available here, which is the one thing a number must never quietly stand in
// for.

/**
 * The camp's team config, read once per request.
 *
 * Both captain panels need the team labels, and they render on the same page in
 * the same pass — two `camp_settings` selects on the stateless HTTP driver for
 * one JSONB row that cannot change mid-render. Scoped to this module on purpose
 * rather than applied to `getTeamsConfig` itself: `cache` lives for the whole
 * request, which would hand a camp-settings server action its own pre-mutation
 * config on the re-render that follows it. Nothing on the Overview mutates it.
 */
const overviewTeamsConfig = cache(getTeamsConfig);

/**
 * The whole captain status board: the four KPI cards, the readiness funnel and
 * the two coverage rails.
 *
 * One component because the funnel and the KPI cards are the SAME roster read —
 * the counts would be a lie if the two halves of the page could disagree, and a
 * second `getCampManagementRoster()` on one render would be a second answer.
 */
export async function CaptainStatusBoard() {
  // Six independent reads, issued together. The two send reads are the ones
  // the test store cannot answer, and they answer empty there.
  const [members, openSends, coverage, teamsConfig, gates, received] =
    await Promise.all([
      getCampManagementRoster(),
      listOpenSendBlocking(),
      getTeamCoverage(),
      overviewTeamsConfig(),
      listOpenSendGates(),
      ledgerCycle().then((cycle) => receivedTotalsByCurrency(cycle)),
    ]);
  const rows = members.map(toRosterRow);
  // Every deployment reads the payments ledger (the test store keeps a twin),
  // so dues are known everywhere. The test store has no required_actions
  // beyond the burner-profile gate, so that rung, and the dues rung below it,
  // are unknown there rather than a figure that misses most of it — the same
  // guard RecentActivity makes for the audit trail it also cannot read.
  const readable = !usesTestStore();
  const funnel = deriveReadinessFunnel(rows, {
    dues: true,
    actions: readable,
  });
  // The WHOLE configured list, archived entries included: `deriveTeamCoverage`
  // drops an archived team nobody is on and keeps one that still has members,
  // under the label the captain gave it.
  const teams = deriveTeamCoverage(coverage, teamsConfig.teams);
  const sends = deriveSendCompletion(gates);
  // The unknown the completion card respects, said in the KPI row's own
  // shape: no open-send list means that card has no figure, not a figure of 0.
  // The dues card reads the ledger and names the money in, per currency.
  const kpis = deriveKpis(
    rows,
    readable ? openSends.size : null,
    { dues: true },
    received,
  );

  return (
    <>
      <KpiCards kpis={kpis} />
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

/**
 * The last handful of audit rows, in plain sentences — the console's "what has
 * been happening" panel, and the way into the full audit log.
 *
 * It renders NOTHING rather than an empty card where there is no audit trail to
 * read (the E2E test store keeps none): "Nothing recorded yet" would be a claim
 * about the camp, not about the store.
 */
export async function RecentActivity() {
  if (usesTestStore()) return null;
  const [page, teams] = await Promise.all([
    listAuditLog({ limit: 6 }),
    overviewTeamsConfig(),
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
