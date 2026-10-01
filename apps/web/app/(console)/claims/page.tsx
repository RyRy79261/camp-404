import { FileText } from "lucide-react";
import { campDayKey, formatMoney } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { ClaimDialog } from "@/components/claims/claim-dialog";
import { activeTeams, getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { listMyClaims, type MyClaim } from "@/lib/claims";
import { claimReceiptPath } from "@/lib/claims-copy";
import { CLAIM_BADGE, receiptLabel } from "@/lib/claims-view";
import { formatDay } from "@/lib/dues-view";
import { requireMemberPage } from "@/lib/member-gate";
import { getMyTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "My claims — Camp 404" };

// A member's own claims (#242): money they spent for a team, and where each
// claim is. They claim with the receipts and their bank account; a lead of
// that team (or a captain) says yes; the Finance team pays it back. Only
// their own: nothing about anyone else's claims is read. "Claim money back"
// is the page's one main button, at the top, and opens the form; below it
// the claims are one table (cards in a narrow window): what and for which
// team, the amount, where it is, and the receipts. A claim that was turned
// down says why in a tinted note.

export default async function MyClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { campUser } = await requireMemberPage();
  const [claims, config, myTeams, { team: asked }] = await Promise.all([
    listMyClaims(campUser.id),
    getTeamsConfig(),
    getMyTeams(campUser.id),
    searchParams,
  ]);
  const teams = activeTeams(config).map((t) => ({
    key: t.key,
    label: t.label,
  }));
  const labels = teamLabelMap(config);
  // The claim form starts on the team a team page sent them from (`?team=`),
  // when it is an active team they are on; else on their first such team.
  const mine = myTeams
    .map((m) => m.team)
    .filter((key) => teams.some((t) => t.key === key));
  const defaultTeam = (asked && mine.includes(asked) ? asked : mine[0]) ?? null;
  const today = campDayKey(new Date());
  const teamLabel = (c: MyClaim) =>
    c.team ? (labels[c.team] ?? c.team) : null;

  const columns: ResponsiveColumn<MyClaim>[] = [
    {
      id: "what",
      header: "Claim",
      role: "title",
      cell: (c) => {
        const team = teamLabel(c);
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-medium">{c.description}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {[team, c.spentOn ? `bought ${formatDay(c.spentOn)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {c.status === "rejected" && (
              <div className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-normal">
                <span className="font-medium">Why it was turned down</span>
                {c.decisionNote ? `: ${c.decisionNote}` : ": no reason given."}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Where it is",
      role: "badge",
      cell: (c) => {
        const badge = CLAIM_BADGE[c.status];
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cellClassName: "whitespace-nowrap font-medium tabular-nums",
      cell: (c) => formatMoney(c.amountCents),
    },
    {
      id: "receipts",
      header: "Receipts",
      cellClassName: "whitespace-nowrap",
      cell: (c) =>
        c.files.length === 0 ? null : (
          <span className="flex flex-col gap-1">
            {c.files.map((f, i) => (
              <a
                key={f.id}
                href={claimReceiptPath(f.id)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {receiptLabel(i, f.contentType)}
              </a>
            ))}
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me / My claims"
        title="My claims"
        description="Spent your own money on something for a team? Claim it back here with the receipt. The team's lead says yes, then the Finance team pays you."
        actions={
          <ClaimDialog teams={teams} defaultTeam={defaultTeam} today={today} />
        }
      />

      {claims.length === 0 ? (
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Your claims</CardTitle>
            <CardDescription>
              A claim waits for the team&rsquo;s yes, then for the Finance team
              to pay it.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <p className="text-sm text-muted-foreground">
              You haven&rsquo;t claimed anything yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ResponsiveDataTable
          columns={columns}
          data={claims}
          getRowKey={(c) => c.id}
          label="Your claims"
          stackBelow="md"
          framed
        />
      )}
    </div>
  );
}
