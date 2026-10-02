import type { CSSProperties, ReactNode } from "react";
import { GENERAL_ROWS } from "@camp404/core";
import type { DailySheet } from "@/lib/daily-sheet";
import { PrintPage } from "./print-sheet";
import {
  EVENTS_SHEET_STYLE,
  teamSheetStyle,
  type TeamSheetStyle,
} from "./team-style";

// The daily site sheet's two pages for one day (#249), as the owner approved
// them (design/daily-sheet.html, 2026-10-02, A4 landscape). Page 1: the day,
// a key, then a section per team in three columns, each with its quiet
// colour and line icon (components/print/team-style.ts): time, task, first
// names and a done box, with a blank line for each open place; the Kitchen
// adds the day's dishes and the allergy line; then today's events and notes.
// Page 2, "General": the same day, and empty rows to write in jobs that come
// up on site, where there is no internet.

const MEAL_NAMES = { breakfast: "Breakfast", dinner: "Dinner" } as const;

function styleVars(style: TeamSheetStyle): CSSProperties {
  return { "--edge": style.edge, "--tint": style.tint } as CSSProperties;
}

/** A done box: drawn, never ticked. */
function Box() {
  return (
    <span
      aria-hidden
      className="inline-block h-[10px] w-[10px] border-[1.3px] border-neutral-900"
    />
  );
}

function Section({
  label,
  style,
  aside,
  children,
}: {
  label: string;
  style: TeamSheetStyle;
  aside?: string;
  children: ReactNode;
}) {
  const { Icon } = style;
  return (
    <section
      aria-label={label}
      data-testid="sheet-section"
      style={styleVars(style)}
      className="mb-[9px] break-inside-avoid border border-l-[5px] border-[var(--edge)]"
    >
      <h3 className="flex items-center gap-1.5 bg-[var(--tint)] px-[7px] py-1 text-[10.5px] font-bold uppercase tracking-[0.12em]">
        <Icon
          aria-hidden
          className="h-[13px] w-[13px] flex-none text-[var(--edge)]"
          strokeWidth={2}
        />
        {label}
        {aside && (
          <small className="ml-auto text-[9px] font-medium normal-case tracking-[0.04em] text-neutral-600">
            {aside}
          </small>
        )}
      </h3>
      {children}
    </section>
  );
}

const CELL = "border-t border-[#ddd] px-1.5 py-[3px] align-top";

function Who({ names, blanks }: { names: string[]; blanks: number }) {
  return (
    <>
      {names.join(", ")}
      {Array.from({ length: blanks }, (_, i) => (
        <span key={i}>
          {names.length > 0 || i > 0 ? ", " : ""}
          <span
            aria-label="Open place"
            role="img"
            className="inline-block h-[11px] w-[34px] border-b border-neutral-500 align-baseline"
          />
        </span>
      ))}
    </>
  );
}

function Key({ sheet }: { sheet: DailySheet }) {
  if (sheet.sections.length === 0) return null;
  return (
    <ul
      aria-label="Key"
      className="flex max-w-[520px] flex-wrap justify-end gap-x-2.5 gap-y-1 text-[9.5px] text-neutral-700"
    >
      {sheet.sections.map((s) => {
        const style = teamSheetStyle(s.team);
        const { Icon } = style;
        return (
          <li key={s.team} className="flex items-center gap-1">
            <Icon
              aria-hidden
              className="h-[13px] w-[13px] flex-none"
              style={{ color: style.edge }}
              strokeWidth={2}
            />
            {s.label}
          </li>
        );
      })}
    </ul>
  );
}

