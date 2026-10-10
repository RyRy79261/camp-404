import { NextResponse } from "next/server";
import { nextCampDay } from "@camp404/core";
import { NewCampEventInput, Team } from "@camp404/types";
import { newCalendarEventId } from "@/lib/google-calendar";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { testStore } from "@/lib/test-store";
import { campEventsTestStore } from "@/lib/test-store-camp-events";
import { findCampUserByAuthId } from "@/lib/users";

// Puts calendar events straight into the test store, so a Calendar spec and
// the owner's screenshots can stand up a realistic month (past meetings with
// minutes among them) without driving the New event form once per event.
// Test store only. Events the app made go through the store's own write twin
// (the maker must be a captain or a lead of the event's team, as the real
// write requires) and minutes through the meeting note twin (the writer must
// be on the meeting's team, or a captain). An event "made in Google" goes
// straight onto the store's stand-in for Google.

export const runtime = "nodejs";

interface SeedMinutes {
  notes?: string;
  decisions?: string[];
  attendeeAuthUserIds?: string[];
  actionItems?: { text: string; assigneeAuthUserId?: string; due?: string }[];
}

interface SeedEvent {
  /** Made in the app (the default) or made in Google. */
  google?: boolean;
  event: unknown;
  minutes?: SeedMinutes;
}

interface Body {
  makerAuthUserId?: string;
  events?: SeedEvent[];
}

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  if (!isE2ETestMode() || !usesTestStore()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.makerAuthUserId || !Array.isArray(body.events)) {
    return fail("makerAuthUserId and events are required");
  }
  const maker = await findCampUserByAuthId(body.makerAuthUserId);
  if (!maker) return fail(`No user for ${body.makerAuthUserId}`, 404);
  const userId = async (authId: string) =>
    (await findCampUserByAuthId(authId))?.id ?? null;

  const ids: string[] = [];
  /** Each event's meeting note, or null. */
  const noteIds: (string | null)[] = [];
  for (const seed of body.events) {
    const parsed = NewCampEventInput.safeParse(seed.event);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "");
    const e = parsed.data;
    const eventId = newCalendarEventId();
    if (seed.google) {
      const time = (hhmm: string) => ({
        dateTime: `${e.date}T${hhmm}:00+02:00`,
        timeZone: "Africa/Johannesburg",
      });
      testStore.putCalendarEvent({
        id: eventId,
        actorId: maker.id,
        body: {
          summary: e.title,
          ...(e.place ? { location: e.place } : {}),
          start: e.allDay ? { date: e.date } : time(e.start ?? "00:00"),
          end: e.allDay
            ? { date: nextCampDay(e.endDate ?? e.date) }
            : time(e.end ?? e.start ?? "00:00"),
          ...(e.team
            ? { extendedProperties: { private: { camp404Team: e.team } } }
            : {}),
        },
      });
    } else {
      const made = campEventsTestStore.createCampEvent({
        actorId: maker.id,
        kind: e.kind,
        team: e.team,
        title: e.title,
        allDay: e.allDay,
        startDate: e.date,
        endDate: e.allDay ? (e.endDate ?? e.date) : e.date,
        startTime: e.allDay ? null : (e.start ?? null),
        endTime: e.allDay ? null : (e.end ?? null),
        place: e.place,
        description: e.description,
        agenda: e.agenda,
        newEventId: eventId,
      });
      if (!made.ok) return fail(made.error);
    }
    ids.push(eventId);
    noteIds.push(testStore.getMeetingNoteByEvent(eventId)?.id ?? null);

    if (seed.minutes) {
      const m = seed.minutes;
      const attendeeIds: string[] = [];
      for (const authId of m.attendeeAuthUserIds ?? []) {
        const id = await userId(authId);
        if (!id) return fail(`No user for ${authId}`, 404);
        attendeeIds.push(id);
      }
      const actionItems = [];
      for (const item of m.actionItems ?? []) {
        actionItems.push({
          id: null,
          text: item.text,
          assigneeId: item.assigneeAuthUserId
            ? await userId(item.assigneeAuthUserId)
            : null,
          dueOn: item.due ?? null,
        });
      }
      const heldAt = new Date(
        `${e.date}T${e.allDay ? "00:00" : (e.start ?? "00:00")}:00+02:00`,
      );
      const existing = testStore.getMeetingNoteByEvent(eventId);
      const fields = {
        actorId: maker.id,
        title: e.title,
        heldAt,
        calendarEvent: { id: eventId, title: e.title },
        agenda: existing?.agenda ?? e.agenda,
        notes: m.notes ?? "",
        attendeeIds,
        decisions: m.decisions ?? [],
        actionItems,
      };
      const saved = existing
        ? testStore.editMeetingNote({
            ...fields,
            noteId: existing.id,
            version: existing.version,
          })
        : testStore.createMeetingNote({
            ...fields,
            team: e.team && Team.safeParse(e.team).success ? e.team : null,
          });
      if (!saved.ok) return fail(saved.error);
      noteIds[noteIds.length - 1] =
        testStore.getMeetingNoteByEvent(eventId)?.id ?? null;
    }
  }
  return NextResponse.json({ ids, noteIds });
}
