import "server-only";

import {
  CAMP_TIME_ZONE,
  allergyGroups,
  campDayKey,
  clockText,
  dishesFor,
  groupSlotsByTeam,
  loungeDays,
  mealPlanDayOf,
  sheetNames,
  shiftDayLong,
  type SheetAllergy,
  type SheetMeal,
  type SheetTeamSection,
} from "@camp404/core";
import * as db from "@camp404/db/daily-sheet";
import type { SheetAllergyRow } from "@camp404/db/daily-sheet";
import * as shiftsDb from "@camp404/db/shifts";
import { getCampSettings } from "./camp-config";
import { getUpcomingEvents } from "./camp-calendar";
import { CALENDAR_PAGE_RANGE } from "./google-calendar";
import { getKitchenMenu } from "./kitchen-menu";
import { getLoungeProgramme } from "./lounge";
import { buildProgramme, dayItems } from "./lounge-view";
import { getMealPlan } from "./meal-plan";
import { usesTestStore } from "./test-mode";
import { dailySheetTestStore } from "./test-store-daily-sheet";
import { shiftsTestStore } from "./test-store-shifts";

// The daily site sheet (#249), put together for one day or every day of the
// Burn. Called only by the print page, after its team-lead gate: the
// Kitchen's allergy line is safety data (captains and team leads), and the
// page records the read. Everything else on it every member may read
// elsewhere: the shift roster, the menu, the lounge programme, the calendar.
// People are printed by first name only (sheetNames), and nothing else about
// anyone: no shift notes, no hosts, no contact details.

const KITCHEN = "kitchen";

export interface DailySheetEvent {
  /** "14:00", or "All day". */
  time: string;
  title: string;
  place: string | null;
}

export interface DailySheet {
  day: string;
  /** Its place in the Burn: day 1 is the Burn's first day. */
  number: number;
  /** "Wednesday 29 April" */
  longLabel: string;
  sections: SheetTeamSection[];
  /** The Kitchen's dishes per meal: breakfast and dinner, never lunch. */
  meals: { meal: SheetMeal; dishes: string[] }[];
  allergies: SheetAllergy[];
  events: DailySheetEvent[];
}

export interface DailySheets {
  /** Every day of the Burn, for the day picker. */
  days: { day: string; number: number; longLabel: string }[];
  /** The sheets asked for, in day order. */
  sheets: DailySheet[];
  /** Whose allergies were read for these sheets: the page audits them. */
  allergyReaders: string[];
}

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: CAMP_TIME_ZONE,
});

async function readAllergies(cycle: number): Promise<SheetAllergyRow[]> {
  return usesTestStore()
    ? dailySheetTestStore.listSheetAllergies(cycle)
    : db.listSheetAllergies(cycle);
}

/**
 * The sheets asked for: "all" for every Burn day, or one Burn day
 * (YYYY-MM-DD). Anything else picks one: today in the Burn, else the next
 * Burn day, else the first.
 */
export async function getDailySheets(
  asked: string | undefined,
  now: Date = new Date(),
): Promise<DailySheets> {
  const camp = await getCampSettings();
  const cycle = camp.cycleNumber;
  const [roster, burnDays, plan, menu, allergyRows, programme, calendar] =
    await Promise.all([
      usesTestStore()
        ? shiftsTestStore.readShiftRoster(cycle)
        : shiftsDb.readShiftRoster(cycle),
      usesTestStore()
        ? shiftsTestStore.readBurnDays(cycle)
        : shiftsDb.readBurnDays(cycle),
      getMealPlan(),
      getKitchenMenu(),
      readAllergies(cycle),
      getLoungeProgramme(cycle),
      getUpcomingEvents(CALENDAR_PAGE_RANGE),
    ]);

  const days = burnDays.map((day, i) => ({
    day,
    number: i + 1,
    longLabel: shiftDayLong(day),
  }));
  const today = campDayKey(now);
  const one =
    days.find((d) => d.day === asked) ??
    days.find((d) => d.day >= today) ??
    days[0];
  const chosen = asked === "all" ? days : one ? [one] : [];

  const names = sheetNames([
    ...roster.signups.map((s) => ({ userId: s.userId, name: s.name })),
    ...allergyRows.map((a) => ({ userId: a.userId, name: a.name })),
  ]);
  const nameOf = (userId: string) => names.get(userId) ?? "Camp member";
  const allergies = allergyGroups(allergyRows, nameOf);
  const teams = camp.teams.teams.map((t) => ({ key: t.key, label: t.label }));

  const burn =
    camp.current?.burnStart && camp.current.burnEnd
      ? { start: camp.current.burnStart, end: camp.current.burnEnd }
      : null;
  const lounge = loungeDays(burn);
  const loungeView = buildProgramme(programme, lounge);
  const calendarEvents = calendar.status === "ok" ? calendar.events : [];

  const sheets = chosen.map(({ day, number, longLabel }): DailySheet => {
    const meals = dishesFor(
      mealPlanDayOf(day, plan.firstDay, plan.daysOnSite),
      menu.items,
      (id) => menu.recipes[id]?.title ?? null,
    );
    const sections = groupSlotsByTeam({
      day,
      types: roster.types,
      slots: roster.slots,
      signups: roster.signups,
      teams,
      nameOf,
      // The Kitchen shows on a day it has tasks, or a menu: the cooks need
      // the dishes and the allergies either way.
      include: meals.length > 0 ? [KITCHEN] : [],
    });

    const loungeDay = lounge.find((d) => d.date === day)?.day;
    const events: (DailySheetEvent & { sort: number })[] = [
      ...(loungeDay === undefined ? [] : dayItems(loungeView, loungeDay)).map(
        (item) => ({
          time: clockText(item.startMinute),
          title: item.title,
          place: "Lounge",
          // The programme's day runs past midnight: after-midnight items last.
          sort:
            item.startMinute < 6 * 60
              ? item.startMinute + 1440
              : item.startMinute,
        }),
      ),
      ...calendarEvents.flatMap((e) => {
        if (e.allDay) {
          return e.start === day
            ? [{ time: "All day", title: e.title, place: e.location, sort: -1 }]
            : [];
        }
        const at = new Date(e.start);
        if (Number.isNaN(at.getTime()) || campDayKey(at) !== day) return [];
        const time = CLOCK.format(at);
        const [h, m] = time.split(":").map(Number);
        return [
          { time, title: e.title, place: e.location, sort: h! * 60 + m! },
        ];
      }),
    ];
    events.sort((a, b) => a.sort - b.sort);

    return {
      day,
      number,
      longLabel,
      sections,
      meals,
      allergies: sections.some((s) => s.team === KITCHEN) ? allergies : [],
      events: events.map(({ time, title, place }) => ({ time, title, place })),
    };
  });

  const printsAllergies = sheets.some((s) => s.allergies.length > 0);
  return {
    days,
    sheets,
    allergyReaders: printsAllergies ? allergyRows.map((a) => a.userId) : [],
  };
}
