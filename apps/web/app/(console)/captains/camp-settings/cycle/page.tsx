import Link from "next/link";
import { planRollover } from "@camp404/db/cycle-rollover";
import { Button } from "@camp404/ui/components/button";
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
import { LOGISTICS_PATH, YEAR_LOCK_MESSAGE } from "@/lib/logistics-copy";
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
// The year's AfrikaBurn deadlines live here too (owner, 2026-09-30: "this
// should be under the years settings page"): captains add them one at a
// time, and each with a date goes on the camp calendar. Members read them on
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
            title: row.title,
            dueDate: row.dueDate,
            note: row.note,
            done: row.done,
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
        title="The camp’s year"
        description={
          founded
            ? "This year’s AfrikaBurn deadlines, and starting a new year when the camp moves on to the next burn. Some questionnaires go out again on a blank form; most stay exactly as they are. Nothing is ever deleted — every previous year’s answers stay readable."
            : "Every questionnaire sent and every answer given is filed under a year. The camp hasn’t said which year this is yet, so nothing is filed under one. Say so here and it will be, the AfrikaBurn deadlines too."
        }
      />

      {plan ? (
        <div className="flex flex-col gap-6">
          {/* Before the camp names its year, deadlines are filed under the
              sentinel and the founding year adopts them. Until then the year
              is the first thing to settle, so its card comes first. */}
          {/* Keyed, so the rollover panel is the same component when the
              order flips at the founding, and keeps its receipt on screen. */}
          {(founded ? ["deadlines", "year"] : ["year", "deadlines"]).map(
            (part) =>
              part === "year" ? (
                <RolloverPanel key="year" plan={plan} />
              ) : (
                <DeadlinesManager key="deadlines" deadlines={deadlines} />
              ),
          )}
        </div>
      ) : (
        <CaptainLock
          message={YEAR_LOCK_MESSAGE}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={LOGISTICS_PATH}>Open Logistics</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
