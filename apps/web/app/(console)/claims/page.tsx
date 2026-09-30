import { FileText, ReceiptText } from "lucide-react";
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
import { ClaimForm } from "@/components/claims/claim-form";
import { activeTeams, getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { listMyClaims } from "@/lib/claims";
import { claimReceiptPath } from "@/lib/claims-copy";
import { CLAIM_BADGE } from "@/lib/claims-view";
import { formatDay } from "@/lib/dues-view";
import { requireMemberPage } from "@/lib/member-gate";
import { getMyTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "My claims — Camp 404" };

// A member's own claims (#242): money they spent for a team, and where each
// claim is. They claim with the receipts and their bank account; a lead of
// that team (or a captain) says yes; the Finance team pays it back. Only
// their own: nothing about anyone else's claims is read. Composed like My
// dues: their claims in the main column, the form in the side rail.

export default async function MyClaimsPage() {
  const { campUser } = await requireMemberPage();
  const [claims, config, myTeams] = await Promise.all([
    listMyClaims(campUser.id),
    getTeamsConfig(),
    getMyTeams(campUser.id),
  ]);
  const teams = activeTeams(config).map((t) => ({
    key: t.key,
    label: t.label,
  }));
  const labels = teamLabelMap(config);
  const defaultTeam =
    myTeams.find((m) => teams.some((t) => t.key === m.team))?.team ?? null;
  const today = campDayKey(new Date());

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me / My claims"
        title="My claims"
        description="Spent your own money on something for a team? Claim it back here with the receipt. The team's lead says yes, then the Finance team pays you."
      />

      <div className="grid items-start gap-6 page-lg:grid-cols-3">
        <Card className="min-w-0 page-lg:col-span-2">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Your claims</CardTitle>
            <CardDescription>
              A claim waits for the team&rsquo;s yes, then for the Finance team
              to pay it.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {claims.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven&rsquo;t claimed anything yet.
              </p>
            ) : (
              <ul aria-label="Your claims" className="divide-y divide-border">
                {claims.map((c) => {
                  const badge = CLAIM_BADGE[c.status];
                  return (
                    <li key={c.id} className="flex flex-col gap-1 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {formatMoney(c.amountCents)}
                        </span>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {c.team && (
                          <span className="text-xs text-muted-foreground">
                            {labels[c.team] ?? c.team}
                          </span>
                        )}
                      </span>
                      <span className="text-sm">{c.description}</span>
                      {c.spentOn && (
                        <span className="text-xs text-muted-foreground">
                          Bought {formatDay(c.spentOn)}
                        </span>
                      )}
                      {c.status === "rejected" && c.decisionNote && (
                        <span className="text-xs text-muted-foreground">
                          Why: {c.decisionNote}
                        </span>
                      )}
                      {c.files.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {c.files.map((f, i) => (
                            <a
                              key={f.id}
                              href={claimReceiptPath(f.id)}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" aria-hidden />
                              Receipt {i + 1}
                            </a>
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-accent" aria-hidden />
                Claim money back
              </CardTitle>
              <CardDescription>
                For something you bought for a team. Keep the receipt: a claim
                needs at least one.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ClaimForm
                teams={teams}
                defaultTeam={defaultTeam}
                today={today}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
