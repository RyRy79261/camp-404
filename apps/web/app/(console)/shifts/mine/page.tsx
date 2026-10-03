import Link from "next/link";
import { AlertTriangle, Printer } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { SignUpButton } from "@/components/shifts/shift-controls";
import { DutyCardLink } from "@/components/shifts/shift-day";
import {
  AddVolunteerShift,
  RemoveVolunteerShift,
} from "@/components/shifts/volunteer-shifts";
import { captainPageGate } from "@/lib/captain-gate";
import { getMyShifts } from "@/lib/shifts";
import { MY_SHIFTS_PRINT_PATH, SHIFTS_PATH } from "@/lib/shifts-copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "My shifts — Camp 404" };

// My shifts (#248): the signed-in member's own week, in time order, with a
// warning beside any two things of theirs at the same time, and the minimum
// as a reminder (never a block). Below, their own AfrikaBurn volunteer shifts
// (Rangers, Greeters, Sanctuary), which only they see, so the clash check
// covers them too. A pocket card prints from here: on site there is no
// internet, so the paper is what they carry. A shift with a duty card links
// to it (#250), as on Shifts.

function ClashLine({ with: others }: { with: string[] }) {
  if (others.length === 0) return null;
  return (
    <p className="inline-flex items-start gap-1.5 text-sm text-warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      At the same time as {others.join(" and ")}.
    </p>
  );
}

export default async function MyShiftsPage() {
  const { campUser } = await captainPageGate("camp_member");
  const view = await getMyShifts(campUser.id);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Me"
        title="My shifts"
        description="Your shifts in burn week, in order. Change them before the burn; on site, the printed roster is the one that counts."
        actions={
          <>
            <Button asChild>
              <Link href={SHIFTS_PATH}>Find shifts</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={MY_SHIFTS_PRINT_PATH}>
                <Printer aria-hidden />
                Print my card
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3">
        {view.reminder && (
          <p
            role="status"
            data-testid="shift-reminder"
            className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          >
            {view.reminder}
          </p>
        )}

        <Card>
          <CardContent className="flex flex-col gap-0 p-0">
            <h2 className="px-4 pt-4 pb-3 text-base font-semibold">
              {view.count === 0
                ? "No shifts yet"
                : `${view.count} ${view.count === 1 ? "shift" : "shifts"}`}
            </h2>
            {view.shifts.length === 0 ? (
              <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
                Pick some on{" "}
                <Link href={SHIFTS_PATH} className="underline">
                  Shifts
                </Link>
                .
              </p>
            ) : (
              <ol
                aria-label="My shifts"
                className="divide-y divide-border border-t border-border"
              >
                {view.shifts.map((s) => {
                  const label = `${s.name} on ${s.dayLabel}`;
                  return (
                    <li
                      key={s.slotId}
                      aria-label={label}
                      className="flex flex-col gap-2 px-4 py-3 page-sm:flex-row page-sm:items-start page-sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{s.name}</h3>
                          <Badge variant="outline">{s.teamLabel}</Badge>
                        </div>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {s.dayLabel} · {s.timeText}
                        </p>
                        <DutyCardLink card={s.dutyCard} shiftName={s.name} />
                        {s.note && (
                          <p className="whitespace-pre-line text-sm text-muted-foreground">
                            {s.note}
                          </p>
                        )}
                        <ClashLine with={s.clashesWith} />
                      </div>
                      <div className="shrink-0 self-end page-sm:self-start">
                        {s.open ? (
                          <SignUpButton
                            slotId={s.slotId}
                            mine
                            full={false}
                            label={label}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            On paper now
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">
                My AfrikaBurn volunteer shifts
              </h2>
              <p className="text-sm text-muted-foreground">
                Rangers, Greeters, Sanctuary and the like. Only you see these;
                they are here so your camp shifts don&apos;t clash with them.
              </p>
            </div>
            {view.volunteer.length > 0 && (
              <ul
                aria-label="My AfrikaBurn volunteer shifts"
                className="divide-y divide-border rounded-lg border border-border"
              >
                {view.volunteer.map((v) => {
                  const label = `${v.department} on ${v.dayLabel}`;
                  return (
                    <li
                      key={v.id}
                      aria-label={label}
                      className="flex flex-col gap-1 px-3 py-2 page-sm:flex-row page-sm:items-center page-sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {v.department}
                        </span>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {v.dayLabel} · {v.timeText}
                        </span>
                        <ClashLine with={v.clashesWith} />
                      </div>
                      <RemoveVolunteerShift id={v.id} label={label} />
                    </li>
                  );
                })}
              </ul>
            )}
            <AddVolunteerShift />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
