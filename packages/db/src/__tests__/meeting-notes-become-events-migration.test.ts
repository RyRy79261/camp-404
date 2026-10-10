import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";

// 0108 (owner, 2026-10-10, ruling 2A): every meeting note becomes a meeting
// on the camp calendar. A note with no calendar event gets a camp_events
// meeting of its own (its day and camp time, an hour long, its team, title,
// year and writer, not yet on Google), and is linked to it; of two notes
// naming the same Google event the oldest keeps it and the other gets its
// own. A note already linked to one event keeps it. The harness has run every
// migration (0109 too, which makes the link unique), so the test drops that
// index to store the duplicate, then runs the SQL twice.

const SQL = readFileSync(
  new URL(
    "../../migrations/0108_meeting_notes_become_events.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("0108_meeting_notes_become_events", () => {
  const h = useTestDb();

  async function rows<T>(text: string): Promise<T[]> {
    return (await h.client().query<T>(text)).rows;
  }

  async function note(input: {
    title: string;
    team: string | null;
    heldAt: string;
    eventId: string | null;
    createdAt: string;
  }) {
    await h.client().query(
      `INSERT INTO meeting_notes (cycle, team, title, held_at, calendar_event_id, created_at)
       VALUES (2027, $1, $2, $3, $4, $5)`,
      [input.team, input.title, input.heldAt, input.eventId, input.createdAt],
    );
  }

  async function run() {
    for (const statement of SQL.split("--> statement-breakpoint")) {
      await h.client().exec(statement);
    }
  }

  it("turns each unlinked or doubly-linked note into a meeting of its own, once", async () => {
    await h.client().exec(`DROP INDEX meeting_notes_calendar_event_uniq`);
    // 18:30 camp time is 16:30 UTC.
    await note({
      title: "Kitchen kickoff",
      team: "kitchen",
      heldAt: "2026-10-02 16:30:00",
      eventId: null,
      createdAt: "2026-10-02 18:00:00",
    });
    // 23:30 camp time: an hour would cross midnight, so it ends at 23:59.
    await note({
      title: "Late captains",
      team: null,
      heldAt: "2026-10-03 21:30:00",
      eventId: null,
      createdAt: "2026-10-03 22:00:00",
    });
    await note({
      title: "Power sync",
      team: "power_and_lighting",
      heldAt: "2026-10-05 17:00:00",
      eventId: "googleEvent1",
      createdAt: "2026-10-05 18:00:00",
    });
    await note({
      title: "Power sync, again",
      team: "power_and_lighting",
      heldAt: "2026-10-06 17:00:00",
      eventId: "googleEvent1",
      createdAt: "2026-10-06 18:00:00",
    });

    await run();
    await run();

    const notes = await rows<{ title: string; calendar_event_id: string }>(
      `SELECT title, calendar_event_id FROM meeting_notes ORDER BY title`,
    );
    expect(notes.every((n) => n.calendar_event_id)).toBe(true);
    expect(new Set(notes.map((n) => n.calendar_event_id)).size).toBe(4);
    expect(notes.find((n) => n.title === "Power sync")?.calendar_event_id).toBe(
      "googleEvent1",
    );

    const events = await rows<{
      title: string;
      kind: string;
      team: string | null;
      cycle: number;
      all_day: boolean;
      start_date: string;
      start_time: string;
      end_time: string;
      calendar_event_id: string;
      calendar_synced_version: number | null;
    }>(
      `SELECT title, kind, team, cycle, all_day, start_date::text, start_time, end_time,
              calendar_event_id, calendar_synced_version
       FROM camp_events ORDER BY title`,
    );
    expect(events.map((e) => e.title)).toEqual([
      "Kitchen kickoff",
      "Late captains",
      "Power sync, again",
    ]);
    expect(events[0]).toMatchObject({
      kind: "meeting",
      team: "kitchen",
      cycle: 2027,
      all_day: false,
      start_date: "2026-10-02",
      start_time: "18:30",
      end_time: "19:30",
      calendar_synced_version: null,
    });
    expect(events[0]!.calendar_event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(events[1]).toMatchObject({
      team: null,
      start_date: "2026-10-03",
      start_time: "23:30",
      end_time: "23:59",
    });
    expect(events[2]!.start_time).toBe("19:00");

    // Each event is the one its note names.
    for (const event of events) {
      expect(notes.map((n) => n.calendar_event_id)).toContain(
        event.calendar_event_id,
      );
    }
  });

  it("changes nothing when every note already names its own event", async () => {
    await note({
      title: "Linked",
      team: "kitchen",
      heldAt: "2026-10-02 16:30:00",
      eventId: "googleEvent2",
      createdAt: "2026-10-02 18:00:00",
    });
    await run();
    expect(await rows(`SELECT id FROM camp_events`)).toHaveLength(0);
    expect(
      (
        await rows<{ calendar_event_id: string }>(
          `SELECT calendar_event_id FROM meeting_notes`,
        )
      )[0]!.calendar_event_id,
    ).toBe("googleEvent2");
  });
});
