import Link from "next/link";
import type { DutyCardShiftView } from "@/lib/shifts";

// "For the shifts" on a duty card's page (#250, the owner's Option A,
// 2026-10-02): every shift this year that uses the card, with its team and
// hours, and a way back to Shifts. A card may serve several shifts (one
// Dishes card for breakfast and dinner dishes). The links are made in each
// shift's set-up, never here.

const KICKER =
  "font-pixel text-[10px] leading-4 uppercase tracking-[0.15em] text-muted-foreground";

export function DutyCardShifts({
  shifts,
  shiftsHref,
}: {
  shifts: DutyCardShiftView[];
  shiftsHref: string;
}) {
  return (
    <section
      aria-labelledby="duty-card-shifts"
      className="flex flex-col gap-2 border border-border bg-card p-4 text-sm leading-6"
    >
      <h2 id="duty-card-shifts" className={KICKER}>
        For the shifts
      </h2>
      {shifts.length === 0 ? (
        <p className="text-muted-foreground">
          No shift uses this card this year yet. A lead picks it in the
          shift&apos;s set-up on Shifts.
        </p>
      ) : (
        <ul aria-label="Shifts that use this card" className="flex flex-col">
          {shifts.map((s) => (
            <li key={s.id}>
              <span className="font-semibold">{s.name}</span>
              <span className="text-muted-foreground">
                {" "}
                · {s.teamLabel} · {s.timeText} {s.daysText}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={shiftsHref}
        className="w-fit text-primary underline underline-offset-4 hover:text-primary/80"
      >
        Open in Shifts
      </Link>
    </section>
  );
}
