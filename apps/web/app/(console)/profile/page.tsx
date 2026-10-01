import Link from "next/link";
import {
  CalendarCheck,
  ClipboardList,
  LogOut,
  Pencil,
  Wallet,
} from "lucide-react";
import { mayRecordTicket } from "@camp404/core";
import type { ParticipationStatus } from "@camp404/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@camp404/ui/components/avatar";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { rankLabel } from "@/lib/camp-roster";
import { requireMemberPage } from "@/lib/member-gate";
import { getMyParticipation } from "@/lib/participations";
import { getMemberDues } from "@/lib/dues";
import { MY_DUES_PATH } from "@/lib/dues-copy";
import { balanceSentence } from "@/lib/dues-view";
import { getMemberRefCode, ledgerCycle } from "@/lib/payments";
import { getMyTicket } from "@/lib/tickets";
import { isTeamLead } from "@/lib/users";
import { initialsFrom } from "@/lib/initials";
import { feedbackTracker } from "@/lib/integration-config";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { ReportSettingsCard } from "@/components/feedback/report-settings-card";
import { ProfileSections } from "@/components/profile/profile-sections";
import { MyTicket } from "./my-ticket";
import { PaymentReference } from "./payment-reference";

// Reads the sign-in session on every request.
export const dynamic = "force-dynamic";

export const metadata = { title: "Your profile — Camp 404" };

// The member's own answer for this year, in their words. Who decided it and
// why are the captains' to read, never shown here.
const THIS_YEAR: Record<ParticipationStatus, string> = {
  applied: "You said you're coming. The captains haven't confirmed places yet.",
  maybe: "You said maybe.",
  accepted: "You have a place at camp this year.",
  waitlisted: "You're on the waiting list.",
  not_attending: "You said you're not coming this year.",
};

// The member's own profile, laid out like the AfrikaBurn profile and account
// pages: the heading and section pills, then who you are and what you pay with
// in the main column, and help and sign-out in the side column.
export default async function ProfilePage() {
  const { authUser, campUser } = await requireMemberPage();

  const name = campUser.displayName ?? authUser.primaryEmail ?? "Burner";
  const initials = initialsFrom(campUser.displayName ?? authUser.primaryEmail);
  // The same pill the roster shows: a team lead reads "Team Lead", not "Member".
  const [lead, refCode, participation, ticket, dues] = await Promise.all([
    isTeamLead(campUser.id),
    getMemberRefCode(campUser.id),
    getMyParticipation(campUser.id),
    getMyTicket(campUser.id),
    // Their own balance for the year (#240); never anyone else's.
    ledgerCycle().then((cycle) =>
      getMemberDues(campUser.id, cycle, { forFinance: false }),
    ),
  ]);
  // A ticket matters only to someone who might come: not before they answer,
  // and not once they say No.
  const asksTicket = mayRecordTicket(participation?.status ?? null);
  const rank = rankLabel(campUser.rank, lead);
  // Read on the server; only the repo name crosses to the browser — never the
  // token. `ok: false` means a report has nowhere to go, and the card says so
  // rather than offering a button that fails.
  const tracker = feedbackTracker(process.env);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Your account / Profile"
        title="Your profile"
        description="How you show up around camp: your name and photo appear on the roster and in the family tree."
      />

      <div className="flex flex-col gap-6">
        <ProfileSections active="profile" />

        {/* One column until the page is wide; min-w-0 so a long name (which
            truncates) cannot set the column's width and push the page past
            a phone's edge. */}
        <div className="grid grid-cols-1 gap-6 page-lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 page-lg:col-span-2">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar className="h-16 w-16 text-lg page-sm:h-[72px] page-sm:w-[72px]">
                    {campUser.profileImageUrl ? (
                      <AvatarImage src={campUser.profileImageUrl} alt={name} />
                    ) : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h2 className="truncate text-2xl font-semibold normal-case tracking-tight">
                      {name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          campUser.rank === "captain" ? "default" : "secondary"
                        }
                      >
                        {rank}
                      </Badge>
                      {authUser.primaryEmail && (
                        <span className="truncate text-sm text-muted-foreground">
                          {authUser.primaryEmail}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/profile/edit">
                    <Pencil aria-hidden />
                    Edit profile
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {refCode && <PaymentReference code={refCode} />}

            {dues && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="h-4 w-4 text-accent" aria-hidden />
                    Your dues
                  </CardTitle>
                  <CardDescription>
                    {balanceSentence(dues.balance)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={MY_DUES_PATH}>Open My dues</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarCheck className="h-4 w-4 text-accent" aria-hidden />
                  This year
                </CardTitle>
                {/* The member's answer, and the way to change it, on one
                    line. With no answer yet, where the question will reach
                    them: the captains send "Coming this year?". */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <CardDescription>
                    {participation
                      ? THIS_YEAR[participation.status]
                      : "You haven't told us yet. When the captains ask \u201cComing this year?\u201d, it waits for you in Notifications."}
                  </CardDescription>
                  {participation ? (
                    <Button
                      asChild
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                    >
                      <Link href="/tools/forms/attendance">
                        Change your answer
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/notifications">Open Notifications</Link>
                    </Button>
                  )}
                </div>
              </CardHeader>
              {asksTicket && (
                <CardContent>
                  <MyTicket ticket={ticket} />
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-accent" aria-hidden />
                  Burner questionnaire
                </CardTitle>
                <CardDescription>
                  Want to update your burner questionnaire answers?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/onboarding/questionnaire">Review them here</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <ReportSettingsCard
              filing={tracker.ok ? "ok" : tracker.reason}
              repo={tracker.ok ? `${tracker.owner}/${tracker.name}` : null}
              aiAvailable={!!process.env.ANTHROPIC_API_KEY}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Session</CardTitle>
                <CardDescription>
                  Signing out also stops this device getting your notifications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <SignOutLink>
                    <LogOut aria-hidden />
                    Sign out
                  </SignOutLink>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
