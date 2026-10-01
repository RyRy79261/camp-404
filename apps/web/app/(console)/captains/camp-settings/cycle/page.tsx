import { planRollover } from "@camp404/db/cycle-rollover";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  DeadlinesManager,
  type DeadlineItem,
} from "@/components/logistics/deadlines-manager";
import { captainPageGate } from "@/lib/captain-gate";
import {
  deadlineCalendarState,
  isLogisticsCalendarConnected,
  listDeadlines,
} from "@/lib/logistics";
import { usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { RolloverPanel, type RolloverPlanView } from "./rollover-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "The camp's year — Camp 404" };

// The camp's year, beside the team editor (spec §8). Two screens behind one
// route, because they are the same question a year apart: a camp that has never
// said what year it is gets asked, and a camp that has gets the rollover plan.
// planRollover() reports which by returning `from: null`.
//
// Preview-but-locked (D3) like every other captain surface: non-captains see the
// heading and a CaptainLock, and the plan is withheld server-side — never
// fetched, never sent.
//
// planRollover() is a pure read with zero writes, so calling it on every page
// load is safe by construction; that is what lets the confirm screen show the
// captain the real numbers before anything happens.
//
// The year's AfrikaBurn dates live here too (owner, 2026-09-30: "this
// should be under the years settings page"), first on the page (owner,
// 2026-10-01, mock-up A): AfrikaBurn's standard dates are listed every year,
// each "Not announced yet" until a captain sets it, and each with a date goes
// on the camp calendar as "AfrikaBurn: <name>". Members read them on
// Logistics.

export default async function CycleRolloverPage() {
  const { cleared } = await captainPageGate("captain");

  // Typed to the island's structural view so the page conforms to the client
  // contract by assignment, rather than the island importing the DB package.
  const [plan, deadlines]: [RolloverPlanView | null, DeadlineItem[]] = cleared
    ? await Promise.all([
        usesTestStore() ? testStore.planRollover() : planRollover(),
        listDeadlines().then((rows) => {
          const connected = isLogisticsCalendarConnected();
          return rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.title,
            dueDate: row.dueDate,
            note: row.note,
            done: row.done,
            skipped: row.skipped,
            version: row.version,
            calendar: deadlineCalendarState(row, connected),
          }));
        }),
      ])
    : [null, []];
  // A camp with no year yet is being asked one thing, and a camp with one is
  // being asked another. The heading says which rather than making the panel
  // contradict it.
  const founded = plan?.from != null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Camp settings / Year"
        title={
          founded ? `The camp’s year · ${plan.from!.year}` : "The camp’s year"
        }
        description={
          founded
            ? "AfrikaBurn’s dates for this year. Fill each one in when AfrikaBurn announces it: it goes on the camp calendar, and members see it on Logistics."
            : "Every questionnaire sent and every answer given is filed under a year. The camp hasn’t said which year this is yet, so nothing is filed under one. Say so here and it will be, AfrikaBurn’s dates too."
        }
      />

      {plan ? (
        <div className="flex flex-col gap-6">
          {/* Before the camp names its year, deadlines are filed under the
              sentinel and the founding year adopts them. */}
          <DeadlinesManager deadlines={deadlines} />
          <RolloverPanel plan={plan} />
        </div>
      ) : (
        <CaptainLock message="Starting a new year is captain-only. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}
