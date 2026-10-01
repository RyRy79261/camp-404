import { cn } from "@camp404/ui/lib/utils";
import { ShiftTypeDialog } from "@/components/shifts/shift-type-dialog";
import type { ShiftsView, ShiftTypeView } from "@/lib/shifts";

// "The shifts" (#248), as the owner approved it with the day table (Option A,
// 2026-10-01): the same table style (Time | Shift | What it is | Each day |
// Change) when its box is 48rem or wider; narrower, one row per shift with its hours
// down the left. Change sits in the same right-hand slot; on a row the viewer
// may not set up, the slot stays and is empty, so the columns never move.
// Adding a shift, the missing Burn days and removing a shift live in the
// dialog, never in the row.

const TH =
  "h-10 px-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const TX = "px-3 py-[18px] align-top";
const BADGE =
  "inline-block border border-border px-1.5 py-0.5 font-pixel text-[9px] leading-3 uppercase tracking-[0.12em] whitespace-nowrap text-muted-foreground";

const perDay = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** The teams the dialog offers for a shift: the viewer's, and its own. */
function teamsFor(view: ShiftsView, t: ShiftTypeView) {
  return view.teams.some((x) => x.key === t.team)
    ? view.teams
    : [{ key: t.team, label: t.teamLabel }, ...view.teams];
}

function Change({
  view,
  t,
  className,
}: {
  view: ShiftsView;
  t: ShiftTypeView;
  className: string;
}) {
  if (!t.canManage)
    return <span aria-hidden className={cn("inline-block", className)} />;
  return (
    <ShiftTypeDialog
      type={t}
      teams={teamsFor(view, t)}
      triggerClassName={className}
      missingDays={t.missingDays}
      hasPeople={t.hasPeople}
    />
  );
}

export function ShiftTypesTable({
  view,
  arrows,
}: {
  view: ShiftsView;
  /** The day table has a lead-tools column: keep this one in line with it. */
  arrows: boolean;
}) {
  const canAdd = view.teams.length > 0 && view.burnDays.length > 0;
  return (
    <section
      aria-labelledby="shift-types-title"
      className="@container/types border border-border bg-card"
    >
      <div className="flex flex-col gap-3 p-4 @min-[48rem]/types:flex-row @min-[48rem]/types:items-center @min-[48rem]/types:justify-between @min-[48rem]/types:gap-4 @min-[48rem]/types:border-b @min-[48rem]/types:border-border">
        <div>
          <h2
            id="shift-types-title"
            className="font-sans text-base font-semibold tracking-normal normal-case"
          >
            The shifts
          </h2>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Each runs every day of the Burn unless a lead skips a day.
          </p>
        </div>
        {canAdd && (
          <div className="hidden @min-[48rem]/types:block">
            <ShiftTypeDialog teams={view.teams} triggerClassName="h-8" />
          </div>
        )}
      </div>

      {view.types.length === 0 ? (
        <p className="border-t border-border p-4 text-sm text-muted-foreground @min-[48rem]/types:border-t-0">
          No shifts set up yet.
        </p>
      ) : (
        <>
          <table className="hidden w-full table-fixed border-collapse text-sm leading-5 @min-[48rem]/types:table">
            <caption className="sr-only">The shifts</caption>
            <colgroup>
              {arrows && <col style={{ width: 44 }} />}
              <col style={{ width: 120 }} />
              <col style={{ width: 216 }} />
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 136 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                {arrows && <th className={cn(TH, "pr-0 pl-4")} />}
                <th className={cn(TH, !arrows && "pl-4")}>Time</th>
                <th className={TH}>Shift</th>
                <th className={TH}>What it is</th>
                <th className={TH}>Each day</th>
                <th className={cn(TH, "pr-4")}>
                  <span className="sr-only">Change</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.types.map((t, i) => (
                <tr
                  key={t.id}
                  aria-label={t.name}
                  className={cn(
                    i < view.types.length - 1 && "border-b border-border",
                  )}
                >
                  {arrows && <td className="pr-0 pl-4" />}
                  <td
                    className={cn(
                      TX,
                      "whitespace-nowrap tabular-nums",
                      !arrows && "pl-4",
                    )}
                  >
                    {t.timeText}
                  </td>
                  <td className={TX}>
                    <div className="font-semibold">{t.name}</div>
                    <span data-slot="badge" className={cn(BADGE, "mt-1")}>
                      {t.teamLabel}
                    </span>
                  </td>
                  <td className={cn(TX, "text-muted-foreground")}>
                    {t.note ?? "–"}
                  </td>
                  <td className={cn(TX, "tabular-nums")}>{perDay(t.places)}</td>
                  <td className="p-3 pr-4 text-right align-top">
                    <Change view={view} t={t} className="h-8 w-28" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul
            aria-label="The shifts"
            className="border-t border-border @min-[48rem]/types:hidden"
          >
            {view.types.map((t, i) => (
              <li
                key={t.id}
                aria-label={t.name}
                className={cn(
                  "grid grid-cols-[48px_minmax(0,1fr)_96px] items-start gap-x-3 p-4",
                  i > 0 && "border-t border-border",
                )}
              >
                <div className="row-span-2 flex flex-col tabular-nums">
                  <b className="text-sm leading-8 font-bold">
                    {t.timeText.split("–")[0]}
                  </b>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {t.timeText.split("–")[1]}
                  </span>
                </div>
                <div className="min-w-0 text-sm leading-8 font-semibold">
                  {t.name}
                </div>
                <div className="flex justify-end">
                  <Change view={view} t={t} className="h-8 w-24" />
                </div>
                <div className="col-span-2 mt-1 flex flex-wrap items-center gap-2">
                  <span
                    data-slot="badge"
                    className={cn(BADGE, "whitespace-normal")}
                  >
                    {t.teamLabel}
                  </span>
                  <span className="text-[13px] leading-5 tabular-nums text-muted-foreground">
                    {perDay(t.places)} a day
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {canAdd && (
        <div className="border-t border-border p-4 @min-[48rem]/types:hidden">
          <ShiftTypeDialog teams={view.teams} triggerClassName="h-8 w-full" />
        </div>
      )}
    </section>
  );
}
