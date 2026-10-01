import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { formatMoney, sumMinor } from "@camp404/core";
import { Team } from "@camp404/types";
import { buttonVariants } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { listBudgetTotals, listClaimsForApproval } from "@/lib/claims";
import { APPROVALS_REFUSAL, MY_CLAIMS_PATH } from "@/lib/claims-copy";
import { BudgetStats } from "@/components/teams/budget-stats";
import { ledgerCycle } from "@/lib/payments";
import { getLeadTeams } from "@/lib/users";
import { ClaimApprovals, type ApprovalRow } from "./claim-approvals";

export const dynamic = "force-dynamic";

export const metadata = { title: "Claims to approve — Camp 404" };

// Claims waiting for a team's yes (#242). A lead OF THAT TEAM, or a captain,
// says yes at any amount (owner, 2026-09-30: no limit that needs a second
// yes); then the Finance team pays. A lead sees only the claims of the teams
// they lead (canApproveClaim), a captain every team's; a member sees the
// heading and a lock, and nothing is read. What a lead reads is who, how
// much, when and what for, never the receipts or the bank details (those are
// the Finance team's and the member's). Each team's budget sits above its
// claims, as the same four figures and bar as the team's page, so a yes is
// said knowing what is left.

const EYEBROW = "Teams / Claims to approve";

export default async function ClaimApprovalsPage() {
  const gate = await captainPageGate("team_lead");
  const data = gate.cleared
    ? await (async () => {
        const cycle = await ledgerCycle();
        const scope =
          gate.rank === "captain"
            ? ("all" as const)
            : (await getLeadTeams(gate.campUser.id)).filter(
                (t): t is Team => Team.safeParse(t).success,
              );
        const [claims, totals, config] = await Promise.all([
          listClaimsForApproval({ cycle, teams: scope }),
          listBudgetTotals(cycle),
          getTeamsConfig(),
        ]);
        return { scope, claims, totals, config };
      })()
    : null;

  if (!data) {
    return (
      <div className="flex flex-col">
        <PageHeading
          eyebrow={EYEBROW}
          title="Claims to approve"
          description="Claims members made for a team, waiting for the team's yes."
        />
        <CaptainLock
          title="Team leads and captains"
          message={`${APPROVALS_REFUSAL} Your rank doesn't have clearance for this.`}
        />
      </div>
    );
  }

  const labels = teamLabelMap(data.config);
  // One card per team: the teams they lead (with nothing waiting too), or,
  // for a captain, every team with a claim waiting.
  const byTeam = new Map<string, typeof data.claims>();
  const shown =
    data.scope === "all"
      ? [...new Set(data.claims.map((c) => c.team ?? "general"))]
      : data.scope;
  for (const key of shown) byTeam.set(key, []);
  for (const c of data.claims) byTeam.get(c.team ?? "general")?.push(c);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={EYEBROW}
        title="Claims to approve"
        description={
          data.scope === "all"
            ? "Claims members made for a team, waiting for a yes. A lead of the team or a captain says yes; then the Finance team pays it."
            : "Claims members made for the teams you lead. Say yes if it was a team purchase; then the Finance team pays it."
        }
        actions={
          <Link
            href={MY_CLAIMS_PATH}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ReceiptText aria-hidden />
            Claim money back
          </Link>
        }
      />
      {byTeam.size === 0 ? (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Nothing is waiting for a yes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {[...byTeam.entries()].map(([key, claims]) => {
            const totals = Team.safeParse(key).success
              ? data.totals[key as Team]
              : null;
            const label = key === "general" ? "No team" : (labels[key] ?? key);
            const waitingCents = sumMinor(claims.map((c) => c.amountCents));
            return (
              <Card key={key}>
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-base">{label}</CardTitle>
                  {claims.length > 0 && (
                    <CardDescription className="tabular-nums">
                      {claims.length} waiting · {formatMoney(waitingCents)}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-5 p-5 pt-0">
                  {totals && (
                    <BudgetStats
                      totals={totals}
                      label={`${label} budget`}
                      className="border-b border-border pb-5"
                    />
                  )}
                  {claims.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing is waiting for {label}.
                    </p>
                  ) : (
                    <ClaimApprovals
                      label={`Claims waiting for ${label}`}
                      rows={claims.map(
                        (c): ApprovalRow => ({
                          id: c.id,
                          submitterName:
                            c.submitterName?.trim() || "Unnamed burner",
                          description: c.description,
                          amountCents: c.amountCents,
                          spentOn: c.spentOn,
                          own: c.submitterId === gate.campUser.id,
                        }),
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