export function DailySheetPage({
  sheet,
  page,
  pages,
  printed,
}: {
  sheet: DailySheet;
  page: number;
  pages: number;
  printed: string;
}) {
  const title = `Day ${sheet.number} · ${sheet.longLabel}`;
  return (
    <PrintPage
      area="Daily site sheet"
      title={title}
      label={`Day ${sheet.number} sheet`}
      subtitle="Each team's tasks today, and who is on them. Tick each one when it's done."
      aside={<Key sheet={sheet} />}
      footer="Each team sets its usual tasks in Shifts. First names only; the details are on each duty card."
      footerEnd={`Printed ${printed} · page ${page} of ${pages}`}
    >
      <div className="columns-3 gap-[14px]">
        {sheet.sections.length === 0 && (
          <p className="mb-[9px] break-inside-avoid text-[10.5px] text-neutral-700">
            No team has tasks on this day.
          </p>
        )}
        {sheet.sections.map((s) => {
          const kitchen = s.team === "kitchen";
          return (
            <Section
              key={s.team}
              label={s.label}
              style={teamSheetStyle(s.team)}
            >
              {kitchen &&
                sheet.meals.map((m) => (
                  <p
                    key={m.meal}
                    className="border-t border-[#ddd] px-[7px] py-1 text-[10.5px]"
                  >
                    <b className="inline-block w-[72px]">
                      {MEAL_NAMES[m.meal]}
                    </b>
                    {m.dishes.join(", ")}
                  </p>
                ))}
              {kitchen && sheet.allergies.length > 0 && (
                <p
                  data-testid="sheet-allergies"
                  className="border-t border-[#ddd] px-[7px] pt-[3px] pb-1 text-[9.5px] text-neutral-700"
                >
                  Allergies:{" "}
                  {sheet.allergies.map((a, i) => (
                    <span key={`${a.severe}-${a.text}`}>
                      {i > 0 && " · "}
                      {a.severe ? (
                        <b className="font-semibold text-neutral-900">
                          {a.text} (severe)
                        </b>
                      ) : (
                        a.text
                      )}{" "}
                      {a.names.join(", ")}
                    </span>
                  ))}
                </p>
              )}
              {s.tasks.length > 0 && (
                <table className="w-full border-collapse text-[10.5px]">
                  <tbody>
                    {s.tasks.map((t) => (
                      <tr key={t.slotId} data-testid="sheet-task">
                        <td
                          className={`${CELL} w-[66px] whitespace-nowrap text-neutral-800 tabular-nums`}
                        >
                          {t.timeText}
                        </td>
                        <td className={`${CELL} w-[34%] font-semibold`}>
                          {t.name}
                        </td>
                        <td className={CELL}>
                          <Who names={t.names} blanks={t.blanks} />
                        </td>
                        <td className={`${CELL} w-4 text-right`}>
                          <Box />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          );
        })}
        <Section label="Today's events" style={EVENTS_SHEET_STYLE}>
          {sheet.events.length === 0 ? (
            <p className="border-t border-[#ddd] px-1.5 py-[3px] text-[10.5px] text-neutral-600">
              Nothing on the calendar or the lounge programme.
            </p>
          ) : (
            <table className="w-full border-collapse text-[10.5px]">
              <tbody>
                {sheet.events.map((e, i) => (
                  <tr key={`${e.time}-${e.title}-${i}`}>
                    <td
                      className={`${CELL} w-[66px] whitespace-nowrap text-neutral-800 tabular-nums`}
                    >
                      {e.time}
                    </td>
                    <td className={CELL}>
                      {e.title}
                      {e.place ? ` · ${e.place}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <section
          aria-label="Notes"
          className="mb-[9px] break-inside-avoid border border-l-[5px] border-[#bbb]"
        >
          <h3 className="bg-[#fafafa] px-[7px] py-1 text-[10.5px] font-bold uppercase tracking-[0.12em]">
            Notes
          </h3>
          <div className="h-[17px] border-t border-[#ccc]" />
          <div className="h-[17px] border-t border-[#ccc]" />
        </section>
      </div>
    </PrintPage>
  );
}

export function GeneralPage({
  sheet,
  page,
  pages,
  printed,
}: {
  sheet: DailySheet;
  page: number;
  pages: number;
  printed: string;
}) {
  const th =
    "border-b-[1.5px] border-neutral-900 px-1.5 py-1 text-left text-[9.5px] font-semibold tracking-[0.05em] text-neutral-700";
  return (
    <PrintPage
      area="Daily site sheet · General"
      title={`Day ${sheet.number} · ${sheet.longLabel}`}
      label={`Day ${sheet.number} General page`}
      subtitle="Jobs that come up on the day. Write them in, with who and when."
      footer="Hand this to a captain at dinner."
      footerEnd={`Printed ${printed} · page ${page} of ${pages}`}
    >
      <table
        aria-label={`General jobs, day ${sheet.number}`}
        className="w-full border-collapse text-[11px]"
      >
        <thead>
          <tr>
            <th className={`${th} w-[40%]`}>Task</th>
            <th className={`${th} w-[12%]`}>When</th>
            <th className={`${th} w-[22%]`}>Who</th>
            <th className={`${th} w-[20%]`}>Asked by</th>
            <th className={`${th} w-[6%] text-center`}>Done</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: GENERAL_ROWS }, (_, i) => (
            <tr key={i} data-testid="general-row">
              <td className="h-[27px] border-t border-[#ccc]" />
              <td className="border-t border-[#ccc]" />
              <td className="border-t border-[#ccc]" />
              <td className="border-t border-[#ccc]" />
              <td className="border-t border-[#ccc] text-center">
                <Box />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintPage>
  );
}
