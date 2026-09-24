import { ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { CheckListCard } from "@/components/system/check-list";
import { captainPageGate } from "@/lib/captain-gate";
import {
  dailyTimeLabel,
  isJobBuilt,
  SCHEDULED_JOBS,
} from "@/lib/cron-schedule";
import { getSystemStatus } from "@/lib/system-probe";

export const dynamic = "force-dynamic";

export const metadata = { title: "System status — Camp 404" };

// The page to open when someone says "the app is broken": whether each service
// the camp relies on is set up and answering, and what to change if not.
// Composed after the AfrikaBurn console's System panel (headline, then check
// cards), without its access, roles and audit cards.
//
// Captain-only, preview-but-locked (D3): anyone else sees the heading and a
// lock, and the status is never read for them. No secret reaches this page:
// lib/system-status.ts prints names, counts and the database host only.

const HEADING = {
  eyebrow: "Captains / System",
  title: "System status",
  description:
    "Whether each service this camp relies on is set up and answering. Read-only. It shows which setting to change, never its value.",
} as const;

export default async function SystemStatusPage() {
  const { cleared } = await captainPageGate("captain");

  if (!cleared) {
    return (
      <div className="flex flex-col">
        <PageHeading {...HEADING} />
        <CaptainLock message="System status is captain-only. Your rank doesn't have clearance for this." />
      </div>
    );
  }

  const status = await getSystemStatus();
  const attention = status.headline.tone === "attention";

  return (
    <div className="flex flex-col gap-6">
      <PageHeading {...HEADING} />

      {/* The worst thing on the page, named first, so a captain who stops
          reading here still knows whether to keep going. */}
      <div
        className={
          attention
            ? "flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
            : "flex items-start gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm"
        }
      >
        {attention ? (
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden
          />
        ) : (
          <ShieldAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
        <p className="text-foreground">{status.headline.summary}</p>
      </div>

      <CheckListCard
        title="Core services"
        description="What the camp needs to run at all. The database is asked a test question while this page loads, so a setting being present and the service answering are checked separately."
        checks={status.core}
      />

      <CheckListCard
        title="Optional services"
        description="The camp works without these. One that is not set up says so to members and does nothing else."
        checks={status.optional}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled jobs</CardTitle>
          <CardDescription>
            What runs by itself each day, and when. The app does not record when
            each job last ran, so no last-run time is shown here. Vercel&rsquo;s
            Cron Jobs tab for this project lists each run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col">
            {SCHEDULED_JOBS.map((job) => {
              const built = isJobBuilt(job.job);
              return (
                <div
                  key={job.job}
                  className="flex flex-col gap-1.5 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:gap-6"
                >
                  <dt className="flex w-full shrink-0 flex-col gap-1.5 sm:w-56">
                    <span className="text-sm font-medium text-foreground">
                      {job.label}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        {dailyTimeLabel(job.schedule)}
                      </Badge>
                      {!built && (
                        <Badge variant="secondary">Not built yet</Badge>
                      )}
                    </span>
                  </dt>
                  <dd className="flex flex-1 flex-col gap-1.5">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {job.what}
                    </p>
                    <p className="font-mono text-[11px] tracking-wide break-all text-muted-foreground/70">
                      /api/cron/{job.job}
                    </p>
                  </dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
